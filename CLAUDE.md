# ⚠️ IMPORTANT: Update this file at the END of every session
Add anything new that was built, fixed, decided, or changed.
This is the single source of truth for all Claude Code sessions.

---

# VerifAI — Claude Code Session Context

Read this at the start of every session. Update it at the end.

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
(remote uses SSH: `git@github.com:subbarayudu8660/VerifAI.git`)

---

## 5-Agent Pipeline

All agents share `PipelineState` (TypedDict in `state.py`). Each agent reads from it and writes its output back to it. The pipeline runs via LangGraph `StateGraph` in `pipeline.py`.

| Agent | File | Status | What it does |
|-------|------|--------|--------------|
| 1 — Resume Parser | `agents/resume_parser.py` | IMPLEMENTED | Calls OpenAI to extract structured claims from raw resume text. Each claim has: `claim`, `category` (skill/project/role/education/achievement), `source_section`, `skip_github_check`, `confidence`, `raw_text`. Experience section claims are tagged `skip_github_check: true`. |
| 2 — GitHub Scraper | `agents/github_scraper.py` | IMPLEMENTED | Fetches repos, commits, languages, contributor counts via GitHub API. Detects 5 flag types: recent creation, solo-only, first-commit-in-language, no-commit-history, fork-no-contribution. Standalone: `python -m agents.github_scraper <username>` |
| 3 — AI Code Detector | `agents/ai_code_detector.py` | IMPLEMENTED | Samples up to 5 recent commit diffs per repo (max 3000 chars each), sends to OpenAI for AI-generation likelihood scoring. Returns qualitative signals per repo — no numeric score exposed to users. |
| 4 — Coherence Verifier | `agents/coherence_verifier.py` | IMPLEMENTED | Scores skills against GitHub language/commit evidence, matches project claims to repos, generates interview questions. Skips experience section entirely. Skills evaluated individually. **See known issues below — skill matching is broken.** |
| 5 — Report Generator | `agents/report_generator.py` | IMPLEMENTED | Synthesises all prior outputs into `RecruiterReport` (risk level, red flags, recommendation) and `CandidateReport` (strengths, honest feedback). Calls OpenAI for narrative synthesis. |

### LangGraph conditional edge
If `github_data is None` after Agent 2 (API failure), Agents 3 and 4 are skipped entirely.

---

## Full File Structure

```
verifAI/                          ← project root (CLAUDE.md lives here)
└── verifai/                      ← git root (git@github.com:subbarayudu8660/VerifAI.git)
    ├── main.py                   ← FastAPI entrypoint (wiring only, no business logic)
    ├── pipeline.py               ← LangGraph StateGraph (wiring only)
    ├── state.py                  ← PipelineState TypedDict
    ├── requirements.txt
    ├── .env                      ← local secrets (gitignored)
    ├── .env.example
    ├── .gitignore
    ├── agents/
    │   ├── resume_parser.py      ← Agent 1
    │   ├── github_scraper.py     ← Agent 2
    │   ├── ai_code_detector.py   ← Agent 3
    │   ├── coherence_verifier.py ← Agent 4
    │   └── report_generator.py   ← Agent 5
    ├── core/
    │   ├── github_client.py      ← GitHub API wrapper (backoff, pagination, rate-limit logging)
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
            ├── api.js            ← fetch wrapper — BASE URL hardcoded to localhost:8000
            └── components/
                ├── UploadForm.jsx   ← GitHub username + PDF upload, pdfjs parsing
                ├── StatusPoll.jsx   ← polls GET /results/{run_id} until complete
                └── ReportView.jsx   ← renders RecruiterReport + CandidateReport
```

---

## Environment Variables

Create `verifai/.env` (never commit it):

```
GITHUB_TOKEN=ghp_your_token_here
OPENAI_API_KEY=sk-your_key_here
```

Set these same vars in Railway (backend). Vercel frontend doesn't need them.

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

The frontend `api.js` hardcodes `BASE = "http://localhost:8000"` — fine for local, broken on Vercel.

---

## Decisions Made (do not revert)

- **No numeric AI score** — Agent 3 produces qualitative signals only. A number felt misleading; the report describes patterns instead.
- **Experience section skipped from GitHub checks** — corporate/internship code lives in private repos; checking it always produces false negatives. Claims tagged `skip_github_check: true`.
- **Skills evaluated individually, not as groups** — "Python, Django, REST APIs" → three separate evidence checks, not one grouped verdict.
- **No business logic in `main.py` or `pipeline.py`** — wiring only.
- **All inter-agent data via Pydantic models** — never raw dicts between agents.
- **Errors are accumulated, not fatal** — `errors: list[str]` in state; pipeline continues on agent failure.

---

## Current Known Issues

| Issue | Status | Notes |
|-------|--------|-------|
| PDF worker ("Load failed") on Vercel | **In progress** | Switched to `new URL('pdfjs-dist/build/pdf.worker.min.js', import.meta.url)` + downgraded pdfjs-dist to 3.11.174 (pinned). Not yet pushed — testing locally first. |
| Skill matching broken — 0 evidence for real skills | **OPEN — needs fix** | React, Node.js, JavaScript, LangChain, MongoDB etc. show 0 evidence despite being in repos. Root cause: `_skill_in_repo()` only checks exact `skill_lower in readme` — README text isn't being searched properly, and aliases aren't handled (e.g. "JS" ≠ "JavaScript"). |
| Project name matching too strict | **OPEN — needs fix** | `_check_projects()` uses word overlap on repo name + description only. Needs fuzzy keyword matching — overlap of meaningful tokens, not string similarity. |
| `api.js` BASE URL hardcoded to `localhost:8000` | **Open** | Vercel frontend can't reach Railway backend. Fix: `import.meta.env.VITE_API_URL` + set var in Vercel dashboard. |
| `has_readme` approximated | Open | Needs GitHub tree API call in `github_client.py` for exact check. |
| In-memory result store | Open | `_results` dict in `api/routes.py` resets on Railway restart; needs SQLite or file persistence. |

---

## UI Changes Pending (not yet implemented)

- **Remove "Claimed Level" column** from skill verification table — adds noise, not useful.
- **Replace confidence % with repo count** — show "3 repos" instead of "75%" for skill evidence.
- **Collapse 0-evidence skills to bottom** — skills with no GitHub evidence should be visually separated (e.g. greyed out section at the bottom), not mixed with evidenced skills.

---

## What's Next (priority order)

1. **Fix skill matching in `coherence_verifier.py`** — `_skill_in_repo()` needs alias handling (JS→JavaScript, Node→Node.js etc.) and proper README search. This is the most impactful correctness fix.
2. **Fix project matching** — replace word-overlap with fuzzy keyword matching in `_check_projects()`.
3. **Apply UI changes above** — ReportView.jsx skill table cleanup.
4. **Fix `api.js` BASE URL** — `import.meta.env.VITE_API_URL`, set in Vercel env vars.
5. **Landing page** — marketing/explainer page before the upload form.
6. **`has_readme` exact check** — use GitHub tree API in `github_client.py`.
7. **Persistence** — replace in-memory `_results` dict with SQLite or file-based store.

---

## Session Log

### Session 1 — 2026-05-30
Built full scaffold: all 5 agents (Agent 2 fully implemented, rest stubs), core modules, FastAPI routes, LangGraph pipeline, requirements, README.

### Session 2 — 2026-05-31
- All 5 agents fully implemented (resume parser, AI detector, coherence verifier, report generator)
- React frontend built: UploadForm, StatusPoll, ReportView components
- Deployed: backend → Railway, frontend → Vercel
- Fixed PDF worker path (multiple iterations): currently on `new URL(...)` + pdfjs-dist 3.11.174 (testing locally, not yet pushed)
- Identified skill matching bug: 0 evidence for React, Node.js, JS, LangChain, MongoDB etc.
- Identified project matching as too strict (needs fuzzy keyword overlap)
- Pending UI changes: remove Claimed Level column, show repo count not %, collapse 0-evidence skills
- Clarified git repo lives at `verifai/` (inner dir), not project root
