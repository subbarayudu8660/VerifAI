"""Agent 2 — GitHub Scraper.

Fetches public repository data for a GitHub username, computes per-repo
metrics, attaches flags for suspicious patterns, and fetches dependency
files (requirements.txt, package.json, pyproject.toml) for skill matching.

Standalone usage:
    python -m agents.github_scraper <username>
"""

import json
import re
import sys

import requests
from datetime import datetime, timezone

from core.constants import RECENT_CREATION_DAYS
from core.flags import Flag, make_flag
from core.github_client import GitHubClient
from core.models import GitHubScrapeResult, RepoData
from state import PipelineState

_TODAY = datetime.now(timezone.utc)


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

    if created_at and _days_since(created_at) <= RECENT_CREATION_DAYS:
        flags.append(make_flag(
            Flag.RECENT_CREATION,
            "Repository created within the last 20 days.",
            f"created_at={repo['created_at']} ({_days_since(created_at)} days ago)",
        ))

    if len(commits) <= 1:
        flags.append(make_flag(
            Flag.NO_COMMIT_HISTORY,
            "Repository has 0 or 1 commits — insufficient activity history.",
            f"total_commits={len(commits)}",
        ))

    if repo.get("fork") and len(commits) == 0:
        flags.append(make_flag(
            Flag.FORK_NO_CONTRIBUTION,
            "Repository is a fork with no additional commits by the owner.",
            f"is_fork=True, commits={len(commits)}",
        ))

    for lang in languages:
        if lang not in languages_first_seen and commits:
            first_commit_date = _parse_dt(commits[-1]["commit"]["committer"]["date"])
            languages_first_seen[lang] = (
                first_commit_date.date().isoformat() if first_commit_date else "unknown"
            )

    return flags


# ---------------------------------------------------------------------------
# Dependency fetching
# ---------------------------------------------------------------------------

def _should_fetch_deps(repo: dict, commits: list, languages: dict) -> bool:
    """Skip forks, near-empty repos, and notebook-only repos — not worth the API calls."""
    if repo.get("fork"):
        return False
    if len(commits) < 10:
        return False
    if not languages:
        return False
    if list(languages.keys()) == ["Jupyter Notebook"]:
        return False
    return True


def _fetch_dependencies(client: GitHubClient, owner: str, repo_name: str) -> dict:
    """Fetch requirements.txt, package.json, and pyproject.toml; return parsed dep lists."""
    python_deps: list[str] = []
    js_deps: list[str] = []

    # requirements.txt
    content = client.get_file_contents(owner, repo_name, "requirements.txt")
    if content:
        for line in content.splitlines():
            line = line.strip().lower()
            if line and not line.startswith("#"):
                pkg = re.split(r"[>=<!~\[]", line)[0].strip()
                if pkg and len(pkg) > 1:
                    python_deps.append(pkg)

    # package.json
    content = client.get_file_contents(owner, repo_name, "package.json")
    if content:
        try:
            pkg_json = json.loads(content)
            all_deps: dict = {}
            all_deps.update(pkg_json.get("dependencies", {}))
            all_deps.update(pkg_json.get("devDependencies", {}))
            js_deps = [k.lower() for k in all_deps.keys()]
        except (json.JSONDecodeError, AttributeError):
            pass

    # pyproject.toml (fallback for Python projects)
    if not python_deps:
        content = client.get_file_contents(owner, repo_name, "pyproject.toml")
        if content:
            for line in content.splitlines():
                matches = re.findall(r'["\']([a-z][a-z0-9\-_]+)', line.lower())
                python_deps.extend(matches)

    return {
        "python": list(set(python_deps)),
        "javascript": list(set(js_deps)),
    }


# ---------------------------------------------------------------------------
# Repo builder
# ---------------------------------------------------------------------------

def _build_repo_data(
    repo: dict,
    commits: list,
    contributors: list,
    languages: dict,
    owner: str,
    languages_first_seen: dict[str, str],
    readme_text: str = "",
    dependencies: dict | None = None,
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
        dependencies=dependencies or {"python": [], "javascript": []},
    )


# ---------------------------------------------------------------------------
# Agent entry point
# ---------------------------------------------------------------------------

def scrape_github(state: PipelineState) -> PipelineState:
    """Entry point called by the LangGraph pipeline."""
    state["current_agent"] = "github_scraper"
    username = state["github_username"]
    client = GitHubClient()

    try:
        user = client.get_user(username)
    except requests.HTTPError as exc:
        if exc.response is not None and exc.response.status_code == 404:
            state["errors"].append(f"github_scraper: GitHub user '{username}' not found. Please check the username and try again.")
            state["current_agent"] = "complete"
            return state
        state["errors"].append(f"github_scraper: failed to fetch user '{username}': {exc}")
        return state
    except Exception as exc:
        state["errors"].append(f"github_scraper: failed to fetch user '{username}': {exc}")
        return state

    total_public = user.get("public_repos", 0)
    if total_public == 0:
        state["errors"].append(f"github_scraper: '{username}' has 0 public repositories.")
        return state

    all_repos = client.get_repos(username)
    repos = sorted(all_repos, key=lambda r: r.get("pushed_at", ""), reverse=True)[:30]
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

            deps: dict = {"python": [], "javascript": []}
            if _should_fetch_deps(repo, commits, languages):
                print(f"[scraper] fetching deps for {name}", file=sys.stderr)
                deps = _fetch_dependencies(client, username, name)

            rd = _build_repo_data(
                repo, commits, contributors, languages,
                username, languages_first_seen, readme_text, deps,
            )
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
        repos_capped=len(all_repos) > 30,
        total_repos_found=len(all_repos),
    )

    state["github_data"] = result.model_dump(mode="json")
    return state


# ---------------------------------------------------------------------------
# Standalone CLI entry point
# ---------------------------------------------------------------------------
if __name__ == "__main__":
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
        "skill_verification": None,
        "project_matches": None,
        "final_report": None,
        "errors": [],
        "current_agent": "",
    }

    _state = scrape_github(_state)

    if _state["errors"]:
        print(json.dumps({"errors": _state["errors"]}, indent=2))
    else:
        print(json.dumps(_state["github_data"], indent=2, default=str))
