# ⚠️ IMPORTANT: Update this file at the END of every session
Add anything new that was built, fixed, decided, or changed.
This is the single source of truth for all Claude Code sessions.

---

# VerifAI — Claude Code Session Context

---

## What VerifAI Is

Automated technical candidate verification pipeline. Given a GitHub username and an optional résumé PDF, it:
1. Parses the résumé into structured claims
2. Scrapes GitHub activity (repos, commits, languages, flags)
3. Detects AI-generated code in recent commits
4. Cross-references résumé claims against GitHub evidence
5. Produces dual reports — one for recruiters (risk/flags), one for candidates (strengths/feedback)

---

## Hosted URLs

| Service  | URL |
|----------|-----|
| Frontend | https://verif-ai-nine.vercel.app |
| Backend  | https://verifai-production-d9d4.up.railway.app |

**Git repo:** https://github.com/subbarayudu8660/VerifAI
Remote uses SSH: `git@github.com:subbarayudu8660/VerifAI.git`
Git root is at `verifai/` (the inner directory), not the project root.

---

## How to Run Locally

**Terminal 1 — Backend:**
```bash
cd verifai
pip install -r requirements.txt
uvicorn main:app --reload --port 8000
```

**Terminal 2 — Frontend:**
```bash
cd verifai/frontend
npm install
npm run dev
# opens at http://localhost:5173
```

---

## Environment Variables

Create `verifai/.env` (never commit it):

```
GITHUB_TOKEN=ghp_your_token_here
OPENAI_API_KEY=sk-your_key_here
```

Same vars set in Railway dashboard. Vercel frontend needs none.

---

## Full File Structure

```
verifAI/                          ← project root (CLAUDE.md lives here, gitignored)
└── verifai/                      ← git root
    ├── main.py                   ← FastAPI entrypoint (wiring only)
    ├── pipeline.py               ← LangGraph StateGraph + stream_pipeline()
    ├── state.py                  ← PipelineState TypedDict
    ├── requirements.txt
    ├── .env                      ← local secrets (gitignored)
    ├── .env.example
    ├── .gitignore
    ├── agents/
    │   ├── resume_parser.py      ← Agent 1: OpenAI claim extraction
    │   ├── github_scraper.py     ← Agent 2: GitHub API scraping + flag detection
    │   ├── ai_code_detector.py   ← Agent 3: commit diff AI-generation scoring
    │   ├── coherence_verifier.py ← Agent 4: skill + project matching vs GitHub
    │   └── report_generator.py   ← Agent 5: LLM synthesis → dual reports
    ├── core/
    │   ├── github_client.py      ← GitHub API wrapper (backoff, pagination)
    │   ├── flags.py              ← Flag enum + make_flag() helper
    │   ├── llm.py                ← OpenAI client singleton + MODEL constant
    │   └── models.py             ← All Pydantic models
    ├── api/
    │   └── routes.py             ← POST /verify, GET /results/{run_id}
    ├── outputs/                  ← Per-run JSON files (gitignored)
    └── frontend/
        ├── index.html
        ├── package.json          ← pdfjs-dist pinned at 3.11.174
        ├── vite.config.js
        └── src/
            ├── main.jsx
            ├── App.jsx
            ├── api.js            ← BASE URL hardcoded to localhost:8000
            └── components/
                ├── UploadForm.jsx   ← username + PDF upload, pdfjs parsing
                ├── StatusPoll.jsx   ← live agent progress, polls every 3s
                └── ReportView.jsx   ← full report UI
```

---

## 5-Agent Pipeline

All agents share `PipelineState` (TypedDict in `state.py`). Pipeline runs via LangGraph `StateGraph`. Each agent sets `state["current_agent"]` at entry so the frontend can show live progress.

| Agent | File | What it does |
|-------|------|--------------|
| 1 — Resume Parser | `agents/resume_parser.py` | OpenAI extracts structured claims. Each claim: `claim`, `category` (skill/project/role/education/achievement), `source_section`, `skip_github_check`, `confidence`, `raw_text`. Experience claims tagged `skip_github_check: true`. |
| 2 — GitHub Scraper | `agents/github_scraper.py` | Fetches repos, commits, languages, contributors. Flags: recent creation (≤20 days), no commit history, fork with no contribution. Standalone: `python -m agents.github_scraper <username>` |
| 3 — AI Code Detector | `agents/ai_code_detector.py` | Samples up to 5 commit diffs per repo (max 3000 chars), scores for AI-generation likelihood. Qualitative signals only — no numeric score shown. |
| 4 — Coherence Verifier | `agents/coherence_verifier.py` | Skill matching via `_skill_in_repo()` with `_SKILL_ALIASES` map. Project matching via `_keyword_overlap()` (keyword set intersection, threshold 0.25). Skips experience section. LLM generates interview questions for contradicted claims. |
| 5 — Report Generator | `agents/report_generator.py` | LLM synthesises `RecruiterReport` (risk level, red flags, recommendation) and `CandidateReport` (strengths, feedback). |

### LangGraph wiring (`pipeline.py`)
- Entry: `parse_resume → scrape_github`
- Conditional edge after `scrape_github`: if `github_data is None` → skip to `generate_report`, else → `detect_ai_code → verify_coherence → generate_report`
- `stream_pipeline()` uses `_compiled.stream(stream_mode="values")` — yields full state after each node so `routes.py` can update `_results[run_id]` live

### Live progress (how it works end-to-end)
1. `POST /verify` initialises `_results[run_id]` with `current_agent: "queued"` and starts `_run_and_store` as a background task
2. `_run_and_store` iterates `stream_pipeline()`, writing `_results[run_id] = state` after each agent
3. Frontend `StatusPoll` polls `GET /results/{run_id}` every 3s, reads `current_agent`, updates dot UI
4. Polling stops when `final_report !== null` or `errors.length > 0`

---

## Coherence Verifier Detail (`agents/coherence_verifier.py`)

### Skill matching — `_skill_in_repo(skill_lower, repo)`
1. Direct language match (e.g. "python" == "Python")
2. Direct text match — skill name in README, description, or repo name
3. Alias match — language alias must match AND skill keyword must appear in README/desc/name (prevents inflated counts from broad aliases like "python")

`_SKILL_ALIASES` covers: React, Node.js, Express, Next.js, Vue, Angular, LangChain, LangGraph, PyTorch, TensorFlow, scikit-learn, pandas, numpy, MongoDB, MySQL, FastAPI, Flask, Docker, Kubernetes, GraphQL, SwiftUI, and ~30 more.

`_SKIP_SKILLS` excludes: git, GitHub, VS Code, Jupyter, Linux, Agile, Jira, Slack, etc. — tools not demonstrable on GitHub.

### Project matching — `_keyword_overlap(claim, repo_name, repo_desc, readme)`
- Extracts keywords (>3 chars, not stopwords) from claim and from repo name + description + first 500 chars of README
- Score = overlap / claim_word_count
- Threshold 0.25 to count as a match
- Unmatched projects classified as: `CLAIM_NO_EVIDENCE`, `LIKELY_PRIVATE_CORPORATE`, or `LIKELY_PRIVATE_CLASSIFIED`

### Confidence scoring — `_skill_confidence(n_repos, total_commits)`
| Repos | Commits | Confidence |
|-------|---------|------------|
| 0 | any | 0.0 |
| 1 | <10 | 0.3 |
| ≤2 | 10–50 | 0.55 |
| ≥2 | 50–200 | 0.75 |
| ≥3 | 200–500 | 0.90 |
| ≥3 | >500 | 0.95 |

---

## Frontend UI — ReportView.jsx

Sections rendered (top to bottom):
1. **Score header** — Trust score 0–100, LOW/MEDIUM/HIGH RISK badge, summary, stats (repos, commits, languages, account age)
2. **Red Flags** — contradicted claims with evidence strings and suggested interview questions
3. **Skill Verification table** — two columns: Skill | Evidence ("3 repos" or "No evidence found"). No confidence %, no Claimed Level column.
4. **Project Claims** — ✓ matched repo with GitHub link, or ✗/⚠/🔒 with flag reason
5. **GitHub Summary table** — repo name (with inline badges), commits, languages, open issues
6. **Interview Questions** — from coherence LLM, contradicted claims only
7. **Debug panel** — collapsible, shows pipeline errors

### Inline repo badges
| Badge | Meaning |
|-------|---------|
| Recently created | Repo ≤20 days old |
| No commit history | 0 or 1 commits |
| Fork | Forked with no own commits |

---

## Decisions Made (do not revert)

- **No numeric AI score** — qualitative signals only; a number felt misleading
- **Experience section skipped** — corporate code lives in private repos; always false negatives
- **Skills evaluated individually** — "Python, Django, REST APIs" → 3 separate checks
- **No business logic in `main.py` or `pipeline.py`** — wiring only
- **All inter-agent data via Pydantic models** — never raw dicts
- **Errors accumulated, not fatal** — pipeline continues on any agent failure
- **Recent creation threshold: 20 days** (was 30, changed this session)
- **Skill table: repo count only** — confidence % removed, Claimed Level removed

---

## Current Known Issues

| Issue | Status | Notes |
|-------|--------|-------|
| PDF worker on Vercel | **In progress** | `UploadForm.jsx` uses `new URL('pdfjs-dist/build/pdf.worker.min.js', import.meta.url)`, pdfjs-dist pinned at 3.11.174. Not yet pushed — test locally first with `npm install && npm run dev`. |
| `api.js` BASE URL hardcoded | **Open** | `BASE = "http://localhost:8000"` — Vercel can't reach Railway. Fix: `import.meta.env.VITE_API_URL` + set `VITE_API_URL=https://verifai-production-d9d4.up.railway.app` in Vercel dashboard. |
| In-memory result store | **Open** | `_results` dict resets on Railway restart. Fix: SQLite or file-based persistence. |
| `has_readme` approximated | **Open** | Currently just checks if readme_text is truthy. Needs GitHub tree API for exact check. |

---

## What's Next (priority order)

1. **Test and push PDF worker fix** — `npm install && npm run dev` in `verifai/frontend`, verify PDF upload works, then commit + push
2. **Fix `api.js` BASE URL** — env-aware `VITE_API_URL`, set in Vercel dashboard so hosted frontend reaches Railway
3. **Landing page** — marketing/explainer before the upload form
4. **Persistence** — SQLite or file-based store to survive Railway restarts
5. **`has_readme` exact check** — GitHub tree API in `github_client.py`

---

## Session Log

### Session 1 — 2026-05-30
Built full scaffold: all 5 agents (Agent 2 fully implemented, rest stubs), core modules, FastAPI routes, LangGraph pipeline, requirements, README.

### Session 2 — 2026-05-31 (morning)
- All 5 agents fully implemented
- React frontend built: UploadForm, StatusPoll, ReportView
- Deployed: backend → Railway, frontend → Vercel
- PDF worker fix iterations (CDN → unpkg → local `new URL(...)` + pdfjs-dist 3.11.174)

### Session 3 — 2026-05-31 (afternoon)
- Added `_SKILL_ALIASES` map to `coherence_verifier.py` — React, Node.js, LangChain, MongoDB etc. now match correctly
- Fixed alias matching to require BOTH language match AND text confirmation — prevents inflated counts from broad aliases (e.g. "python" matching all Python repos for "LangChain")
- Replaced `_check_projects()` with `_keyword_overlap()` — keyword set intersection with stopword filtering, threshold 0.25
- Skill table redesigned: removed Confidence % column, removed Claimed Level column, Evidence now shows repo count only
- Recent creation threshold changed: 30 days → 20 days
- Repo badges renamed: "New repo" → "Recently created", "No history" → "No commit history"
- Fixed live progress polling: root cause was `_run_and_store` only wrote to `_results[run_id]` once (after full pipeline). Fixed by adding `stream_pipeline()` in `pipeline.py` using `_compiled.stream(stream_mode="values")` — now writes state after each agent so frontend sees real-time `current_agent` updates
