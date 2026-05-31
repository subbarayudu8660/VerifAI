"""Agent 2 — GitHub Scraper.

Fetches public repository data for a GitHub username, computes per-repo
metrics, and attaches flags for suspicious patterns.

Standalone usage:
    python -m agents.github_scraper <username>
"""

import sys
from datetime import datetime, timezone

from core.flags import Flag, make_flag
from core.github_client import GitHubClient
from core.models import GitHubScrapeResult, RepoData
from state import PipelineState

_TODAY = datetime.now(timezone.utc)
_RECENT_DAYS = 30


def _parse_dt(s: str | None) -> datetime | None:
    if not s:
        return None
    dt = datetime.fromisoformat(s.replace("Z", "+00:00"))
    return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)


def _days_since(dt: datetime) -> int:
    return (_TODAY - dt).days


def _commit_freq(total: int, created_at: datetime) -> float:
    weeks = max(_days_since(created_at) / 7, 1)
    return round(total / weeks, 2)


def _detect_flags(
    repo: dict,
    commits: list,
    contributors: list,
    languages: dict,
    owner: str,
    languages_first_seen: dict[str, str],
) -> list[dict[str, str]]:
    flags: list[dict[str, str]] = []
    created_at = _parse_dt(repo["created_at"])

    # RECENT_CREATION
    if created_at and _days_since(created_at) <= _RECENT_DAYS:
        flags.append(make_flag(
            Flag.RECENT_CREATION,
            "Repository created within the last 30 days.",
            f"created_at={repo['created_at']} ({_days_since(created_at)} days ago)",
        ))

    # NO_COMMIT_HISTORY
    if len(commits) <= 1:
        flags.append(make_flag(
            Flag.NO_COMMIT_HISTORY,
            "Repository has 0 or 1 commits — insufficient activity history.",
            f"total_commits={len(commits)}",
        ))

    # FORK_NO_CONTRIBUTION — fork with no commits beyond fork point
    if repo.get("fork") and len(commits) == 0:
        flags.append(make_flag(
            Flag.FORK_NO_CONTRIBUTION,
            "Repository is a fork with no additional commits by the owner.",
            f"is_fork=True, commits={len(commits)}",
        ))

    # Track languages_first_seen globally for Agent 4 (coherence verifier)
    for lang in languages:
        if lang not in languages_first_seen and commits:
            first_commit_date = _parse_dt(commits[-1]["commit"]["committer"]["date"])
            languages_first_seen[lang] = first_commit_date.date().isoformat() if first_commit_date else "unknown"

    return flags


def _build_repo_data(
    repo: dict,
    commits: list,
    contributors: list,
    languages: dict,
    owner: str,
    languages_first_seen: dict[str, str],
    readme_text: str = "",
) -> RepoData:
    created_at = _parse_dt(repo["created_at"])
    last_pushed = _parse_dt(repo.get("pushed_at") or repo["created_at"])
    first_commit = _parse_dt(commits[-1]["commit"]["committer"]["date"]) if commits else None
    last_commit = _parse_dt(commits[0]["commit"]["committer"]["date"]) if commits else None
    others = [c["login"] for c in contributors if c.get("login", "").lower() != owner.lower()]

    flags = _detect_flags(repo, commits, contributors, languages, owner, languages_first_seen)

    return RepoData(
        repo_name=repo["name"],
        created_at=created_at,
        last_pushed_at=last_pushed,
        days_since_created=_days_since(created_at) if created_at else 0,
        languages=languages,
        first_commit_date=first_commit,
        last_commit_date=last_commit,
        total_commits=len(commits),
        commit_frequency_per_week=_commit_freq(len(commits), created_at) if created_at else 0.0,
        co_contributors=others,
        co_contributor_count=len(others),
        is_fork=bool(repo.get("fork")),
        has_readme=bool(readme_text),
        open_issues_count=repo.get("open_issues_count", 0),
        flags=flags,
        readme_text=readme_text,
    )


def scrape_github(state: PipelineState) -> PipelineState:
    state["current_agent"] = "github_scraper"
    username = state["github_username"]
    client = GitHubClient()

    try:
        user = client.get_user(username)
    except Exception as exc:
        state["errors"].append(f"github_scraper: failed to fetch user '{username}': {exc}")
        return state

    total_public = user.get("public_repos", 0)
    if total_public == 0:
        state["errors"].append(f"github_scraper: '{username}' has 0 public repositories.")
        return state

    repos = client.get_repos(username)
    languages_first_seen: dict[str, str] = {}
    repo_results: list[RepoData] = []

    for repo in repos:
        name = repo["name"]
        print(f"[scraper] processing {username}/{name}", file=sys.stderr)
        try:
            commits = client.get_commits(username, name)
            contributors = client.get_contributors(username, name)
            languages = client.get_languages(username, name)
            readme_text = client.get_readme(username, name)
            rd = _build_repo_data(repo, commits, contributors, languages, username, languages_first_seen, readme_text)
            repo_results.append(rd)
        except Exception as exc:
            print(f"[scraper] WARNING: skipping {name}: {exc}", file=sys.stderr)
            continue

    account_created = _parse_dt(user.get("created_at"))
    total_flags = sum(len(r.flags) for r in repo_results)

    result = GitHubScrapeResult(
        username=username,
        scraped_at=_TODAY,
        account_created_at=account_created,
        total_public_repos=total_public,
        languages_first_seen=languages_first_seen,
        total_flags=total_flags,
        repos=repo_results,
    )

    state["github_data"] = result.model_dump(mode="json")
    return state


# ---------------------------------------------------------------------------
# Standalone CLI entry point
# ---------------------------------------------------------------------------
if __name__ == "__main__":
    import json

    if len(sys.argv) < 2:
        print("Usage: python -m agents.github_scraper <github_username>", file=sys.stderr)
        sys.exit(1)

    _username = sys.argv[1]
    _state: PipelineState = {
        "github_username": _username,
        "resume_raw": None,
        "resume_claims": None,
        "github_data": None,
        "ai_detection": None,
        "coherence_report": None,
        "final_report": None,
        "errors": [],
        "current_agent": "",
    }

    _state = scrape_github(_state)

    if _state["errors"]:
        print(json.dumps({"errors": _state["errors"]}, indent=2))
    else:
        print(json.dumps(_state["github_data"], indent=2, default=str))
