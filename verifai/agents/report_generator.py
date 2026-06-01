"""Agent 5 — Report Generator.

Reads: github_data, ai_detection, coherence_report, skill_verification,
       project_matches, resume_claims
Writes: final_report

Synthesises all prior agent outputs into:
- RecruiterReport: factual overview, timeline flags, activity patterns
- CandidateReport: strengths and constructive feedback
"""

import json
import re
from datetime import datetime, timezone

from core.llm import MODEL, extract_json, get_client
from core.models import (
    ActivityPatterns,
    CandidateReport,
    FinalReport,
    ProjectInterviewQuestion,
    RecruiterReport,
    TimelineFlag,
)
from state import PipelineState

_SYSTEM = """\
You are generating a candidate intelligence report for a technical recruiter.
Your job is to surface evidence and suggest questions — never verdicts.

You have access to:
- resume_claims: structured claims from the resume
- github_data: full GitHub scrape results
- skill_verification: per-skill evidence counts
- project_matches: resume projects vs GitHub repos
- ai_detection: qualitative code signals

Return JSON with exactly this structure:

{
  "overview": "2-3 sentence factual summary of what this GitHub profile shows. Focus on what IS there, not what is missing. No verdict.",

  "timeline_flags": [
    {
      "observation": "Claims Python since 2021 -> First Python commit: March 2024",
      "evidence": "specific dates or data that triggered this",
      "interview_question": "Your first Python commit on GitHub was March 2024, but your resume claims experience since 2021 — can you walk us through your Python work before that? Were these in private repos?"
    }
  ],

  "activity_patterns": {
    "account_age": "GitHub account created: 2024",
    "most_active_languages": ["Python", "Jupyter Notebook"],
    "repo_velocity": "3 repos created in last 20 days",
    "commit_pattern": "neutral observation about commit frequency and distribution only — e.g. 'Commits concentrated in recent months with sparse historical activity'. Never mention AI, suspicious, or fraud."
  },

  "project_interview_questions": [
    {
      "project": "claimed project name from resume",
      "matched_repo": "repo name if matched, or null if not",
      "interview_question": "For matched: reference the specific repo name, commit count, and something observable — e.g. 'In your notes-chatbot repo you have 4 commits over 2 weeks — can you walk me through how you built the RAG pipeline and what embedding model you chose?' For unmatched: 'Your resume mentions [project] but we couldn't find a matching public repo — can you tell us where this code lives and walk us through it?'"
    }
  ],

  "candidate": {
    "candidate": "name or github username",
    "strengths": ["list of genuine strengths observed"],
    "areas_to_address": ["honest, specific areas where evidence was weak"],
    "summary": "2-3 sentence professional summary"
  }
}

project_interview_questions rules:
- One entry per project claim (matched or unmatched)
- Matched projects: reference the actual repo name, commit count, languages — make it specific
- Unmatched projects: ask where the code lives and to walk through the work
- Never skip a project — every project claim gets a question

FORKED REPOS — if a matched repo is marked [FORK] in the context:
- NEVER ask "how did you build this" or "walk me through creating this"
- ALWAYS ask about their specific contribution to the existing codebase
- Reference the fork status explicitly in the question
- Good: "Your [repo] is a fork — what specific changes or additions did you make to the original codebase?"
- Good: "What did you add or modify in [repo], and how does your version differ from the original?"
- Bad: "Walk me through how you built [repo]..." (implies they created it from scratch)

NEVER mention "Jupyter Notebook" in any interview question — it is a file format, not a technology.
If a repo's primary language is Jupyter Notebook, reference Python instead.
Focus questions on: what the project does, specific technical decisions made,
scale or metrics mentioned in the README, or the actual languages and frameworks used.

Rules:
- Never use the words: fraudulent, suspicious, lying, fake, risk, score
- Every timeline flag must have a specific interview question
- Only emit timeline flags when there is real evidence — do not fabricate
- Overview must be neutral and factual
- When evidence is absent, note it may be explained by private or corporate repos

HARD RULE — timeline_flags:
The user context will contain a section "TIMELINE ANALYSIS" that either lists
skills with explicit time claims OR states that none exist.
If the context says "No skills with explicit time claims" → you MUST return
timeline_flags as an empty array []. No exceptions. Do not invent flags.
Only generate a timeline flag for a skill that appears in the TIMELINE ANALYSIS
section AND whose GitHub first-seen date contradicts the claimed timeframe.
"""


def _has_time_claim(skill: str, resume_claims: dict) -> bool:
    """Return True if any resume claim's raw_text explicitly states a timeframe for this skill.

    Matches patterns like: "5 years of Python", "Python since 2019",
    "since 2020 ... React", "3+ years experience in Node.js".
    A bare skill listing ("Python", "React") returns False.
    """
    skill_lower = skill.lower()
    patterns = [
        r'\d+\+?\s*years?\s*(?:of\s*)?' + re.escape(skill_lower),
        re.escape(skill_lower) + r'\s*since\s*\d{4}',
        r'since\s*\d{4}[^.]*' + re.escape(skill_lower),
        r'\d+\+?\s*years?[^.]*' + re.escape(skill_lower),
    ]
    for claim in resume_claims.get("claims", []):
        raw = claim.get("raw_text", "").lower()
        if any(re.search(p, raw, re.IGNORECASE) for p in patterns):
            return True
    return False


def _build_context(state: PipelineState) -> str:
    parts: list[str] = []
    username = state["github_username"]
    parts.append(f"GitHub username: {username}")

    claims = state.get("resume_claims") or {}
    if claims:
        name = claims.get("candidate_name") or username
        parts.append(f"Candidate name: {name}")
        parts.append("\nResume claims:")
        for c in claims.get("claims", []):
            parts.append(f"  [{c['category']}] {c['claim']}")

    github = state.get("github_data") or {}
    parts.append(
        f"\nGitHub: {github.get('total_public_repos')} public repos | "
        f"account since {github.get('account_created_at')} | "
        f"total flags: {github.get('total_flags')}"
    )
    parts.append(f"Languages first seen: {github.get('languages_first_seen')}")
    for repo in github.get("repos", []):
        flags = [f["flag_type"] for f in repo.get("flags", [])]
        fork_label = " [FORK]" if repo.get("is_fork") else ""
        parts.append(
            f"  {repo['repo_name']}{fork_label}: {repo['total_commits']} commits, "
            f"languages={list(repo['languages'].keys())}, "
            f"created={repo.get('created_at', '')[:10]}, flags={flags}"
        )

    skills = state.get("skill_verification") or []
    claims = state.get("resume_claims") or {}
    if skills:
        supported = [s["skill"] for s in skills if s["evidence_found"]]
        no_evidence = [s["skill"] for s in skills if not s["evidence_found"]]
        parts.append(f"\nSkill verification — supported: {supported}")
        parts.append(f"Skill verification — no public evidence: {no_evidence}")

        # Pre-filter: only pass skills that have explicit time claims in the resume
        skills_with_time_claims = [
            s["skill"] for s in skills if _has_time_claim(s["skill"], claims)
        ]
        parts.append("\nTIMELINE ANALYSIS:")
        if skills_with_time_claims:
            parts.append(
                f"Skills with explicit time claims in resume (ONLY these may generate timeline flags): "
                f"{skills_with_time_claims}"
            )
            parts.append(
                "Compare each against languages_first_seen above. "
                "Only flag if GitHub first-seen date contradicts the claimed timeframe."
            )
        else:
            parts.append(
                "No skills with explicit time claims found in resume. "
                "timeline_flags MUST be an empty array []."
            )

    projects = state.get("project_matches") or []
    if projects:
        # Build a lookup so we can annotate matched repos with fork status
        repo_index = {r["repo_name"]: r for r in github.get("repos", [])}
        parts.append("\nProject matches:")
        for p in projects:
            if p["matched_repo"]:
                matched_repo = repo_index.get(p["matched_repo"], {})
                fork_label = " [FORK — ask about contribution, not creation]" if matched_repo.get("is_fork") else ""
                parts.append(
                    f"  '{p['claimed_project']}' → matched: {p['matched_repo']}{fork_label}"
                )
            else:
                parts.append(f"  '{p['claimed_project']}' → {p['flag']}: {p['note']}")

    ai = state.get("ai_detection") or {}
    if ai:
        parts.append(f"\nAI detection: overall={ai.get('overall_ai_likelihood'):.0%} | {ai.get('summary')}")

    coherence = state.get("coherence_report") or {}
    if coherence:
        parts.append(f"\nCoherence summary: {coherence.get('summary')}")
        for check in coherence.get("checks", []):
            parts.append(f"  [{check['verdict'].upper()}] {check['claim']}")

    return "\n".join(parts)


def generate_report(state: PipelineState) -> PipelineState:
    """Entry point called by the LangGraph pipeline."""
    state["current_agent"] = "report_generator"

    if not state.get("github_data"):
        state["errors"].append("report_generator: no github_data, cannot generate report.")
        return state

    client = get_client()
    username = state["github_username"]
    candidate_name = (state.get("resume_claims") or {}).get("candidate_name") or username

    try:
        resp = client.messages.create(
            model=MODEL,
            max_tokens=4096,
            system=_SYSTEM,
            messages=[{"role": "user", "content": _build_context(state)}],
        )
        data = json.loads(extract_json(resp.content[0].text))

        ap = data.get("activity_patterns", {})
        c_data = data.get("candidate", {})

        result = FinalReport(
            recruiter=RecruiterReport(
                overview=data.get("overview", ""),
                timeline_flags=[
                    TimelineFlag(**f) for f in data.get("timeline_flags", [])
                ],
                activity_patterns=ActivityPatterns(
                    account_age=ap.get("account_age", ""),
                    most_active_languages=ap.get("most_active_languages", []),
                    repo_velocity=ap.get("repo_velocity", ""),
                    commit_pattern=ap.get("commit_pattern", ""),
                ),
                project_interview_questions=[
                    ProjectInterviewQuestion(**q)
                    for q in data.get("project_interview_questions", [])
                ],
            ),
            candidate=CandidateReport(
                candidate=c_data.get("candidate", candidate_name),
                strengths=c_data.get("strengths", []),
                areas_to_address=c_data.get("areas_to_address", []),
                summary=c_data.get("summary", ""),
            ),
            generated_at=datetime.now(timezone.utc),
        )
        state["final_report"] = result.model_dump(mode="json")
    except Exception as exc:
        state["errors"].append(f"report_generator: {exc}")

    return state
