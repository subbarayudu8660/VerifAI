"""Pydantic models for the VerifAI pipeline.

Grouped by domain: GitHub → Resume → AI Detection → Coherence → Reports.
All inter-agent data flows through these models — never raw dicts.
"""

from datetime import datetime
from pydantic import BaseModel


# ---------------------------------------------------------------------------
# GitHub scraper (Agent 2)
# ---------------------------------------------------------------------------

class RepoData(BaseModel):
    repo_name: str
    created_at: datetime
    last_pushed_at: datetime
    days_since_created: int
    languages: dict[str, int]               # language name → bytes
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
    readme_text: str = ""                   # first 2000 chars, used by Agent 4 for skill matching
    dependencies: dict = {}                 # {"python": [...], "javascript": [...]} from dep files


class GitHubScrapeResult(BaseModel):
    username: str
    scraped_at: datetime
    account_created_at: datetime
    total_public_repos: int
    languages_first_seen: dict[str, str]    # language → ISO date of first commit
    total_flags: int
    repos: list[RepoData]


# ---------------------------------------------------------------------------
# Resume parser (Agent 1)
# ---------------------------------------------------------------------------

class ResumeClaim(BaseModel):
    claim: str
    category: str                           # skill | project | role | education | achievement
    source_section: str = "other"           # skills | projects | experience | education | other
    company: str | None = None              # employer name, for experience claims only
    skip_github_check: bool = False         # True for experience claims (corporate = private repos)
    confidence: float                       # 1.0 explicit, 0.7 implied, 0.4 vague
    raw_text: str                           # verbatim excerpt from resume


class ResumeClaimsResult(BaseModel):
    candidate_name: str | None
    claims: list[ResumeClaim]


# ---------------------------------------------------------------------------
# AI code detector (Agent 3)
# ---------------------------------------------------------------------------

class RepoAIScore(BaseModel):
    repo_name: str
    ai_likelihood: float        # 0.0–1.0
    reasoning: str
    indicators: list[str]
    sampled_commit_count: int


class AIDetectionResult(BaseModel):
    overall_ai_likelihood: float
    repos: list[RepoAIScore]
    summary: str


# ---------------------------------------------------------------------------
# Coherence verifier (Agent 4)
# ---------------------------------------------------------------------------

class CoherenceCheck(BaseModel):
    claim: str
    verdict: str                        # supported | contradicted | unverifiable
    supporting_evidence: list[str]
    contradicting_evidence: list[str]
    confidence: float


class CoherenceReport(BaseModel):
    checks: list[CoherenceCheck]
    summary: str
    interview_questions: list[str]      # one per contradicted claim


# ---------------------------------------------------------------------------
# Report generator (Agent 5)
# ---------------------------------------------------------------------------

class ActivityPatterns(BaseModel):
    account_age: str            # e.g. "GitHub account created: 2024"
    most_active_languages: list[str]
    repo_velocity: str          # e.g. "3 repos created in last 20 days"
    commit_pattern: str         # neutral observation about commit frequency/distribution


class ProjectInterviewQuestion(BaseModel):
    project: str                # claimed project name from resume
    matched_repo: str | None    # matched GitHub repo name, or None if unmatched
    interview_question: str     # must reference specific repo details or explain absence


class RecruiterReport(BaseModel):
    overview: str
    activity_patterns: ActivityPatterns
    project_interview_questions: list[ProjectInterviewQuestion] = []


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
