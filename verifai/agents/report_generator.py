"""Agent 5 — Report Generator.

Reads: github_data, ai_detection, coherence_report, skill_verification,
       project_matches, resume_claims
Writes: final_report

Synthesises all prior agent outputs into:
- RecruiterReport: factual overview, timeline flags, activity patterns
- CandidateReport: strengths and constructive feedback
"""

import json
from datetime import datetime, timezone

from core.llm import MODEL, get_client
from core.models import (
    ActivityPatterns,
    CandidateReport,
    FinalReport,
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
      "interview_question": "Walk me through your Python work before 2024 — were these in private repos?"
    }
  ],

  "activity_patterns": {
    "account_age": "GitHub account created: 2024",
    "most_active_languages": ["Python", "Jupyter Notebook"],
    "repo_velocity": "3 repos created in last 20 days",
    "commit_pattern": "neutral observation about commit frequency and distribution only — e.g. 'Commits concentrated in recent months with sparse historical activity'. Never mention AI, suspicious, or fraud."
  },

  "candidate": {
    "candidate": "name or github username",
    "strengths": ["list of genuine strengths observed"],
    "areas_to_address": ["honest, specific areas where evidence was weak"],
    "summary": "2-3 sentence professional summary"
  }
}

Rules:
- Never use the words: fraudulent, suspicious, lying, fake, risk, score
- Every timeline flag must have a specific interview question
- Only emit timeline flags when there is real evidence — do not fabricate
- If no timeline flags exist, return an empty array
- Overview must be neutral and factual
- When evidence is absent, note it may be explained by private or corporate repos

CRITICAL RULE FOR timeline_flags:
Only generate a flag if the resume EXPLICITLY claims a skill for a specific time
period or number of years (e.g. "5 years of Python", "Python since 2019").
If the resume just lists "Python" with no timeframe → NO flag.
Only flag when the resume states a duration or start year AND GitHub contradicts it.
No explicit resume time claim = no timeline flag for that skill.
"""


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
        parts.append(
            f"  {repo['repo_name']}: {repo['total_commits']} commits, "
            f"languages={list(repo['languages'].keys())}, "
            f"created={repo.get('created_at', '')[:10]}, flags={flags}"
        )

    skills = state.get("skill_verification") or []
    if skills:
        supported = [s["skill"] for s in skills if s["evidence_found"]]
        no_evidence = [s["skill"] for s in skills if not s["evidence_found"]]
        parts.append(f"\nSkill verification — supported: {supported}")
        parts.append(f"Skill verification — no public evidence: {no_evidence}")

    projects = state.get("project_matches") or []
    if projects:
        parts.append("\nProject matches:")
        for p in projects:
            if p["matched_repo"]:
                parts.append(f"  '{p['claimed_project']}' → matched: {p['matched_repo']}")
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
        resp = client.chat.completions.create(
            model=MODEL,
            response_format={"type": "json_object"},
            messages=[
                {"role": "system", "content": _SYSTEM},
                {"role": "user", "content": _build_context(state)},
            ],
        )
        data = json.loads(resp.choices[0].message.content)

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
