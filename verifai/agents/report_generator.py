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

from core.llm import MODEL, get_client
from core.models import (
    ActivityPatterns,
    CandidateReport,
    FinalReport,
    ProjectInterviewQuestion,
    RecruiterBrief,
    RecruiterReport,
    StrongestWork,
)
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
  "recruiter_brief": {
    "one_liner": "Single dynamic sentence summarizing activity and claim verification. Vary structure based on actual findings. Let the actual numbers drive the sentence structure. Examples: '19 repos across 5 months, all 3 resume projects publicly visible' OR '6 repos in 2 weeks, 0 of 3 resume projects found' OR '14 months of steady activity, 2 of 4 projects confirmed'. Never use the same template twice conceptually.",

    "strongest_work": {
      "repo_name": "name of the repo with most substantial evidence of sustained effort, or null if none qualifies",
      "summary": "Two sentences max. Factual spotlight: commit count, timespan, languages, maintenance status. Example: 'VerifAI — 21 commits over 6 weeks, multi-language (Python/JS/HTML), actively maintained. This is the candidate's most substantial public project.' If no repo qualifies (all single-commit uploads), write: 'No project with sustained development history found.' and set repo_name to null."
    },

    "confirmed_skills_line": "One sentence. Format: '[Confirmed skills] confirmed in code. [Unconfirmed skills] listed on resume but not found in public repos.' Example: 'Python, Streamlit, and Requests confirmed in code. Java, pandas, scikit-learn, and 7 others listed on resume but not found in public repos.' If no resume was provided, describe the languages observed in GitHub only.",

    "profile_consistency": "One factual sentence comparing what languages/skills appear in GitHub activity vs what is claimed on resume. No verdict, no judgment word like 'inconsistent' or 'suspicious'. Just plain observation. Example: 'GitHub active in Python, HTML, JavaScript. Resume lists Java, Julia, scikit-learn — these appear on the resume only.' If no resume, note what the GitHub profile shows."
  },

  "overview": "2-3 sentence factual summary of what this GitHub profile shows. Focus on what IS there, not what is missing. No verdict.",

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

recruiter_brief rules:
- Every field must be grounded in actual data from this candidate — never generic boilerplate
- This section is read by a NON-TECHNICAL recruiter in under 30 seconds — no jargon, no technical terms without explanation
- Make every sentence sound specific to this candidate's actual numbers and findings

project_interview_questions rules:
Generate a MAXIMUM of 5 interview questions total. Priority order:
1. One question per matched project from the resume (most commits first)
2. One question for the most interesting/high-commit repo on GitHub (if slots remain)
3. Fill remaining slots with the most relevant unmatched project claims

Never exceed 5 questions total. Quality over quantity.
Matched projects: reference the actual repo name, commit count, languages — make it specific.
Unmatched projects: ask where the code lives and to walk through the work.

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
- Overview must be neutral and factual
- When evidence is absent, note it may be explained by private or corporate repos
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
        fork_label = " [FORK]" if repo.get("is_fork") else ""
        parts.append(
            f"  {repo['repo_name']}{fork_label}: {repo['total_commits']} commits, "
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
        state["current_agent"] = "complete"
        return state

    client = get_client()
    username = state["github_username"]
    candidate_name = (state.get("resume_claims") or {}).get("candidate_name") or username

    try:
        resp = client.messages.create(
            model=MODEL,
            max_tokens=6000,
            system=_SYSTEM,
            messages=[{"role": "user", "content": _build_context(state)}],
        )
        data = _extract_json(resp.content[0].text)
        if not data:
            state["errors"].append(
                f"report_generator: LLM response could not be parsed as JSON "
                f"(stop_reason={resp.stop_reason}, output_tokens={resp.usage.output_tokens})"
            )
            state["current_agent"] = "complete"
            return state

        ap = data.get("activity_patterns", {})
        c_data = data.get("candidate", {})
        rb_data = data.get("recruiter_brief", {})
        sw_data = rb_data.get("strongest_work", {})

        recruiter_brief = None
        if rb_data:
            recruiter_brief = RecruiterBrief(
                one_liner=rb_data.get("one_liner", ""),
                strongest_work=StrongestWork(
                    repo_name=sw_data.get("repo_name"),
                    summary=sw_data.get("summary", ""),
                ),
                confirmed_skills_line=rb_data.get("confirmed_skills_line", ""),
                profile_consistency=rb_data.get("profile_consistency", ""),
            )

        result = FinalReport(
            recruiter=RecruiterReport(
                overview=data.get("overview", ""),
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
            recruiter_brief=recruiter_brief,
            generated_at=datetime.now(timezone.utc),
        )
        state["final_report"] = result.model_dump(mode="json")
        state["current_agent"] = "complete"
    except Exception as exc:
        state["errors"].append(f"report_generator: {exc}")
        state["current_agent"] = "complete"

    return state
