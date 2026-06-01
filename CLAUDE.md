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

**Vercel env var required for hosted deployment:**
Set `VITE_API_URL=https://verifai-production-d9d4.up.railway.app` in the Vercel dashboard.
`api.js` reads `import.meta.env.VITE_API_URL || "http://localhost:8000"` — already fixed.

---

## Environment Variables

`verifai/.env` (never commit):
```
GITHUB_TOKEN=ghp_...
OPENAI_API_KEY=sk-...
```
Set both in Railway dashboard. Vercel needs `VITE_API_URL` only.

---

## Full File Structure

```
verifAI/                            ← project root (CLAUDE.md here, gitignored by inner repo)
└── verifai/                        ← git root
    ├── main.py                     ← FastAPI app + CORS (wiring only)
    ├── pipeline.py                 ← LangGraph StateGraph + stream_pipeline()
    ├── state.py                    ← PipelineState TypedDict with per-field comments
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
    │   ├── github_client.py        ← GitHub API wrapper + get_file_contents()
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
            ├── api.js              ← fetch wrappers, reads VITE_API_URL env var
            └── components/
                ├── UploadForm.jsx  ← GitHub username + PDF upload (pdfjs@3.11.174)
                ├── StatusPoll.jsx  ← polls every 3s, shows live agent progress
                └── ReportView.jsx  ← intelligence report UI
```

---

## 5-Agent Pipeline

State flows through `PipelineState` (TypedDict). Each agent sets `state["current_agent"]` on entry — frontend polls this for live progress.

### Agent 1 — Resume Parser (`agents/resume_parser.py`)
- Calls OpenAI to extract structured claims from raw resume text
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

### Agent 3 — AI Code Detector (`agents/ai_code_detector.py`)
- Samples up to 5 recent commit diffs per repo (max 3000 chars each)
- Scores each repo for AI-generation likelihood via OpenAI
- Qualitative signals only — no numeric score shown to users

### Agent 4 — Coherence Verifier (`agents/coherence_verifier.py`)
- **Skill matching** — `_skill_in_repo()` checks in priority order:
  1. Dependency files (explicit package in requirements.txt / package.json)
  2. GitHub language API (strong for language-level skills)
  3. README / description / repo name text
  4. Alias match: language alias must match AND skill keyword in text
- **Project matching** — `_keyword_overlap()`: keyword set intersection, threshold 0.35. Tech stack cross-validation: if claim mentions React/Python etc., repo must also mention it.
- **Unmatched project classification** — keyword-based, no company name extraction:
  - `CLASSIFIED_HINTS` match → `LIKELY_PRIVATE_CLASSIFIED`
  - `CORPORATE_HINTS` match → `LIKELY_PRIVATE_CORPORATE`
  - Neither → `CLAIM_NO_EVIDENCE`
- Skips experience section entirely

### Agent 5 — Report Generator (`agents/report_generator.py`)
- Pre-filters timeline flags deterministically before calling OpenAI:
  - `_has_time_claim(skill, resume_claims)` — regex patterns for "X years of Python", "Python since 2019" etc.
  - Injects `TIMELINE ANALYSIS` section into context: lists skills with time claims, or states "must be []"
- Annotates forked repos with `[FORK]` in context so LLM asks about contributions not creation
- Annotates matched project lines with `[FORK — ask about contribution, not creation]` where applicable
- Produces `RecruiterReport` (overview, timeline_flags, activity_patterns, project_interview_questions) and `CandidateReport`

### LangGraph wiring (`pipeline.py`)
- `parse_resume → scrape_github` → conditional: if `github_data is None` → `generate_report`, else → `detect_ai_code → verify_coherence → generate_report`
- `stream_pipeline()` uses `_compiled.stream(stream_mode="values")` — yields full state after each agent, so `routes.py` updates `_results[run_id]` live

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

All hardcoded values — never inline in agent files:

| Constant | Value | Used by |
|---|---|---|
| `RECENT_CREATION_DAYS` | 20 | github_scraper |
| `SAMPLE_COMMITS` | 5 | ai_code_detector |
| `MAX_PATCH_CHARS` | 3000 | ai_code_detector |
| `PROJECT_MATCH_THRESHOLD` | 0.35 | coherence_verifier |
| `SKIP_SKILLS` | ~20 tools (git, Jira, Slack…) | coherence_verifier |
| `SKILL_ALIASES` | ~50 skills | coherence_verifier |
| `STOPWORDS` | common words excluded from keyword overlap | coherence_verifier |
| `CLASSIFIED_HINTS` | gov/military keywords | coherence_verifier |
| `CORPORATE_HINTS` | enterprise/production/business keywords | coherence_verifier |

**`SKILL_ALIASES` design:** Empty list `[]` means text-match only (no language pre-filter). ML/AI libraries, databases, auth patterns all require explicit text confirmation — prevents "LangChain" matching every Python repo.

**`CORPORATE_HINTS`** covers both semantic signals ("enterprise", "production", "pipeline", "infrastructure") and structural signals ("internship", "llc", "inc.") and named contractors ("palantir", "saic", etc.).

---

## Report Generator Prompt Rules (Agent 5)

Key rules baked into the prompt and enforced deterministically:

**Timeline flags:**
- Pre-filtered by `_has_time_claim()` before LLM sees data
- Context explicitly says which skills have time claims (or states "must be []")
- LLM hard rule: if TIMELINE ANALYSIS says none, return `[]` — no exceptions

**Project interview questions:**
- One per project claim (matched or unmatched)
- Forked repos: NEVER ask "how did you build this" — ALWAYS ask about specific contribution
- `[FORK]` and `[FORK — ask about contribution, not creation]` annotations injected into context
- NEVER mention "Jupyter Notebook" — reference Python instead
- Unmatched: ask where code lives and to walk through it

**Activity patterns:**
- `commit_pattern` must be neutral — no mention of AI, suspicious, or fraud

---

## Frontend Routes (`App.jsx`)

```
/        → LandingPage.jsx   (marketing page)
/verify  → VerifyPage        (form → polling → report)
*        → redirect to /
```

React Router v6. `VerifyPage` defined inline in `App.jsx`.

---

## Report UI (`ReportView.jsx`)

Sections top to bottom:

1. **Candidate header** — username, GitHub since year, repo/commit/language counts
2. **Overview** — 2-3 sentence factual summary from Agent 5
3. **Timeline flags** — amber left border, ⚠ observation + evidence + interview question. Green ✓ if none.
4. **Skill evidence** — green pills (supported) and grey pills (no public evidence)
5. **Activity patterns** — 2×2 grid stat cards
6. **Project claims** — ✓ matched repo link, or ✗/⚠/🔒 with classification note
7. **Interview questions** — numbered list combining timeline flag questions + per-project questions; grey context label above each ("Re: Timeline", "Re: {repo}", "Re: Unmatched project…")
8. **Repo reference** — table with clickable repo links, commits, languages, flag badges
9. **Debug panel** — collapsible, pipeline errors only

**Project claim display:**

| Flag | Icon | Color | Note shown |
|---|---|---|---|
| `CLAIM_NO_EVIDENCE` | ✗ | red | "No matching repo found" |
| `LIKELY_PRIVATE_CORPORATE` | ⚠ | amber | "Corporate/private repo expected" |
| `LIKELY_PRIVATE_CLASSIFIED` | 🔒 | grey | "Classified/private work expected" |

---

## Landing Page (`LandingPage.jsx`)

Hero (dark navy) → Problem → How it works (3 numbered cards) → What you get (bullet list + live JSX report mockup) → Who it's for (3 audience cards) → CTA (dark navy) → Footer.

The mockup uses identical JSX/styles to `ReportView` — not a screenshot.

---

## Decisions — Do Not Revert

- **No trust score, no risk label, no recommendation** — report surfaces evidence; recruiter decides
- **No numeric AI score** — qualitative signals only
- **Experience section never checked** — corporate code lives in private repos
- **Skills evaluated individually** — "Python, Django, REST APIs" → 3 separate checks
- **Timeline flags only on explicit time claims** — bare "Python" listing → no flag
- **Timeline flags pre-filtered deterministically** — `_has_time_claim()` runs before LLM call
- **Forked repo questions ask about contribution, not creation** — enforced via context annotation + prompt rule
- **Jupyter Notebook never mentioned in questions** — reference Python instead
- **Commit pattern must be neutral** — no AI/suspicious/fraud language
- **Dependency files checked first** — more reliable than language API or README
- **Alias match requires text confirmation** — prevents over-counting
- **Project classification is keyword-based** — `CLASSIFIED_HINTS` before `CORPORATE_HINTS` before `CLAIM_NO_EVIDENCE`; no company name extraction
- **No business logic in `main.py` or `pipeline.py`** — wiring only
- **Errors accumulated, not fatal** — pipeline always continues

---

## Open Issues

| Issue | Fix |
|---|---|
| PDF worker on Vercel | `UploadForm.jsx` uses `new URL('pdfjs-dist/build/pdf.worker.min.js', import.meta.url)` + pdfjs@3.11.174. Not yet tested on live Vercel. |
| In-memory result store | `_results` dict in `routes.py` resets on Railway restart. Fix: SQLite or file-based store. |
| Vercel env var not yet set | `VITE_API_URL` must be added in Vercel dashboard to connect hosted frontend to Railway backend. |

---

## What's Next

1. **Set `VITE_API_URL` in Vercel dashboard** — unblocks end-to-end hosted flow
2. **Test full pipeline on Vercel** — PDF upload + verification + report display
3. **Persistence** — SQLite store so results survive Railway restarts
4. **Landing page polish** — mobile responsiveness test, copy review

---

## Session Log

### Session 1 — 2026-05-30
Full scaffold: 5-agent pipeline, FastAPI, LangGraph, React frontend, Railway + Vercel deployment.

### Session 2 — 2026-05-31
All 5 agents implemented. Skill matching debugged (aliases, dep file priority). PDF worker iterations. Live polling fixed (`stream_pipeline`).

### Session 3 — 2026-06-01
- Report redesigned: trust score/risk label removed. New `RecruiterReport`: overview, timeline_flags, activity_patterns.
- `ReportView.jsx` rewritten as intelligence report.
- `core/constants.py` created — all constants centralised.
- `SKILL_ALIASES` tightened. Project matching threshold → 0.35 + tech stack cross-validation.
- Dependency fetching added to Agent 2. `_skill_in_repo()` checks deps first.
- Landing page built (`LandingPage.jsx`) + React Router in `App.jsx`.

### Session 4 — 2026-06-02
- Timeline flag pre-filtering: `_has_time_claim()` runs before LLM; injects TIMELINE ANALYSIS section into context; prompt has HARD RULE not soft suggestion.
- `ProjectInterviewQuestion` model added; `project_interview_questions` added to `RecruiterReport` and LLM output.
- `InterviewQuestions` component added to `ReportView` (numbered list, timeline + project questions combined).
- Fork rule: forked repos annotated with `[FORK]` in context; prompt rule enforces contribution questions not creation questions.
- Jupyter Notebook rule: never mentioned in interview questions — reference Python instead.
- Project classification rewritten: `_classify_unmatched()` now keyword-only (no company name extraction); `CORPORATE_HINTS` added to constants; `PRIVATE_HINTS` removed.
- `PROJECT_FLAG_DISPLAY` notes fixed in frontend.
- `api.js` BASE URL fixed: reads `import.meta.env.VITE_API_URL || "http://localhost:8000"`.
