"""Agent 5 — Report Generator.

Synthesises all prior agent outputs into dual reports:
- RecruiterReport: risk level, red flags, recommendation
- CandidateReport: strengths and honest feedback
"""

import json
from datetime import datetime, timezone

from core.llm import MODEL, get_client
from core.models import (
    CandidateReport,
    FinalReport,
    FlagEntry,
    RecruiterReport,
)
from state import PipelineState

_SYSTEM = """\
You are a senior technical recruiter writing a verification report for a candidate.

You will receive GitHub scrape data, AI code detection results, and a coherence report
comparing the candidate's resume claims against their actual GitHub activity.

Generate two reports:

1. Recruiter-facing: frank risk assessment
2. Candidate-facing: constructive, professional feedback (assume they will read it)

Return JSON with exactly this shape:
{
  "recruiter": {
    "candidate": "name or github username",
    "overall_risk": "low | medium | high",
    "red_flags": [
      {"flag_type": "string", "description": "string", "evidence": "string"}
    ],
    "summary": "3-4 sentence frank assessment",
    "recommendation": "proceed | proceed_with_caution | reject"
  },
  "candidate": {
    "candidate": "name or github username",
    "strengths": ["list of genuine strengths observed"],
    "areas_to_address": ["honest, specific areas where evidence was weak"],
    "summary": "2-3 sentence professional summary"
  }
}

Base red_flags on: GitHub flags, AI likelihood scores, contradicted resume claims.
Be specific — reference repo names, dates, languages, commit counts.
overall_risk: high if AI likelihood >0.7 OR >2 claims contradicted OR multiple FORK/NO_COMMIT flags.
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
    parts.append(f"\nGitHub: {github.get('total_public_repos')} public repos | "
                 f"account since {github.get('account_created_at')} | "
                 f"total flags: {github.get('total_flags')}")
    for repo in github.get("repos", []):
        flags = [f["flag_type"] for f in repo.get("flags", [])]
        parts.append(f"  {repo['repo_name']}: {repo['total_commits']} commits, "
                     f"languages={list(repo['languages'].keys())}, flags={flags}")

    ai = state.get("ai_detection") or {}
    if ai:
        parts.append(f"\nAI detection: overall={ai.get('overall_ai_likelihood'):.0%} | {ai.get('summary')}")

    coherence = state.get("coherence_report") or {}
    if coherence:
        parts.append(f"\nCoherence score: {coherence.get('overall_score'):.0%} | {coherence.get('summary')}")
        for check in coherence.get("checks", []):
            parts.append(f"  [{check['verdict'].upper()}] {check['claim']}")

    return "\n".join(parts)


def generate_report(state: PipelineState) -> PipelineState:
    state["current_agent"] = "report_generator"

    if not state.get("github_data"):
        state["errors"].append("report_generator: no github_data, cannot generate report.")
        return state

    client = get_client()
    context = _build_context(state)
    username = state["github_username"]
    candidate_name = (state.get("resume_claims") or {}).get("candidate_name") or username

    try:
        resp = client.chat.completions.create(
            model=MODEL,
            response_format={"type": "json_object"},
            messages=[
                {"role": "system", "content": _SYSTEM},
                {"role": "user", "content": context},
            ],
        )
        data = json.loads(resp.choices[0].message.content)

        r_data = data["recruiter"]
        c_data = data["candidate"]

        result = FinalReport(
            recruiter=RecruiterReport(
                candidate=r_data.get("candidate", candidate_name),
                overall_risk=r_data.get("overall_risk", "medium"),
                red_flags=[FlagEntry(**f) for f in r_data.get("red_flags", [])],
                summary=r_data.get("summary", ""),
                recommendation=r_data.get("recommendation", "proceed_with_caution"),
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
