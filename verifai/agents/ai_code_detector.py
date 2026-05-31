"""Agent 3 — AI Code Detector.

Samples recent commit diffs from each repo and scores them for AI-generation
likelihood using OpenAI. Skips repos with no commit history.
"""

import json
import sys

from core.github_client import GitHubClient
from core.llm import MODEL, get_client
from core.models import AIDetectionResult, RepoAIScore
from state import PipelineState

_SAMPLE_COMMITS = 5
_MAX_PATCH_CHARS = 3000

_SYSTEM = """\
You are an expert code reviewer specialising in detecting AI-generated code.

Analyse the provided commit diffs and return JSON with exactly this shape:
{
  "ai_likelihood": 0.0-1.0,
  "reasoning": "2-3 sentence explanation",
  "indicators": ["list of specific signals observed"]
}

High AI-likelihood signals: uniform formatting, generic variable names, boilerplate
comments explaining obvious things, lack of iterative/messy commits, overly complete
first implementations, perfect docstrings on all functions, no debugging artifacts.

Low AI-likelihood signals: typos, incremental fixes, refactors, personal coding style,
domain-specific shortcuts, messy exploratory commits.
"""


def _sample_patches(client: GitHubClient, username: str, repo_name: str, commit_shas: list[str]) -> str:
    patches: list[str] = []
    for sha in commit_shas[:_SAMPLE_COMMITS]:
        try:
            detail = client.get_commit_detail(username, repo_name, sha)
            for f in detail.get("files", [])[:3]:
                patch = f.get("patch", "")
                if patch:
                    patches.append(f"--- {f['filename']} ---\n{patch[:_MAX_PATCH_CHARS]}")
        except Exception as exc:
            print(f"[ai_detector] skipping commit {sha}: {exc}", file=sys.stderr)
    return "\n\n".join(patches)


def detect_ai_code(state: PipelineState) -> PipelineState:
    state["current_agent"] = "ai_code_detector"

    github_data = state.get("github_data")
    if not github_data:
        state["errors"].append("ai_code_detector: no github_data, skipping.")
        return state

    gh_client = GitHubClient()
    llm_client = get_client()
    username = github_data["username"]
    repo_scores: list[RepoAIScore] = []

    for repo in github_data.get("repos", []):
        repo_name = repo["repo_name"]
        total_commits = repo.get("total_commits", 0)
        if total_commits == 0:
            print(f"[ai_detector] skipping {repo_name}: no commits", file=sys.stderr)
            continue

        print(f"[ai_detector] sampling {repo_name}", file=sys.stderr)
        try:
            commits = gh_client.get_commits(username, repo_name)
            shas = [c["sha"] for c in commits[:_SAMPLE_COMMITS]]
            patches = _sample_patches(gh_client, username, repo_name, shas)

            if not patches:
                continue

            resp = llm_client.chat.completions.create(
                model=MODEL,
                response_format={"type": "json_object"},
                messages=[
                    {"role": "system", "content": _SYSTEM},
                    {"role": "user", "content": f"Repository: {repo_name}\n\n{patches}"},
                ],
            )
            data = json.loads(resp.choices[0].message.content)
            repo_scores.append(RepoAIScore(
                repo_name=repo_name,
                ai_likelihood=float(data.get("ai_likelihood", 0.0)),
                reasoning=data.get("reasoning", ""),
                indicators=data.get("indicators", []),
                sampled_commit_count=len(shas),
            ))
        except Exception as exc:
            print(f"[ai_detector] error on {repo_name}: {exc}", file=sys.stderr)

    if not repo_scores:
        state["errors"].append("ai_code_detector: no repos could be analysed.")
        return state

    overall = round(sum(r.ai_likelihood for r in repo_scores) / len(repo_scores), 3)
    high = [r.repo_name for r in repo_scores if r.ai_likelihood >= 0.7]
    summary = (
        f"Analysed {len(repo_scores)} repos. Overall AI likelihood: {overall:.0%}. "
        + (f"High-risk repos: {', '.join(high)}." if high else "No repos flagged as high-risk.")
    )

    result = AIDetectionResult(
        overall_ai_likelihood=overall,
        repos=repo_scores,
        summary=summary,
    )
    state["ai_detection"] = result.model_dump(mode="json")
    return state
