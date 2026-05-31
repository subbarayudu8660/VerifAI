from datetime import datetime
from typing import Any
from pydantic import BaseModel


class RepoData(BaseModel):
    repo_name: str
    created_at: datetime
    last_pushed_at: datetime
    days_since_created: int
    languages: dict[str, int]
    first_commit_date: datetime | None
    last_commit_date: datetime | None
    total_commits: int
    commit_frequency_per_week: float
    co_contributors: list[str]
    co_contributor_count: int
    is_fork: bool
    has_readme: bool
    open_issues_count: int
    flags: list[dict[str, str]]
    readme_text: str = ""          # first 2000 chars of README, for library matching


class GitHubScrapeResult(BaseModel):
    username: str
    scraped_at: datetime
    account_created_at: datetime
    total_public_repos: int
    languages_first_seen: dict[str, str]  # language -> ISO date string
    total_flags: int
    repos: list[RepoData]


class ResumeClaim(BaseModel):
    claim: str
    category: str                        # "skill", "project", "role", "education", "achievement"
    source_section: str = "other"        # "skills", "projects", "experience", "education", "other"
    company: str | None = None           # employer, for experience claims only
    skip_github_check: bool = False      # True for experience claims
    confidence: float                    # 0.0–1.0
    raw_text: str


class ResumeClaimsResult(BaseModel):
    candidate_name: str | None
    claims: list[ResumeClaim]


class RepoAIScore(BaseModel):
    repo_name: str
    ai_likelihood: float       # 0.0–1.0
    reasoning: str
    indicators: list[str]
    sampled_commit_count: int


class AIDetectionResult(BaseModel):
    overall_ai_likelihood: float
    repos: list[RepoAIScore]
    summary: str


class FlagEntry(BaseModel):
    flag_type: str
    description: str
    evidence: str


class CoherenceCheck(BaseModel):
    claim: str
    verdict: str           # "supported", "contradicted", "unverifiable"
    supporting_evidence: list[str]
    contradicting_evidence: list[str]
    confidence: float


class CoherenceReport(BaseModel):
    checks: list[CoherenceCheck]
    overall_score: float           # 0.0–1.0
    summary: str
    interview_questions: list[str] # one per contradicted claim


class RecruiterReport(BaseModel):
    candidate: str
    overall_risk: str      # "low", "medium", "high"
    red_flags: list[FlagEntry]
    summary: str
    recommendation: str


class CandidateReport(BaseModel):
    candidate: str
    strengths: list[str]
    areas_to_address: list[str]
    summary: str


class FinalReport(BaseModel):
    recruiter: RecruiterReport
    candidate: CandidateReport
    generated_at: datetime
    pipeline_version: str = "0.1.0"

    def to_dict(self) -> dict[str, Any]:
        return self.model_dump(mode="json")
