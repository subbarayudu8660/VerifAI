"""Agent 4 — Coherence Verifier.

Three jobs (experience claims skipped entirely — corporate code lives in private repos):
1. Per-skill confidence scoring against GitHub activity (skills section only).
2. Per-project claim matching against repos (projects section only).
3. LLM claim verification with interview questions (projects + skills only).
"""

import json
import re

from core.llm import MODEL, get_client
from core.models import CoherenceCheck, CoherenceReport
from state import PipelineState

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

# Dev tools / environment skills — not demonstrable on GitHub, skip entirely
_SKIP_SKILLS = {
    "git", "github", "vs code", "vscode", "visual studio", "visual studio code",
    "jupyter", "jupyter notebook", "virtualenv", "virtual environments",
    "terminal", "linux", "windows", "macos", "unix", "bash", "zsh",
    "agile", "scrum", "jira", "confluence", "slack", "notion", "trello",
}

_PRIVATE_HINTS = [
    "dod", "darpa", "mitre", "classified", "defense", "government", "itar",
    "secret", "federal", "lockheed", "raytheon", "booz", "palantir", "saic",
]
_CLASSIFIED_HINTS = ["classified", "secret", "top secret", "itar", "dod", "darpa", "satellite"]


def _split_skills(claim_str: str) -> list[str]:
    """Split a potentially comma-grouped skill string into individual technologies."""
    parts = re.split(r"[,/|•·]+", claim_str)
    return [p.strip() for p in parts if p.strip() and len(p.strip()) > 1]


def _skill_confidence(n_repos: int, total_commits: int) -> float:
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
    """Check language breakdown, README text, description, and repo name."""
    if any(skill_lower == l.lower() for l in repo.get("languages", {})):
        return True
    if any(skill_lower in l.lower() for l in repo.get("languages", {})):
        return True
    readme = repo.get("readme_text", "").lower()
    if readme and skill_lower in readme:
        return True
    desc = (repo.get("description") or "").lower()
    if skill_lower in desc:
        return True
    name = repo["repo_name"].lower().replace("-", " ").replace("_", " ")
    if skill_lower in name:
        return True
    return False


def _check_skills(claims: dict, github: dict) -> list[dict]:
    skill_claims = [
        c for c in claims.get("claims", [])
        if c["category"] == "skill" and not c.get("skip_github_check", False)
    ]
    repos = github.get("repos", [])
    seen: dict[str, dict] = {}

    for claim in skill_claims:
        # Safety-net split in case LLM still grouped skills
        individual_skills = _split_skills(claim["claim"])

        for skill in individual_skills:
            skill_lower = skill.lower()

            # Skip non-verifiable tool/environment skills
            if skill_lower in _SKIP_SKILLS:
                continue

            matched_repos: list[dict] = []
            for repo in repos:
                if _skill_in_repo(skill_lower, repo):
                    matched_repos.append({"repo": repo["repo_name"], "commits": repo["total_commits"]})

            total_commits = sum(r["commits"] for r in matched_repos)
            confidence = _skill_confidence(len(matched_repos), total_commits)

            raw_lower = claim["raw_text"].lower()
            if confidence <= 0.3 and any(w in raw_lower for w in ("expert", "senior", "lead", "advanced")):
                confidence = max(0.0, confidence - 0.2)

            first_seen = github.get("languages_first_seen", {}).get(skill, None)
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
                "first_seen": first_seen,
                "last_seen": last_seen,
                "total_commits_in_skill": total_commits,
                "confidence": round(confidence, 2),
            }
            # Dedup: keep highest confidence entry per skill
            key = skill_lower
            if key not in seen or entry["confidence"] > seen[key]["confidence"]:
                seen[key] = entry

    return sorted(seen.values(), key=lambda x: x["confidence"])


def _extract_level(raw_text: str) -> str:
    raw_lower = raw_text.lower()
    for level in ("expert", "senior", "advanced", "proficient", "intermediate", "familiar", "beginner"):
        if level in raw_lower:
            return level.capitalize()
    return "Listed"


# ---------------------------------------------------------------------------
# Project matching
# ---------------------------------------------------------------------------

def _company_names(claims: dict) -> list[str]:
    """Extract employer names from experience claims for private-repo detection."""
    names = []
    for c in claims.get("claims", []):
        if c.get("company"):
            names.append(c["company"].lower())
        # Also pull from claim text for experience claims
        if c.get("source_section") == "experience":
            names.append(c["claim"].lower())
    return names


def _classify_unmatched(project_text: str, company_names: list[str]) -> tuple[str, str]:
    """Return (flag, note) for a project with no public repo match."""
    lower = project_text.lower()

    if any(h in lower for h in _CLASSIFIED_HINTS):
        return (
            "LIKELY_PRIVATE_CLASSIFIED",
            "Classified/government work — verify directly with candidate.",
        )

    if any(name in lower for name in company_names if len(name) > 3):
        return (
            "LIKELY_PRIVATE_CORPORATE",
            "Work done at a named employer — likely in private/corporate repo. Ask candidate directly.",
        )

    # Generic corporate hint words
    if any(w in lower for w in ("internship", "intern", "contracted", "corporation", "inc.", "llc")):
        return (
            "LIKELY_PRIVATE_CORPORATE",
            "Corporate/contracted work — likely in private repo. Ask candidate directly.",
        )

    return ("CLAIM_NO_EVIDENCE", "No matching public repo found.")


def _check_projects(claims: dict, github: dict, username: str) -> list[dict]:
    project_claims = [
        c for c in claims.get("claims", [])
        if c["category"] == "project" and not c.get("skip_github_check", False)
    ]
    repos = github.get("repos", [])
    company_names = _company_names(claims)
    results = []

    tech_hints = {
        "ios": ["swift", "objective-c"],
        "android": ["kotlin", "java"],
        "ml": ["python", "jupyter notebook"],
        "llm": ["python"],
        "ai": ["python"],
        "web": ["javascript", "typescript", "html", "css"],
        "api": ["python", "javascript", "go", "ruby"],
        "data": ["python", "r", "jupyter notebook"],
    }

    for claim in project_claims:
        project_text = claim["claim"].lower()
        best_match = None
        best_score = 0.0
        best_reason = None

        for repo in repos:
            score = 0.0
            reasons = []
            repo_words = set(
                (repo["repo_name"] + " " + (repo.get("description") or ""))
                .lower().replace("-", " ").replace("_", " ").split()
            )
            project_words = [w for w in project_text.split() if len(w) > 3]

            overlap = sum(1 for w in project_words if w in repo_words)
            if overlap:
                score += min(0.5, overlap * 0.15)
                reasons.append("repo name similarity")

            for hint, langs in tech_hints.items():
                if hint in project_text:
                    repo_langs = [l.lower() for l in repo.get("languages", {})]
                    if any(l in repo_langs for l in langs):
                        score += 0.25
                        reasons.append(f"{hint} language stack matched")
                        break

            if score > best_score:
                best_score = score
                best_match = repo["repo_name"]
                best_reason = ", ".join(reasons) if reasons else None

        if best_score >= 0.25:
            results.append({
                "claimed_project": claim["claim"],
                "matched_repo": best_match,
                "match_confidence": round(best_score, 2),
                "match_reason": best_reason,
                "flag": None,
                "note": None,
                "github_username": username,
            })
        else:
            flag, note = _classify_unmatched(project_text, company_names)
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
# LLM claim verification (projects + skills only, never experience)
# ---------------------------------------------------------------------------

_SYSTEM = """\
You are a senior technical recruiter verifying resume claims against GitHub activity.
IMPORTANT: Only verify claims from the projects and skills sections. Never verify experience/job claims — those involve corporate private repos.

TEAM CLAIMS ("led team", "collaborated", "managed engineers") from projects section:
- If ALL repos have 0 co-contributors → "contradicted", flag TEAM_CLAIM_SOLO_REPOS

LANGUAGE EXPERIENCE CLAIMS ("X years of Python", "proficient in React since 2020"):
- Check languages_first_seen; if first seen within 2 years → "contradicted", flag FIRST_COMMIT_IN_LANGUAGE

PROJECT CLAIMS ("built X", "created Y"):
- If no matching repo → "unverifiable" (private repos may exist)

SKILL CLAIMS: "supported" if language in any repo, else "unverifiable"

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
  "overall_score": 0.0-1.0,
  "summary": "2-3 sentence frank assessment. Note that experience claims were excluded from GitHub verification.",
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
    state["current_agent"] = "coherence_verifier"

    if not state.get("resume_claims"):
        state["errors"].append("coherence_verifier: no resume_claims, skipping.")
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
        resp = client.chat.completions.create(
            model=MODEL,
            response_format={"type": "json_object"},
            messages=[
                {"role": "system", "content": _SYSTEM},
                {"role": "user", "content": _build_llm_context(state)},
            ],
        )
        data = json.loads(resp.choices[0].message.content)
        result = CoherenceReport(
            checks=[CoherenceCheck(**c) for c in data.get("checks", [])],
            overall_score=float(data.get("overall_score", 0.0)),
            summary=data.get("summary", ""),
            interview_questions=data.get("interview_questions", []),
        )
        state["coherence_report"] = result.model_dump(mode="json")
    except Exception as exc:
        state["errors"].append(f"coherence_verifier: {exc}")

    return state
