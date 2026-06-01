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

**Known issue:** `frontend/src/api.js` has `BASE = "http://localhost:8000"` hardcoded. Works locally. Vercel deployment can't reach Railway until this is fixed with `import.meta.env.VITE_API_URL`.

---

## Environment Variables

`verifai/.env` (never commit):
```
GITHUB_TOKEN=ghp_...
OPENAI_API_KEY=sk-...
```
Set both in Railway dashboard. Vercel needs neither.

---

## Full File Structure

```
verifAI/                            ← project root (CLAUDE.md here, gitignored by inner repo)
└── verifai/                        ← git root
    ├── main.py                     ← FastAPI app + CORS (wiring only)
    ├── pipeline.py                 ← LangGraph StateGraph + stream_pipeline()
    ├── state.py                    ← PipelineState TypedDict with field comments
    ├── requirements.txt
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
    │   ├── github_client.py        ← GitHub API wrapper
    │   └── llm.py                  ← OpenAI client factory
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
            ├── api.js              ← fetch wrappers (BASE hardcoded to localhost:8000)
            └── components/
                ├── UploadForm.jsx  ← GitHub username + PDF upload
                ├── StatusPoll.jsx  ← polls every 3s, shows live agent progress
                └── ReportView.jsx  ← intelligence report UI
```

---

## 5-Agent Pipeline

State flows through `PipelineState` (TypedDict). Each agent sets `state["current_agent"]` on entry — frontend polls this for live progress.

### Agent 1 — Resume Parser (`agents/resume_parser.py`)
- Calls OpenAI to extract structured claims from raw resume text
- Each claim: `claim`, `category` (skill/project/role/education/achievement), `source_section`, `skip_github_check`, `confidence`, `raw_text`
- Experience section claims get `skip_github_check: true` — never checked against GitHub
- Skills extracted individually, never grouped

### Agent 2 — GitHub Scraper (`agents/github_scraper.py`)
- Fetches repos, commits, languages, contributors, README text
- **Also fetches dependency files** for qualifying repos (≥10 commits, not a fork, not Jupyter-only):
  - `requirements.txt` → Python deps list
  - `package.json` → JS deps list (dependencies + devDependencies)
  - `pyproject.toml` → Python deps fallback
- Flags: `RECENT_CREATION` (≤20 days), `NO_COMMIT_HISTORY` (0–1 commits), `FORK_NO_CONTRIBUTION`
- Standalone: `python -m agents.github_scraper <username>`

### Agent 3 — AI Code Detector (`agents/ai_code_detector.py`)
- Samples up to 5 recent commit diffs per repo (max 3000 chars each)
- Scores each repo for AI-generation likelihood via OpenAI
- Qualitative signals only — no numeric score shown to users

### Agent 4 — Coherence Verifier (`agents/coherence_verifier.py`)
- **Skill matching** — `_skill_in_repo()` checks in this priority order:
  1. Dependency files (most reliable — explicit package listed)
  2. GitHub language API (strong for language-level skills)
  3. README / description / repo name text (supporting evidence)
  4. Alias match: language alias must match AND skill keyword in text (prevents over-counting)
- **Project matching** — `_keyword_overlap()`: keyword set intersection (stopwords filtered), threshold 0.35. Also validates tech stack: if claim mentions React/Node/Python etc., repo must mention it too.
- Skips experience section entirely
- LLM generates interview questions for contradicted claims only

### Agent 5 — Report Generator (`agents/report_generator.py`)
- Builds context including skill_verification and project_matches
- Calls OpenAI → returns intelligence report (no verdicts, no scores)
- Produces `RecruiterReport` + `CandidateReport`

### LangGraph wiring
- `parse_resume → scrape_github` → conditional: if `github_data is None` → `generate_report`, else → `detect_ai_code → verify_coherence → generate_report`
- `stream_pipeline()` in `pipeline.py` uses `_compiled.stream(stream_mode="values")` — yields full state after each agent so `routes.py` can update `_results[run_id]` live during the run

---

## Data Models (`core/models.py`)

```
RepoData              ← Agent 2 output per repo
  .dependencies       ← {"python": [...], "javascript": [...]} from dep files

GitHubScrapeResult    ← Agent 2 output (all repos)
ResumeClaim           ← Agent 1 output per claim
ResumeClaimsResult    ← Agent 1 output (all claims)
RepoAIScore           ← Agent 3 output per repo
AIDetectionResult     ← Agent 3 output (all repos)
CoherenceCheck        ← Agent 4 output per claim
CoherenceReport       ← Agent 4 output (all checks + interview questions)

TimelineFlag          ← Agent 5: { observation, evidence, interview_question }
ActivityPatterns      ← Agent 5: { account_age, most_active_languages, repo_velocity, commit_pattern }
RecruiterReport       ← Agent 5: { overview, timeline_flags, activity_patterns }
CandidateReport       ← Agent 5: { candidate, strengths, areas_to_address, summary }
FinalReport           ← Agent 5: { recruiter, candidate, generated_at }
```

---

## Constants (`core/constants.py`)

All hardcoded values — never put them inline in agent files:

| Constant | Value | Used by |
|---|---|---|
| `RECENT_CREATION_DAYS` | 20 | github_scraper |
| `SAMPLE_COMMITS` | 5 | ai_code_detector |
| `MAX_PATCH_CHARS` | 3000 | ai_code_detector |
| `PROJECT_MATCH_THRESHOLD` | 0.35 | coherence_verifier |
| `SKIP_SKILLS` | set of ~20 tools | coherence_verifier |
| `SKILL_ALIASES` | dict of ~50 skills | coherence_verifier |
| `STOPWORDS` | set for keyword overlap | coherence_verifier |
| `CLASSIFIED_HINTS` | list | coherence_verifier |
| `PRIVATE_HINTS` | list | coherence_verifier |

**`SKILL_ALIASES` design:** Maps resume skill → language aliases used as a first-pass filter. Empty list `[]` means text-match only (no language pre-filter). Broad mappings like "python → all Python repos for LangChain" were removed — ML/AI libraries, databases, auth patterns all require explicit text confirmation.

---

## Frontend Routes (`App.jsx`)

```
/         → LandingPage.jsx   (marketing page)
/verify   → VerifyPage        (form → polling → report)
*         → redirect to /
```

React Router v6. `VerifyPage` is defined inline in `App.jsx`.

---

## Report UI (`ReportView.jsx`)

Intelligence report layout (top to bottom):

1. **Candidate header** — username, GitHub since year, repo count, commit count, language count
2. **Overview** — 2-3 sentence factual summary from Agent 5 LLM
3. **Timeline flags** — amber left border, ⚠ observation, evidence, interview question in italic. Green ✓ if none.
4. **Skill evidence** — two pill groups: green (supported) and grey (no public evidence). Never red.
5. **Activity patterns** — 2×2 grid: account age, most active languages, repo velocity, commit pattern
6. **Project claims** — ✓ matched repo (clickable GitHub link) or ✗/⚠/🔒 with flag reason
7. **Repo reference** — table with repo name as clickable link, commits, languages, flag badges
8. **Debug panel** — collapsible, pipeline errors only

Repo flag badges: "Recently created" (≤20 days), "No commit history", "Fork"

---

## Landing Page (`LandingPage.jsx`)

Six sections: Hero (dark navy) → Problem → How it works (3 cards) → What you get (prose + live report mockup) → Who it's for (3 audience cards) → CTA (dark navy). Footer below.

The report mockup in "What you get" is real JSX using identical styles to `ReportView` — not a screenshot.

Both CTA buttons navigate to `/verify` via `useNavigate`.

---

## Decisions — Do Not Revert

- **No trust score, no risk label, no recommendation** — removed entirely. The report surfaces evidence; the recruiter decides.
- **No numeric AI score** — qualitative signals only per repo.
- **Experience section never checked** — corporate code is in private repos; always false negatives.
- **Skills evaluated individually** — "Python, Django, REST APIs" → 3 separate checks.
- **Timeline flags only on explicit time claims** — resume must say "5 years of Python" or "Python since 2019". Listing "Python" with no timeframe → no flag.
- **Commit pattern description must be neutral** — never mention AI, suspicious, or fraud.
- **Dependency files checked first** — more reliable than language API or README text.
- **Alias match requires text confirmation** — prevents "LangChain" matching every Python repo.
- **No business logic in `main.py` or `pipeline.py`** — wiring only.
- **Errors accumulated, not fatal** — pipeline always continues.

---

## Open Issues

| Issue | Fix |
|---|---|
| `api.js` BASE URL hardcoded to `localhost:8000` | Replace with `import.meta.env.VITE_API_URL`, set `VITE_API_URL=https://verifai-production-d9d4.up.railway.app` in Vercel env vars |
| PDF worker on Vercel | `UploadForm.jsx` uses `new URL('pdfjs-dist/build/pdf.worker.min.js', import.meta.url)` + pdfjs-dist@3.11.174. Not tested on Vercel yet. |
| In-memory result store | `_results` dict in `routes.py` resets on Railway restart. Fix: SQLite or file-based store. |

---

## What's Next

1. **Fix `api.js` BASE URL** — this is the blocker preventing the hosted version from working end-to-end
2. **Test PDF upload on Vercel** — after deploying
3. **Persistence** — SQLite store so results survive Railway restarts
4. **Polish landing page** — mobile test, copy refinement

---

## Session Log

### Session 1 — 2026-05-30
Full scaffold: 5-agent pipeline, FastAPI, LangGraph, React frontend, Railway + Vercel deployment.

### Session 2 — 2026-05-31
All 5 agents implemented. Skill matching debugged (aliases, dep file priority). PDF worker iterations. Live polling fixed (stream_pipeline).

### Session 3 — 2026-06-01
- Complete report redesign: trust score / risk label removed. New `RecruiterReport` has `overview`, `timeline_flags`, `activity_patterns`.
- `ReportView.jsx` rewritten as intelligence report (candidate header, timeline flags, skill pills, activity patterns, clickable repo table).
- `core/constants.py` created — all hardcoded values centralised.
- `SKILL_ALIASES` tightened — broad Python mappings removed; ML/AI/DB libs require text confirmation.
- Project matching threshold raised 0.25 → 0.35; tech stack cross-validation added.
- Dependency file fetching added to Agent 2 (requirements.txt, package.json, pyproject.toml).
- `_skill_in_repo()` now checks dep files first (priority 1).
- `get_file_contents()` added to `GitHubClient`.
- Timeline flag prompt rule: only fire when resume explicitly states a duration or start year.
- Landing page built: `LandingPage.jsx` + React Router wired in `App.jsx`.
