"""Agent 3 — AI Code Detector.

Uses only data already in github_data (README text, commit counts, frequency,
languages, creation dates). No GitHub API calls. Qualitative observations only.
"""

import json

from core.llm import MODEL, extract_json, get_client
from core.models import AIDetectionResult, RepoAIScore
from state import PipelineState


_SYSTEM = """\
You are reviewing GitHub repository metadata for a technical recruiter.
No commit diffs are available — only repo-level statistics and README excerpts.

For each repo listed, produce a brief neutral observation about its activity patterns.

Return JSON with exactly this shape:
{
  "repos": [
    {
      "repo_name": "name",
      "reasoning": "1-2 sentence neutral observation about commit patterns or README",
      "indicators": ["specific observable signal — e.g. 'Single-commit push' or 'README length far exceeds commit count'"]
    }
  ],
  "summary": "1-2 sentence overall observation across all repos"
}

Indicators worth noting (only when clearly present):
- Single-commit repo (entire project in one push, non-fork)
- All commits within a single day despite the repo existing for weeks/months
- README or description is unusually polished relative to commit count
- Very high commit count concentrated in a very short time window

Rules:
- Never use: AI-generated, suspicious, fraudulent, fake, risk, score, probability, likelihood
- Never speculate about what is missing — private repos may hold the rest
- If nothing stands out, indicators can be an empty list
- Keep observations factual and brief
"""


def _build_context(repos: list[dict]) -> str:
    lines = []
    for repo in repos:
        readme = (repo.get("readme_text") or "").strip()
        lines.append(
            f"Repo: {repo['repo_name']} | "
            f"fork={repo.get('is_fork', False)} | "
            f"commits={repo.get('total_commits', 0)} | "
            f"freq={repo.get('commit_frequency_per_week', 0):.1f}/week | "
            f"days_old={repo.get('days_since_created', 0)} | "
            f"contributors={repo.get('co_contributor_count', 0)} | "
            f"languages={list(repo.get('languages', {}).keys())}"
        )
        if readme:
            lines.append(f"  README ({len(readme)} chars): {readme[:400]}")
    return "\n".join(lines)


def detect_ai_code(state: PipelineState) -> PipelineState:
    state["current_agent"] = "ai_code_detector"

    github_data = state.get("github_data")
    if not github_data:
        state["errors"].append("ai_code_detector: no github_data, skipping.")
        return state

    repos = [r for r in github_data.get("repos", []) if r.get("total_commits", 0) > 0]
    if not repos:
        state["errors"].append("ai_code_detector: no repos with commits to analyse.")
        return state

    try:
        resp = get_client().messages.create(
            model=MODEL,
            max_tokens=1024,
            system=_SYSTEM,
            messages=[{"role": "user", "content": _build_context(repos)}],
        )
        data = json.loads(extract_json(resp.content[0].text))
    except Exception as exc:
        state["errors"].append(f"ai_code_detector: {exc}")
        return state

    repo_lookup = {r["repo_name"]: r for r in repos}
    repo_scores: list[RepoAIScore] = []
    for entry in data.get("repos", []):
        name = entry.get("repo_name", "")
        if name not in repo_lookup:
            continue
        repo_scores.append(RepoAIScore(
            repo_name=name,
            ai_likelihood=0.0,
            reasoning=entry.get("reasoning", ""),
            indicators=entry.get("indicators", []),
            sampled_commit_count=0,
        ))

    if not repo_scores:
        state["errors"].append("ai_code_detector: LLM returned no repo entries.")
        return state

    result = AIDetectionResult(
        overall_ai_likelihood=0.0,
        repos=repo_scores,
        summary=data.get("summary", f"Analysed {len(repo_scores)} repos using metadata and README content."),
    )
    state["ai_detection"] = result.model_dump(mode="json")
    return state
