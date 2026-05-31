from typing import TypedDict


class PipelineState(TypedDict):
    github_username: str
    resume_raw: str | None
    resume_claims: dict | None        # Agent 1 output
    github_data: dict | None          # Agent 2 output
    ai_detection: dict | None         # Agent 3 output
    coherence_report: dict | None     # Agent 4 output
    skill_verification: list[dict] | None   # Agent 4 output — per-skill confidence
    project_matches: list[dict] | None      # Agent 4 output — per-project match
    final_report: dict | None         # Agent 5 output
    errors: list[str]
    current_agent: str
