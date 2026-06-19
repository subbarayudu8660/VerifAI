import os
import sys
import time
from urllib.parse import parse_qs, urlparse

import requests
from dotenv import load_dotenv

load_dotenv()

_GITHUB_API = "https://api.github.com"
_MAX_RETRIES = 5


class GitHubClient:
    def __init__(self, token: str | None = None):
        self._token = token or os.getenv("GITHUB_TOKEN")
        self._session = requests.Session()
        self._session.headers.update({
            "Accept": "application/vnd.github+json",
            "X-GitHub-Api-Version": "2022-11-28",
        })
        if self._token:
            self._session.headers["Authorization"] = f"Bearer {self._token}"

    def get(self, url: str, params: dict | None = None) -> dict | list:
        for attempt in range(_MAX_RETRIES):
            resp = self._session.get(url, params=params, timeout=15)
            remaining = resp.headers.get("X-RateLimit-Remaining", "?")
            print(f"[github] GET {url} → {resp.status_code} | rate-limit-remaining={remaining}", file=sys.stderr)

            if resp.status_code in (403, 429):
                wait = 2 ** attempt
                print(f"[github] rate-limited, backing off {wait}s (attempt {attempt+1}/{_MAX_RETRIES})", file=sys.stderr)
                time.sleep(wait)
                continue

            resp.raise_for_status()
            return resp.json()

        raise RuntimeError(f"GitHub API unavailable after {_MAX_RETRIES} retries: {url}")

    def get_paginated(self, url: str, params: dict | None = None) -> list:
        params = dict(params or {})
        params.setdefault("per_page", 100)
        results: list = []
        next_url: str | None = url

        while next_url:
            resp = self._session.get(next_url, params=params, timeout=15)
            remaining = resp.headers.get("X-RateLimit-Remaining", "?")
            print(f"[github] GET {next_url} → {resp.status_code} | rate-limit-remaining={remaining}", file=sys.stderr)

            if resp.status_code in (403, 429):
                time.sleep(2)
                continue

            resp.raise_for_status()
            data = resp.json()
            if isinstance(data, list):
                results.extend(data)
            else:
                results.append(data)

            next_url = self._parse_next_link(resp.headers.get("Link", ""))
            params = {}  # params are already baked into next_url

        return results

    @staticmethod
    def _parse_next_link(link_header: str) -> str | None:
        for part in link_header.split(","):
            segments = [s.strip() for s in part.split(";")]
            if len(segments) == 2 and segments[1] == 'rel="next"':
                return segments[0].strip("<>")
        return None

    def get_user(self, username: str) -> dict:
        return self.get(f"{_GITHUB_API}/users/{username}")

    def get_repos(self, username: str) -> list:
        return self.get_paginated(f"{_GITHUB_API}/users/{username}/repos", {"type": "public"})

    def get_commits(self, owner: str, repo: str) -> list:
        return self.get_paginated(f"{_GITHUB_API}/repos/{owner}/{repo}/commits")

    def get_contributors(self, owner: str, repo: str) -> list:
        try:
            return self.get_paginated(f"{_GITHUB_API}/repos/{owner}/{repo}/contributors")
        except requests.HTTPError:
            return []

    def get_languages(self, owner: str, repo: str) -> dict:
        result = self.get(f"{_GITHUB_API}/repos/{owner}/{repo}/languages")
        return result if isinstance(result, dict) else {}

    def get_commit_detail(self, owner: str, repo: str, sha: str) -> dict:
        """Returns a single commit with per-file patches."""
        return self.get(f"{_GITHUB_API}/repos/{owner}/{repo}/commits/{sha}")

    def get_readme(self, owner: str, repo: str) -> str:
        """Returns decoded README text (first 2000 chars), or empty string if absent."""
        import base64
        try:
            data = self.get(f"{_GITHUB_API}/repos/{owner}/{repo}/readme")
            if isinstance(data, dict) and data.get("encoding") == "base64":
                text = base64.b64decode(data["content"]).decode("utf-8", errors="ignore")
                return text[:2000]
        except Exception:
            pass
        return ""

    def get_repo_tree(self, owner: str, repo: str) -> list[str]:
        """Returns recursive file paths in the repo's default branch, or [] on failure."""
        try:
            repo_data = self.get(f"{_GITHUB_API}/repos/{owner}/{repo}")
            default_branch = repo_data.get("default_branch", "main") if isinstance(repo_data, dict) else "main"
            tree = self.get(
                f"{_GITHUB_API}/repos/{owner}/{repo}/git/trees/{default_branch}",
                {"recursive": "1"},
            )
            if isinstance(tree, dict):
                return [item["path"] for item in tree.get("tree", []) if item.get("type") == "blob"]
        except Exception:
            pass
        return []

    def get_file_contents(self, owner: str, repo: str, path: str) -> str | None:
        """Returns decoded text of a file in the repo, or None if absent or unreadable."""
        import base64
        try:
            data = self.get(f"{_GITHUB_API}/repos/{owner}/{repo}/contents/{path}")
            if isinstance(data, dict) and data.get("encoding") == "base64":
                return base64.b64decode(data["content"]).decode("utf-8", errors="ignore")
        except Exception:
            pass
        return None
