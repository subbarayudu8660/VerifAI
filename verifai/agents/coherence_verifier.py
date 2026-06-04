"""Agent 4 — Coherence Verifier.

Reads: resume_claims, github_data, ai_detection
Writes: skill_verification, project_matches, coherence_report

Three jobs (experience section always skipped — corporate code lives in private repos):
1. Per-skill evidence check against GitHub repos using language matching + alias map.
2. Per-project claim matching against repos using keyword overlap.
3. LLM verification of project/skill claims → verdicts + interview questions for contradictions.
"""

import json
import re

from core.constants import (
    CLASSIFIED_HINTS,
    CORPORATE_HINTS,
    PROJECT_MATCH_THRESHOLD,
    SKILL_ALIASES,
    SKIP_SKILLS,
    STOPWORDS,
)
from core.llm import MODEL, get_client
from core.models import CoherenceCheck, CoherenceReport
from state import PipelineState


def _extract_json(text: str) -> dict:
    """Extract JSON from LLM response, handling markdown fences and malformed output."""
    text = text.strip()
    if text.startswith("```"):
        text = re.sub(r"^```(?:json)?\n?", "", text)
        text = re.sub(r"\n?```$", "", text)
        text = text.strip()
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        pass
    match = re.search(r"\{.*\}", text, re.DOTALL)
    if match:
        try:
            return json.loads(match.group())
        except json.JSONDecodeError:
            pass
    return {}


# ---------------------------------------------------------------------------
# Skill matching
# ---------------------------------------------------------------------------

def _split_skills(claim_str: str) -> list[str]:
    """Split a comma/slash-grouped skill string into individual technologies."""
    parts = re.split(r"[,/|•·]+", claim_str)
    return [p.strip() for p in parts if p.strip() and len(p.strip()) > 1]


def _skill_confidence(n_repos: int, total_commits: int) -> float:
    """Map repo count + commit count to a confidence score (0.0–1.0)."""
    if n_repos == 0:
        return 0.0
    if n_repos == 1 and total_commits < 10:
        return 0.3
    if n_repos <= 2 and 10 <= total_commits <= 50:
        return 0.55
    if n_repos >= 2 and 50 < total_commits <= 200:
        return 0.75
    if n_repos >= 3 and 200 < total_commits <= 500:
        return 0.90
    if n_repos >= 3 and total_commits > 500:
        return 0.95
    return 0.3


def _skill_in_repo(skill_lower: str, repo: dict) -> bool:
    """Return True if a repo provides evidence of the given skill.

    Priority order:
    1. Dependency files (requirements.txt / package.json / pyproject.toml) — most reliable
    2. GitHub language API — strong for language-level skills
    3. README, description, repo name — supporting text evidence
    4. Alias match — language alias + text confirmation (prevents over-counting)
    """
    # Priority 1 — dependency files
    deps = repo.get("dependencies") or {}
    all_deps = deps.get("python", []) + deps.get("javascript", [])
    if all_deps:
        if any(skill_lower == dep or skill_lower in dep or dep in skill_lower for dep in all_deps):
            return True
        aliases = SKILL_ALIASES.get(skill_lower, [])
        if any(alias in dep or dep in alias for alias in aliases for dep in all_deps):
            return True

    # Priority 2 — language API
    repo_langs = [l.lower() for l in repo.get("languages", {})]
    if any(skill_lower == l for l in repo_langs):
        return True

    # Priority 3 — text: README, description, repo name
    readme = repo.get("readme_text", "").lower()
    desc = (repo.get("description") or "").lower()
    name = repo["repo_name"].lower().replace("-", " ").replace("_", " ")

    if skill_lower in readme or skill_lower in desc or skill_lower in name:
        return True

    # Priority 4 — alias match requires both language match AND text confirmation
    aliases = SKILL_ALIASES.get(skill_lower, [])
    if aliases:
        repo_langs_str = " ".join(repo_langs)
        text = f"{readme} {desc} {name}"
        lang_matches = any(alias in repo_langs_str for alias in aliases)
        text_confirms = any(alias in text for alias in aliases)
        if lang_matches and text_confirms:
            return True

    return False


def _extract_level(raw_text: str) -> str:
    raw_lower = raw_text.lower()
    for level in ("expert", "senior", "advanced", "proficient", "intermediate", "familiar", "beginner"):
        if level in raw_lower:
            return level.capitalize()
    return "Listed"


def _check_skills(claims: dict, github: dict) -> list[dict]:
    """Return a list of per-skill evidence entries, sorted by confidence ascending."""
    skill_claims = [
        c for c in claims.get("claims", [])
        if c["category"] == "skill" and not c.get("skip_github_check", False)
    ]
    repos = github.get("repos", [])
    seen: dict[str, dict] = {}

    for claim in skill_claims:
        for skill in _split_skills(claim["claim"]):
            skill_lower = skill.lower()
            if skill_lower in SKIP_SKILLS:
                continue

            matched_repos = [
                {"repo": r["repo_name"], "commits": r["total_commits"]}
                for r in repos if _skill_in_repo(skill_lower, r)
            ]
            total_commits = sum(r["commits"] for r in matched_repos)
            confidence = _skill_confidence(len(matched_repos), total_commits)

            if confidence <= 0.3 and any(
                w in claim["raw_text"].lower()
                for w in ("expert", "senior", "lead", "advanced")
            ):
                confidence = max(0.0, confidence - 0.2)

            matched_names = {m["repo"] for m in matched_repos}
            last_seen = max(
                (r["last_commit_date"] for r in repos
                 if r["repo_name"] in matched_names and r.get("last_commit_date")),
                default=None,
            )

            entry = {
                "skill": skill,
                "claimed_level": _extract_level(claim["raw_text"]),
                "evidence_found": len(matched_repos) > 0,
                "evidence_repos": [m["repo"] for m in matched_repos],
                "first_seen": github.get("languages_first_seen", {}).get(skill),
                "last_seen": last_seen,
                "total_commits_in_skill": total_commits,
                "confidence": round(confidence, 2),
            }
            if skill_lower not in seen or entry["confidence"] > seen[skill_lower]["confidence"]:
                seen[skill_lower] = entry

    return sorted(seen.values(), key=lambda x: x["confidence"])


# ---------------------------------------------------------------------------
# Project matching
# ---------------------------------------------------------------------------

def _classify_unmatched(claim: str) -> tuple[str, str]:
    """Classify a project claim that has no matching public repo.

    Checks classified/government signals first, then corporate signals.
    Only falls through to CLAIM_NO_EVIDENCE if neither set matches.
    """
    lower = claim.lower()

    if any(h in lower for h in CLASSIFIED_HINTS):
        return (
            "LIKELY_PRIVATE_CLASSIFIED",
            "Classified/government work — verify directly with candidate.",
        )
    if any(h in lower for h in CORPORATE_HINTS):
        return (
            "LIKELY_PRIVATE_CORPORATE",
            "Corporate/private work — likely in a private repo. Ask candidate directly.",
        )
    return ("CLAIM_NO_EVIDENCE", "No matching repo found.")


_TECH_KEYWORDS = {
    "react", "node", "express", "mongodb", "python", "django", "fastapi",
    "flask", "typescript", "javascript", "swift", "kotlin", "java", "c++",
    "postgres", "mysql", "redis", "docker", "kubernetes", "aws", "gcp",
    "azure", "pytorch", "tensorflow", "langchain", "nextjs", "vue", "angular",
}


def _keyword_overlap(claim: str, repo_name: str, repo_desc: str, readme: str) -> float:
    """Score how well a project claim matches a repo using keyword set intersection.

    Score = |claim_keywords ∩ repo_keywords| / |claim_keywords|
    """
    def keywords(text: str) -> set[str]:
        words = re.findall(r'\b\w+\b', text.lower())
        return {w for w in words if len(w) > 3 and w not in STOPWORDS}

    claim_words = keywords(claim)
    repo_text = f"{repo_name} {repo_desc} {readme[:500]}".replace("-", " ").replace("_", " ")
    repo_words = keywords(repo_text)

    if not claim_words:
        return 0.0
    return len(claim_words & repo_words) / len(claim_words)


def _extract_tech_from_claim(claim: str) -> set[str]:
    """Return tech keywords mentioned in a project claim."""
    claim_lower = claim.lower()
    return {tech for tech in _TECH_KEYWORDS if tech in claim_lower}


def _repo_has_tech(repo: dict, techs: set[str]) -> bool:
    """Return True if the repo's text/languages mention any of the required techs.

    If the claim names no specific tech, all repos pass (no false negatives).
    """
    if not techs:
        return True
    repo_text = (
        f"{repo.get('readme_text', '')} "
        f"{repo.get('description', '')} "
        f"{' '.join(repo.get('languages', {}).keys())}"
    ).lower()
    return any(tech in repo_text for tech in techs)


def _check_projects(claims: dict, github: dict, username: str) -> list[dict]:
    """Return a list of per-project match results."""
    project_claims = [
        c for c in claims.get("claims", [])
        if c["category"] == "project" and not c.get("skip_github_check", False)
    ]
    repos = github.get("repos", [])
    results = []

    for claim in project_claims:
        claim_text = claim["claim"]
        claim_techs = _extract_tech_from_claim(claim_text)
        best_match = None
        best_score = 0.0

        for repo in repos:
            if not _repo_has_tech(repo, claim_techs):
                continue
            score = _keyword_overlap(
                claim_text,
                repo["repo_name"],
                repo.get("description") or "",
                repo.get("readme_text") or "",
            )
            if score > best_score:
                best_score = score
                best_match = repo["repo_name"]

        if best_score >= PROJECT_MATCH_THRESHOLD:
            results.append({
                "claimed_project": claim["claim"],
                "matched_repo": best_match,
                "match_confidence": round(best_score, 2),
                "match_reason": "keyword overlap",
                "flag": None,
                "note": None,
                "github_username": username,
            })
        else:
            flag, note = _classify_unmatched(claim["claim"])
            results.append({
                "claimed_project": claim["claim"],
                "matched_repo": None,
                "match_confidence": 0.0,
                "match_reason": None,
                "flag": flag,
                "note": note,
                "github_username": username,
            })

    return results


# ---------------------------------------------------------------------------
# LLM claim verification
# ---------------------------------------------------------------------------

_SYSTEM = """\
You are a senior technical recruiter verifying resume claims against GitHub activity.
Only verify claims from the projects and skills sections. Never verify experience/job claims.

TEAM CLAIMS ("led team", "collaborated", "managed engineers") from projects section:
- If ALL repos have 0 co-contributors → "contradicted", flag TEAM_CLAIM_SOLO_REPOS

LANGUAGE EXPERIENCE CLAIMS ("X years of Python", "proficient in React since 2020"):
- Check languages_first_seen; if first seen within 2 years → "contradicted", flag FIRST_COMMIT_IN_LANGUAGE

PROJECT CLAIMS ("built X", "created Y"):
- If no matching repo → "unverifiable" (private repos may exist)

SKILL CLAIMS: "supported" if language appears in any repo, else "unverifiable"

AI CODE: If repo ai_likelihood >= 0.7, note in contradicting_evidence for project claims on that repo.

Return JSON:
{
  "checks": [
    {
      "claim": "original claim",
      "verdict": "supported | contradicted | unverifiable",
      "supporting_evidence": ["specific strings with repo names/dates/counts"],
      "contradicting_evidence": ["specific strings"],
      "confidence": 0.0-1.0
    }
  ],
  "summary": "2-3 sentence frank assessment. Note that experience claims were excluded.",
  "interview_questions": ["one sharp question per contradicted claim only"]
}
"""


def _build_llm_context(state: PipelineState) -> str:
    parts: list[str] = []
    claims = state.get("resume_claims") or {}

    parts.append("=== RESUME CLAIMS (experience items excluded) ===")
    for c in claims.get("claims", []):
        if c.get("skip_github_check"):
            continue
        parts.append(f"[{c['category'].upper()}] {c['claim']}")

    github = state.get("github_data") or {}
    parts.append("\n=== GITHUB DATA ===")
    parts.append(f"Account created: {github.get('account_created_at')}")
    parts.append(f"Total public repos: {github.get('total_public_repos')}")
    parts.append(f"Languages first seen: {github.get('languages_first_seen')}")
    for repo in github.get("repos", []):
        parts.append(
            f"\nRepo: {repo['repo_name']} | commits: {repo['total_commits']} "
            f"| languages: {list(repo['languages'].keys())} "
            f"| co-contributors: {repo['co_contributor_count']} "
            f"| fork: {repo['is_fork']}"
        )

    ai = state.get("ai_detection") or {}
    if ai:
        parts.append("\n=== AI CODE DETECTION ===")
        for r in ai.get("repos", []):
            if r["ai_likelihood"] >= 0.5:
                parts.append(f"{r['repo_name']}: {r['ai_likelihood']:.0%} — {r['reasoning']}")

    return "\n".join(parts)


# ---------------------------------------------------------------------------
# Agent entry point
# ---------------------------------------------------------------------------

def verify_coherence(state: PipelineState) -> PipelineState:
    """Entry point called by the LangGraph pipeline."""
    state["current_agent"] = "coherence_verifier"

    if not state.get("resume_claims"):
        state["skipped"].append("coherence_verifier: no resume claims — skipping cross-reference")
        return state
    if not state.get("github_data"):
        state["errors"].append("coherence_verifier: no github_data, skipping.")
        return state

    claims = state["resume_claims"]
    github = state["github_data"]
    username = state["github_username"]

    state["skill_verification"] = _check_skills(claims, github)
    state["project_matches"] = _check_projects(claims, github, username)

    client = get_client()
    try:
        resp = client.messages.create(
            model=MODEL,
            max_tokens=4096,
            system=_SYSTEM,
            messages=[{"role": "user", "content": _build_llm_context(state)}],
        )
        data = _extract_json(resp.content[0].text)
        result = CoherenceReport(
            checks=[CoherenceCheck(**c) for c in data.get("checks", [])],
            summary=data.get("summary", ""),
            interview_questions=data.get("interview_questions", []),
        )
        state["coherence_report"] = result.model_dump(mode="json")
    except Exception as exc:
        state["errors"].append(f"coherence_verifier: {exc}")

    return state
