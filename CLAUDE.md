# ⚠️ Update this file at the END of every session
This is the single source of truth. Every new session starts here.

---

# VerifAI — Session Context

## What It Is

Automated technical candidate verification. Give it a GitHub username + optional resume PDF. It runs a 5-agent pipeline and returns an intelligence report: timeline inconsistencies, skill evidence, activity patterns, and specific interview questions. No verdicts — just evidence.

---

## Deployments

| | URL |
|--|--|
| Frontend | https://verif-ai-nine.vercel.app |
| Backend | https://verifai-production-d9d4.up.railway.app |
| Git repo | https://github.com/subbarayudu8660/VerifAI |

SSH remote: `git@github.com:subbarayudu8660/VerifAI.git`
**Git root is `verifai/` (the inner directory) — not the project root.**

---

## How to Run Locally

```bash
# Terminal 1 — Backend
cd verifai
pip install -r requirements.txt
uvicorn main:app --reload --port 8000

# Terminal 2 — Frontend
cd verifai/frontend
npm install
npm run dev
# → http://localhost:5173
```

---

## Environment Variables

`verifai/.env` (never commit):
```
GITHUB_TOKEN=ghp_...
ANTHROPIC_API_KEY=sk-ant-...
```

Railway dashboard needs: `GITHUB_TOKEN`, `ANTHROPIC_API_KEY`
Vercel dashboard needs: `VITE_API_URL=https://verifai-production-d9d4.up.railway.app` (no trailing slash)

`api.js` reads `import.meta.env.VITE_API_URL || "http://localhost:8000"` — already set up.

---

## Full File Structure

```
verifAI/                            ← project root (CLAUDE.md here, gitignored by inner repo)
└── verifai/                        ← git root
    ├── main.py                     ← FastAPI app + CORS (localhost + Vercel URL allowed)
    ├── pipeline.py                 ← LangGraph StateGraph + stream_pipeline()
    ├── state.py                    ← PipelineState TypedDict with per-field comments
    ├── requirements.txt            ← anthropic (not openai)
    ├── .env                        ← gitignored
    ├── .env.example
    ├── agents/
    │   ├── resume_parser.py        ← Agent 1
    │   ├── github_scraper.py       ← Agent 2 (also runs standalone)
    │   ├── ai_code_detector.py     ← Agent 3
    │   ├── coherence_verifier.py   ← Agent 4
    │   └── report_generator.py     ← Agent 5
    ├── core/
    │   ├── constants.py            ← ALL hardcoded values live here
    │   ├── models.py               ← All Pydantic models
    │   ├── flags.py                ← Flag enum + make_flag()
    │   ├── github_client.py        ← GitHub API wrapper + get_file_contents()
    │   └── llm.py                  ← Anthropic client, MODEL = "claude-sonnet-4-5"
    ├── api/
    │   └── routes.py               ← POST /verify, GET /results/{run_id}
    ├── outputs/                    ← Per-run JSON (gitignored)
    └── frontend/
        ├── package.json            ← pdfjs-dist@3.11.174, react-router-dom@^6.26.2
        ├── vite.config.js
        ├── index.html
        └── src/
            ├── main.jsx
            ├── App.jsx             ← React Router: / → LandingPage, /verify → VerifyPage
            ├── LandingPage.jsx     ← Marketing page (hero, problem, how it works, mockup, CTA)
            ├── api.js              ← fetch wrappers, reads VITE_API_URL env var
            └── components/
                ├── UploadForm.jsx  ← GitHub username + PDF upload (pdfjs@3.11.174)
                ├── StatusPoll.jsx  ← polls every 3s, shows live agent progress
                └── ReportView.jsx  ← intelligence report UI
```

---

## LLM Stack (`core/llm.py`)

- **Provider:** Anthropic
- **Model:** `claude-sonnet-4-5`
- **Client:** `anthropic.Anthropic(api_key=os.getenv("ANTHROPIC_API_KEY"))`
- **Call pattern used in all agents:**
```python
resp = client.messages.create(
    model=MODEL,
    max_tokens=...,   # 1024 (ai_detector), 2000 (resume_parser), 4096 (coherence, report)
    system=_SYSTEM,   # system prompt goes here, NOT as a message
    messages=[{"role": "user", "content": ...}],
)
data = _extract_json(resp.content[0].text)
```
- **`_extract_json(text)`** — defined locally in each agent file (resume_parser, coherence_verifier, report_generator). Handles: direct JSON parse → strip ` ```json ``` ` fences and retry → `re.search(r'\{.*\}')` fallback → returns `{}` on total failure. Never raises `JSONDecodeError`.

**Do NOT use:** `client.chat.completions.create(...)`, `response_format={"type": "json_object"}`, `resp.choices[0].message.content` — these are OpenAI patterns and will break.

---

## 5-Agent Pipeline

State flows through `PipelineState` (TypedDict). Each agent sets `state["current_agent"]` on entry — frontend polls this for live progress.

### Agent 1 — Resume Parser (`agents/resume_parser.py`)
- Calls Claude to extract structured claims from raw resume text
- Each claim: `claim`, `category` (skill/project/role/education/achievement), `source_section`, `skip_github_check`, `confidence`, `raw_text`
- Experience section claims tagged `skip_github_check: true` — never checked against GitHub
- Skills extracted individually, never grouped

### Agent 2 — GitHub Scraper (`agents/github_scraper.py`)
- Fetches repos, commits, languages, contributors, README text
- Fetches dependency files for qualifying repos (≥10 commits, not a fork, not Jupyter-only):
  - `requirements.txt` → Python deps list
  - `package.json` → JS deps (dependencies + devDependencies)
  - `pyproject.toml` → Python deps fallback
- Flags: `RECENT_CREATION` (≤20 days), `NO_COMMIT_HISTORY` (0–1 commits), `FORK_NO_CONTRIBUTION`
- Standalone: `python -m agents.github_scraper <username>`
- No LLM calls — GitHub API only

### Agent 3 — AI Code Detector (`agents/ai_code_detector.py`)
- Samples up to 5 recent commit diffs per repo (max 3000 chars each)
- Scores each repo for AI-generation likelihood via Claude (`max_tokens=1024`)
- Qualitative signals only — no numeric score shown to users

### Agent 4 — Coherence Verifier (`agents/coherence_verifier.py`)
- **Skill matching** — `_skill_in_repo()` checks in priority order:
  1. Dependency files (explicit package in requirements.txt / package.json)
  2. GitHub language API
  3. README / description / repo name text
  4. Alias match: language alias must match AND skill keyword in text
- **Project matching** — `_keyword_overlap()`: keyword set intersection, threshold 0.35. Tech stack cross-validation: if claim mentions React/Python etc., repo must also mention it.
- **Unmatched project classification** — keyword-based only:
  - `CLASSIFIED_HINTS` match → `LIKELY_PRIVATE_CLASSIFIED`
  - `CORPORATE_HINTS` match → `LIKELY_PRIVATE_CORPORATE`
  - Neither → `CLAIM_NO_EVIDENCE`
- Skips experience section entirely
- LLM call: `max_tokens=4096`

### Agent 5 — Report Generator (`agents/report_generator.py`)
- **Pre-filters timeline flags deterministically** before Claude call:
  - `_has_time_claim(skill, resume_claims)` — regex for "X years of Python", "Python since 2019"
  - Injects `TIMELINE ANALYSIS` section into context; if no time claims → context says "must be []"
- **Annotates forks** in context: `[FORK]` per repo, `[FORK — ask about contribution, not creation]` per matched project
- Produces `RecruiterReport` (overview, timeline_flags, activity_patterns, project_interview_questions) and `CandidateReport`
- LLM call: `max_tokens=4096`

### LangGraph wiring (`pipeline.py`)
- `parse_resume → scrape_github` → conditional: if `github_data is None` → `generate_report`, else → `detect_ai_code → verify_coherence → generate_report`
- `stream_pipeline()` uses `_compiled.stream(stream_mode="values")` — yields full state after each agent so `routes.py` updates `_results[run_id]` live

---

## Data Models (`core/models.py`)

```
RepoData                  ← Agent 2 per repo; .dependencies = {"python": [], "javascript": []}
GitHubScrapeResult        ← Agent 2 full output
ResumeClaim               ← Agent 1 per claim
ResumeClaimsResult        ← Agent 1 full output
RepoAIScore               ← Agent 3 per repo
AIDetectionResult         ← Agent 3 full output
CoherenceCheck            ← Agent 4 per claim
CoherenceReport           ← Agent 4 full output (checks + interview questions)

TimelineFlag              ← { observation, evidence, interview_question }
ActivityPatterns          ← { account_age, most_active_languages, repo_velocity, commit_pattern }
ProjectInterviewQuestion  ← { project, matched_repo, interview_question }
RecruiterReport           ← { overview, timeline_flags, activity_patterns, project_interview_questions }
CandidateReport           ← { candidate, strengths, areas_to_address, summary }
FinalReport               ← { recruiter, candidate, generated_at }
```

---

## Constants (`core/constants.py`)

| Constant | Value | Used by |
|---|---|---|
| `RECENT_CREATION_DAYS` | 20 | github_scraper |
| `SAMPLE_COMMITS` | 5 | ai_code_detector |
| `MAX_PATCH_CHARS` | 3000 | ai_code_detector |
| `PROJECT_MATCH_THRESHOLD` | 0.35 | coherence_verifier |
| `SKIP_SKILLS` | ~20 tools (git, Jira, Slack…) | coherence_verifier |
| `SKILL_ALIASES` | ~50 skills → language aliases | coherence_verifier |
| `STOPWORDS` | common words filtered from keyword overlap | coherence_verifier |
| `CLASSIFIED_HINTS` | gov/military/classified keywords | coherence_verifier |
| `CORPORATE_HINTS` | enterprise/production/business + contractor names | coherence_verifier |

---

## Report Generator Prompt Rules

**Timeline flags:**
- `_has_time_claim()` pre-filters deterministically — LLM never sees ambiguous cases
- Context injects explicit TIMELINE ANALYSIS section; hard rule: if empty → return `[]`

**Project interview questions:**
- One per project (matched or unmatched)
- Forked repos → ask about contribution, not creation (context annotated, prompt rules explicit)
- Never mention "Jupyter Notebook" — reference Python instead
- Unmatched → ask where code lives

**Activity patterns:** `commit_pattern` must be neutral — no AI/suspicious/fraud language.

---

## Frontend Routes

```
/        → LandingPage.jsx
/verify  → VerifyPage (form → polling → report)
*        → redirect to /
```

React Router v6. `VerifyPage` defined inline in `App.jsx`.

---

## Report UI (`ReportView.jsx`)

1. Candidate header — username + stats
2. Overview — factual LLM summary
3. Timeline flags — amber border, ⚠ + question. Green ✓ if none.
4. Skill evidence — green pills (supported), grey pills (no evidence)
5. Activity patterns — 2×2 stat cards
6. Project claims — ✓ linked repo or ✗/⚠/🔒 with note
7. Interview questions — numbered list (timeline + project combined); grey context label per item
8. Repo reference — clickable links, commits, languages, flag badges
9. Debug panel — collapsible errors

| Flag | Icon | Color | Note |
|---|---|---|---|
| `CLAIM_NO_EVIDENCE` | ✗ | red | "No matching repo found" |
| `LIKELY_PRIVATE_CORPORATE` | ⚠ | amber | "Corporate/private repo expected" |
| `LIKELY_PRIVATE_CLASSIFIED` | 🔒 | grey | "Classified/private work expected" |

---

## CORS (`main.py`)

Allowed origins:
- `http://localhost:5173`
- `https://verif-ai-nine.vercel.app`

`allow_credentials=True` is set.

---

## Decisions — Do Not Revert

- **Anthropic Claude, not OpenAI** — all LLM calls use `client.messages.create(system=..., messages=[...])`
- **No trust score, no risk label, no recommendation** — report surfaces evidence; recruiter decides
- **No numeric AI score** — qualitative signals only
- **Experience section never checked** — corporate code lives in private repos
- **Skills evaluated individually** — no grouped claims
- **Timeline flags only on explicit time claims** — `_has_time_claim()` pre-filters
- **Forked repo questions ask about contribution, not creation**
- **Jupyter Notebook never mentioned in questions** — reference Python instead
- **Dependency files checked first** in skill matching
- **Alias match requires text confirmation** — prevents over-counting
- **Project classification is keyword-only** — no company name extraction
- **No business logic in `main.py` or `pipeline.py`** — wiring only
- **Errors accumulated, not fatal**

---

## Open Issues

| Issue | Status |
|---|---|
| PDF worker on Vercel | Not yet tested on live Vercel after pdfjs@3.11.174 fix |
| In-memory result store | `_results` resets on Railway restart — needs SQLite persistence |
| Vercel env var | `VITE_API_URL` must be set in Vercel dashboard |
| Railway env var | `ANTHROPIC_API_KEY` must be set (replacing `OPENAI_API_KEY`) |

---

## What's Next

1. **Set env vars** — `VITE_API_URL` in Vercel, `ANTHROPIC_API_KEY` in Railway
2. **Deploy + test end-to-end** — full pipeline on hosted version
3. **Persistence** — SQLite store so results survive Railway restarts

---

## Session Log

### Session 1 — 2026-05-30
Full scaffold: 5-agent pipeline, FastAPI, LangGraph, React frontend, Railway + Vercel deployment.

### Session 2 — 2026-05-31
All 5 agents implemented. Skill matching debugged. PDF worker iterations. Live polling fixed.

### Session 3 — 2026-06-01
Report redesigned (no score/risk). `core/constants.py` created. Skill aliases tightened. Dep fetching added. Landing page + React Router.

### Session 5 — 2026-06-02

**Root cause of claims=0 / project_matches=[] found and fixed**
- `resume_parser.py` had `max_tokens=2000`. With the full system prompt (~1062 input tokens), Claude's JSON output for a real resume (30+ claims × 7 fields each) hits 2000 tokens and is truncated mid-string. `_extract_json` silently returns `{}`, `data.get("claims", [])` returns `[]`, and no error is ever logged.
- Confirmed via `stop_reason=max_tokens` and `output_tokens=2000` (the exact limit).
- **Fix 1:** Raised `max_tokens` from 2000 → 4096 in `resume_parser.py`.
- **Fix 2:** Added explicit error log when `_extract_json` returns `{}` — logs `stop_reason` and `output_tokens` so truncation is always visible in `state.errors`.
- All other agents already use 4096 tokens. 2000 was the only outlier.

**ReportView.jsx debug logging + null guard hardened**
- Added `console.log('ReportView state keys:', ...)` and `console.log('project_matches:', project_matches)` at top of `ReportView` default export so the browser console shows exactly what the frontend receives.
- Changed `ProjectMatches` null guard from `if (!matches?.length)` to explicit `if (!matches || matches.length === 0)` — same behavior, clearer intent.
- Confirmed no field name mismatch: API returns `snake_case` (`project_matches`) matching the Python TypedDict key; frontend destructures the same name. No camelCase issue.

**Root cause found: `project_matches` null in frontend**
- Bug was in `StatusPoll.jsx` — the `done` condition had an early-exit path:
  `state.errors?.length > 0 && state.current_agent !== "queued"`
- Pipeline errors are non-fatal and accumulate throughout the run (e.g., 404s from README fetches logged during `github_scraper`). A single accumulated error caused `onComplete(state)` to fire while still mid-pipeline, passing an intermediate snapshot where `verify_coherence` hadn't run yet → `project_matches: null`.
- **Fix:** Removed the error-triggered early exit. `onComplete` now only fires when `state.final_report !== null`.
- Confirmed `routes.py` is correct — it correctly streams live state updates per agent; `coherence_verifier.py` is correct — `project_matches` is populated and non-null in the final state.
- Added/removed `verifai/debug_run.py` (temp debug script — can be deleted).

### Session 4 — 2026-06-02
- Timeline pre-filtering (`_has_time_claim()`), project interview questions, fork annotation, Jupyter rule.
- Project classification simplified to keyword-only (`CORPORATE_HINTS`).
- `InterviewQuestions` component in ReportView.
- `api.js` BASE URL reads `VITE_API_URL` env var.
- CORS updated: Vercel origin added, `allow_credentials=True`.
- **LLM provider switched from OpenAI to Anthropic.** All 4 agents updated to `client.messages.create(system=..., messages=[...])`. `requirements.txt`: `openai` → `anthropic`.
- MODEL updated to `claude-sonnet-4-5`.
- `_extract_json()` added locally to resume_parser, coherence_verifier, report_generator — handles markdown fences, embedded JSON fallback, returns `{}` on failure instead of raising.
