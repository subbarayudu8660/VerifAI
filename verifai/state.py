from typing import TypedDict


class PipelineState(TypedDict):
    github_username: str                    # Input — provided by user
    resume_raw: str | None                  # Input — provided by user (plain text extracted from PDF)
    resume_claims: dict | None              # Agent 1 output → Agent 4 input
    github_data: dict | None                # Agent 2 output → Agent 3, 4, 5 input
    ai_detection: dict | None               # Agent 3 output → Agent 5 input
    skill_verification: list[dict] | None   # Agent 4 output → Agent 5 input (per-skill evidence)
    project_matches: list[dict] | None      # Agent 4 output → Agent 5 input (per-project match)
    coherence_report: dict | None           # Agent 4 output → Agent 5 input (LLM verdicts)
    final_report: dict | None               # Agent 5 output → Frontend
    errors: list[str]                       # All agents append here; pipeline never halts on error
    skipped: list[str]                      # Intentional skips (no resume, GitHub-only mode) — not shown as errors
    current_agent: str                      # Set by each agent on entry; Frontend polls this for progress
