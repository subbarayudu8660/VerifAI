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

### Railway (backend)

| Variable | Value | Notes |
|---|---|---|
| `ANTHROPIC_API_KEY` | `sk-ant-...` | LLM calls |
| `GITHUB_TOKEN` | `ghp_...` | GitHub API — avoids rate limits |
| `ADMIN_TOKEN` | `verifai-admin-2026` | Bypasses IP rate limit for testing; omit to disable rate limiting entirely |

### Vercel (frontend)

| Variable | Value | Notes |
|---|---|---|
| `VITE_API_URL` | `https://verifai-production-d9d4.up.railway.app` | No trailing slash |

### Local (`verifai/.env` — never commit)

```
GITHUB_TOKEN=ghp_...
ANTHROPIC_API_KEY=sk-ant-...
```

`api.js` reads `import.meta.env.VITE_API_URL || "http://localhost:8000"` — already set up. `ADMIN_TOKEN` is not needed locally (rate limiting is disabled when the env var is unset).

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
- **No GitHub API calls** — uses only data already in `github_data` from state
- Single LLM call (`max_tokens=1024`) across all repos; context is README text + commit counts, frequency, languages, days since creation, contributor count
- `ai_likelihood` always `0.0` — qualitative `reasoning` + `indicators` strings only, no numeric score
- Skips repos with 0 commits; errors are non-fatal (appended to `state.errors`)

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
- **Annotates forks** in context: `[FORK]` per repo, `[FORK — ask about contribution, not creation]` per matched project
- Produces `RecruiterReport` (overview, activity_patterns, project_interview_questions) and `CandidateReport`
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

ActivityPatterns          ← { account_age, most_active_languages, repo_velocity, commit_pattern }
ProjectInterviewQuestion  ← { project, matched_repo, interview_question }
RecruiterReport           ← { overview, activity_patterns, project_interview_questions }
CandidateReport           ← { candidate, strengths, areas_to_address, summary }
FinalReport               ← { recruiter, candidate, generated_at }
```

---

## Constants (`core/constants.py`)

| Constant | Value | Used by |
|---|---|---|
| `RECENT_CREATION_DAYS` | 20 | github_scraper |
| `PROJECT_MATCH_THRESHOLD` | 0.35 | coherence_verifier |
| `SKIP_SKILLS` | ~20 tools (git, Jira, Slack…) | coherence_verifier |
| `SKILL_ALIASES` | ~50 skills → language aliases | coherence_verifier |
| `STOPWORDS` | common words filtered from keyword overlap | coherence_verifier |
| `CLASSIFIED_HINTS` | gov/military/classified keywords | coherence_verifier |
| `CORPORATE_HINTS` | enterprise/production/business + contractor names | coherence_verifier |

---

## Report Generator Prompt Rules

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
3. Skill evidence — green pills (supported), grey pills (no evidence)
4. Project claims — ✓ linked repo or ✗/⚠/🔒 with note
5. Activity patterns — 2×2 stat cards
6. Interview questions — numbered list (project questions only); grey context label per item
7. Repo reference — clickable links, commits, languages, flag badges
8. Debug panel — collapsible errors

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

### Session 20 — 2026-07-01

**Full Lovable-style redesign — visual only, no logic changes**

Design tokens applied globally (zero purple/indigo remaining):
- Primary: `#0f172a` (near-black slate), replaces all `#4f46e5`/`#6366f1` occurrences
- Background: `#f8fafc`, card border: `#e2e8f0`, green: `#16a34a`, amber: `#d97706`
- Font: `system-ui, -apple-system, 'Inter', 'Segoe UI', sans-serif`
- No shadows, no gradients — 1px borders only

**`LandingPage.jsx`** — complete rewrite:
- Sticky navbar: VerifAI logo left, nav links (How it works / The report / Pricing as anchor IDs), Sign in + filled-black "Try it free →" right
- Hero: badge pill "Now in private beta for technical recruiters", large left-aligned editorial headline "The reference check / for people who've / never had a job.", subheadline, dual CTAs, "Five free verifications. No credit card required." note
- Problem section: two-column layout — "THE PROBLEM" label left, bold statement + paragraph right; `id="how-it-works"` anchor
- Who it's for: two-column — headline left, bordered checklist card right with green checkmarks
- The Report: two-column — headline left, live-styled `QuickBriefPreview` mock card right (slate-blue left border, 3-column grid, outlined skill chips); `id="the-report"` anchor
- Pricing: centered, "PRICING" label, large headline, two CTAs; `id="pricing"` anchor
- Footer: minimal, logo + © 2026 + links

**`VerifyPage.jsx`**:
- Navbar: shared pattern (logo left, email + sign out right, 1px border)
- Page header: "Verify a candidate" h1 + subtitle
- Past verifications panel: "PAST VERIFICATIONS" / "Last 30 days" header, bordered card rows with GitHub icon + @username + optional `v.one_liner` (blank if not in API response) + date + chevron

**`UploadForm.jsx`**:
- Card: white, 1px border, no shadow
- Two-column grid layout: GITHUB USERNAME (with GitHub SVG icon in input) + RESUME PDF drop zone
- Bottom row: RemainingBadge left, "Run verification →" filled black button right
- Sign-in prompt restyled (no indigo)

**`ReportView.jsx`**:
- `ReportTopBar`: "← Back to verifications" (gray text button), large `@username` h1, subtitle (repos/commits), outline buttons for Download PDF + Share Report — no card wrapper, just borderBottom divider
- `RecruiterBriefSection`: `borderLeft: "3px solid #475569"` (muted slate, NOT purple), "QUICK BRIEF" label, one-liner, 3-column grid (Strongest Work / Skills / Profile Consistency); Skills column uses `skill_verification` chips (green-outlined confirmed, gray-outlined unconfirmed); Profile Consistency splits prose into "• sentence" bullets; footer row shows "FULL TECHNICAL EVIDENCE BELOW" + repo/commit count
- Standalone divider removed (it's inside the card now)
- Section numbering: gray "01"–"06" above each section title via `<SectionNum>` component
- SkillEvidence: outlined chips only (no filled green background)
- ProjectMatches: circular icon badge (color + "20" fill), claim text bold, sub-text gray
- ActivityPatterns: value bold + large, label below in small caps gray
- InterviewQuestions: "RE:" context in uppercase small caps
- RepoTable: renamed to "Repository Reference", added ROLE column (Owner/Fork from `is_fork`), monospace repo name links, muted flag badges
- Limitations: amber box with bold "Limitations." prefix
- Feedback: centered, minimal, no indigo
- Error state: black button, no indigo

**`StatusPoll.jsx`**: replaced indigo dot/spinner/label with `#0f172a`/`#cbd5e1` ring, green done dot

**`Auth.jsx`**: black title + button style, clean 1px border card

**`HistoryPage.jsx`**: added `Navbar` component (same pattern), replaced indigo links, GitHub SVG icon per row

**`ReportPage.jsx`**: navbar with VerifAI logo + "Run your own verification →" link, background `#f8fafc`, no indigo

### Session 19 — 2026-06-19

**Notebook import scanning — fixes false negatives where skill evidence lived only inside `.ipynb` files**
- `core/github_client.py`: added `get_repo_tree(owner, repo)` — fetches the default branch's recursive git tree, returns blob paths (or `[]` on failure). Used to locate `.ipynb` files without guessing paths.
- `agents/github_scraper.py`: added `extract_notebook_imports(notebook_content)` (parses notebook JSON, regex-extracts top-level `import`/`from` module names from code cells) and `is_ml_relevant_repo(repo_name)` (keyword match against `ML_KEYWORDS`).
- After the main per-repo loop in `scrape_github`, a second pass collects repos whose `languages` include `"Jupyter Notebook"`, sorts ML-relevant repos first, then fetches+parses notebooks via `get_repo_tree` + `get_file_contents` up to `MAX_NOTEBOOK_SCANS` (5) total across the whole candidate — not per repo. Result stored as `notebook_imports: list[str]` on `RepoData`.
- `core/constants.py`: added `MAX_NOTEBOOK_SCANS`, `ML_KEYWORDS`, `MINIMAL_REPO_BYTES_THRESHOLD`, `STDLIB_MODULES` (filters out `os`, `sys`, `json`, etc. so stdlib imports never count as skill evidence).
- `agents/coherence_verifier.py`: `_skill_in_repo` now checks `notebook_imports` (stdlib-filtered) as **Priority 1b** — same confidence tier as dependency files, checked before the language-API/README/alias fallbacks.

**EMPTY_OR_MINIMAL_REPO flag**
- `core/flags.py`: added `EMPTY_OR_MINIMAL_REPO`.
- `agents/github_scraper.py` (`_detect_flags`): repos with `sum(languages.values()) < MINIMAL_REPO_BYTES_THRESHOLD` (500 bytes) get flagged — catches placeholder/empty repos that otherwise looked like real activity.
- `ReportView.jsx`: added to `FLAG_COLORS`/`FLAG_LABELS` so it renders in the Repo Reference table alongside `NO_COMMIT_HISTORY`/`FORK_NO_CONTRIBUTION`.

**Complexity-vs-claim reasoning (Agent 4)**
- `agents/coherence_verifier.py`: `_build_llm_context` now includes `total_bytes` per repo and a new `PROJECT MATCHES (for complexity-vs-claim reasoning)` block (claimed project → matched repo with commits/total_bytes/languages) — all from data already fetched, zero new API calls.
- `_SYSTEM` prompt gained a `COMPLEXITY VS CLAIM` rule: note a neutral, factual mismatch (e.g. claimed architecture vs. observable repo size) in `contradicting_evidence` only when a real mismatch exists; say nothing when the codebase plausibly supports the claim. No new score/field — surfaces through the existing `checks[].contradicting_evidence`.

**Frontend fixes**
- `ReportView.jsx` `RepoTable`: added a README column (`has_readme` ✓/✗) — data was already in `github_data.repos[]`, no backend change needed.
- `ReportView.jsx` `ProjectMatches`: fixed a duplicate-render bug — `CLAIM_NO_EVIDENCE` was printing "No matching repo found" twice (once from `fd.note`, once from a separate `m.note` div with near-identical text). Collapsed to a single `→ {m.note || fd.note}` span.
- Added a permanent limitations disclaimer (amber box) above the feedback widget on every report: public-GitHub-only scope, thin activity ≠ fabrication.
- Confirmed `DebugInfo` is already excluded from PDF capture via the existing `hidden={generatingPDF}` prop (no further change needed).
- Recruiter Brief / two-layer report structure (Quick Brief top layer + "Full Technical Evidence Below" divider) was already implemented in Session 18 — no changes needed this session.

**Not run:** these changes were not exercised against a live pipeline run this session (per instruction). Worth a smoke test on a candidate with notebook-only repos before relying on `notebook_imports` in production.

### Session 1 — 2026-05-30
Full scaffold: 5-agent pipeline, FastAPI, LangGraph, React frontend, Railway + Vercel deployment.

### Session 2 — 2026-05-31
All 5 agents implemented. Skill matching debugged. PDF worker iterations. Live polling fixed.

### Session 3 — 2026-06-01
Report redesigned (no score/risk). `core/constants.py` created. Skill aliases tightened. Dep fetching added. Landing page + React Router.

### Session 5 — 2026-06-02

**report_generator: critical `import re` bug fixed + state hardening**
- `import re` was accidentally removed in Session 5 when `_has_time_claim()` was deleted. `_extract_json` still uses `re.sub` and `re.search` — without the import, any LLM response starting with ` ```json ` caused a `NameError` caught silently by the bare `except`, leaving `final_report` as `None` forever.
- Added `import re` back.
- Added explicit error log when `_extract_json` returns `{}` — logs `stop_reason` and `output_tokens` (same pattern as `resume_parser`).
- Added `state["current_agent"] = "complete"` immediately after `state["final_report"] = ...` so the progress UI reaches its terminal state.

**Pipeline node logging added**
- `pipeline.py`: added `import logging` + `logger = logging.getLogger(__name__)`. `_wrap()` now logs `>>> Starting <agent>` before and `>>> Finished <agent>` after every node, and `>>> <agent> raised unhandled exception: ...` on failure. No separate wrapper functions needed — logging is inside the existing `_wrap` utility.
- `main.py`: added `logging.basicConfig(level=INFO, ...)` so the `pipeline` logger has a handler and `>>>` lines actually appear in the uvicorn terminal. Without this the logger would silently discard all messages.

**AI code detector rewritten — no GitHub API calls**
- Removed `_sample_patches()`, `GitHubClient` import, `sys` import, `SAMPLE_COMMITS`/`MAX_PATCH_CHARS` imports and constants.
- Agent now makes one LLM call with all repos' metadata (README, commits, frequency, languages, age) already in `github_data`. No new API calls.
- `ai_likelihood` hardcoded to `0.0` — output is qualitative `reasoning` + `indicators` text only.
- `SAMPLE_COMMITS` and `MAX_PATCH_CHARS` removed from `core/constants.py` (no longer referenced anywhere).

**Timeline flags removed entirely**
- Deleted `TimelineFlag` model from `core/models.py`; removed `timeline_flags` field from `RecruiterReport`.
- Removed `_has_time_claim()` function, `TIMELINE ANALYSIS` context block, and `timeline_flags` JSON schema + rules from `agents/report_generator.py`. Removed unused `re` import.
- Removed `TimelineFlags` component and its call site from `ReportView.jsx`; removed timeline items block from `InterviewQuestions`.
- Report section order is now: Overview → Skill Evidence → Project Claims → Activity Patterns → Interview Questions → Repo Reference.

**Root cause of claims=0 / project_matches=[] found and fixed**
- `resume_parser.py` had `max_tokens=2000`. With the full system prompt (~1062 input tokens), Claude's JSON output for a real resume (30+ claims × 7 fields each) hits 2000 tokens and is truncated mid-string. `_extract_json` silently returns `{}`, `data.get("claims", [])` returns `[]`, and no error is ever logged.
- Confirmed via `stop_reason=max_tokens` and `output_tokens=2000` (the exact limit).
- **Fix 1:** Raised `max_tokens` from 2000 → 4096 in `resume_parser.py` (later raised again to 8096 in Session 6).
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

### Session 6 — 2026-06-03

**resume_parser: max_tokens raised 4096 → 8096**
- Larger resumes (40+ claims) were still hitting the 4096 limit. Raised to 8096 to give full headroom.

**StatusPoll: completion condition hardened**
- Previous condition: `state.final_report !== null`
- New condition: `state.final_report !== null || state.current_agent === "complete"`
- Rationale: if `final_report` is somehow null but `current_agent` is "complete", the pipeline is done and the frontend must still transition — otherwise it polls forever.

---

### Session 18 — 2026-06-17

**Two-layer report: Recruiter Brief (top) + Technical Evidence (below)**

- `core/models.py`: Added `StrongestWork` and `RecruiterBrief` Pydantic models (4 fields: `one_liner`, `strongest_work`, `confirmed_skills_line`, `profile_consistency`). Added `recruiter_brief: RecruiterBrief | None = None` to `FinalReport`.
- `agents/report_generator.py`:
  - Imported `RecruiterBrief`, `StrongestWork`.
  - Expanded `_SYSTEM` to include a `recruiter_brief` block in the JSON output schema with instructions for non-technical readability, data-driven one-liner, strongest work spotlight, skills line, and neutral profile consistency sentence. No `call_questions` field.
  - `generate_report`: builds `RecruiterBrief` from `rb_data`; passes it to `FinalReport`. `recruiter_brief` is `None` if LLM omits the field (backward-safe).
  - Raised `max_tokens` from 4096 → 6000.
- `api/routes.py`: Added `UNLIMITED_EMAILS` set (`sboggavarapu@umass.edu`, `subbarayudu8660@gmail.com`). Added `_get_user_info(authorization)` helper returning `(user_id, email)` in one Supabase call. `/verify` skips rate-limit check for unlimited emails. `/usage` returns `{"unlimited": True}` for unlimited emails. `_extract_user_id` now delegates to `_get_user_info`.
- `frontend/src/components/ReportView.jsx`:
  - Added `RecruiterBriefSection` component: indigo-bordered card with one-liner, strongest work (only when `repo_name` non-null), skills line, and profile consistency.
  - In the root render: inserted `<RecruiterBriefSection brief={recruiterBrief} />` immediately after `CandidateHeader`.
  - Inserted "Full Technical Evidence Below" divider (only when `recruiterBrief` is present) between the brief and existing sections.
  - All existing sections (Overview, Skill Evidence, Project Claims, Activity Patterns, Interview Questions, Repo Table, Debug, Feedback) are unchanged below the divider.

### Session 17 — 2026-06-08

**Feedback widget**

- `ReportView.jsx`: Added `FeedbackWidget` self-contained component (own state: `rating`, `comment`, `submitted`). Renders after `DebugInfo` at the bottom of every completed report. Hidden during PDF generation (`hidden={generatingPDF}`). Shows 👍/👎 buttons; textarea + Submit appear after a rating is selected; replaces with "Thanks for your feedback! 🙏" on submit. POSTs to `/feedback` silently (errors swallowed). `run_id` falls back to `state.id` for Supabase-fetched rows. Added `API_BASE` constant at top of file.
- `api/routes.py`: Added `FeedbackRequest` Pydantic model and `POST /feedback` endpoint. Inserts `run_id`, `github_username`, `rating`, `comment` into Supabase `feedback` table. Always returns `{"ok": True}` — never errors to the client.

**Supabase table required** (`feedback`):
```sql
id uuid primary key default gen_random_uuid(),
run_id uuid,
github_username text,
rating text,
comment text,
created_at timestamptz default now()
```

---

### Session 16 — 2026-06-07

**Navbar, past verifications, history page**

- `VerifyPage.jsx` (rewritten): Replaced the old centered-logo header with a proper navbar (VerifAI logo left, user email + Sign out button right). Phase names updated: `"done"` → `"report"`. Added past verifications panel below the form: fetches `/history` on mount and whenever `phase` changes back to `"form"` (so it refreshes after a new run). Shows 5 most recent with links to `/report/:id`; shows "See all N verifications →" link to `/history` when more than 5.
- `HistoryPage.jsx` (new): Full list of all verifications for the logged-in user. Fetches `/history`, redirects to `/login` if no session. Protected route — linked from `/history`.
- `api/routes.py`: Added `GET /history` endpoint. Uses `_extract_user_id` helper (no duplication). Queries `verifications` table selecting `id, github_username, created_at, current_agent`, ordered by `created_at desc`. Returns `{verifications: []}` on Supabase error.
- `App.jsx`: Added `HistoryPage` import and `/history` protected route (redirects to `/login` if not authed).

Note: The instruction's JSX had a malformed `<a` tag in both `VerifyPage` and `HistoryPage` map calls (opening tag was stripped). Fixed in implementation.

---

### Session 15 — 2026-06-07

**Rate limiting: IP-based → account-based via Supabase**

- `api/routes.py`:
  - Removed `_ip_usage` dict, `defaultdict` import, `os` import, `_get_client_ip()`, `ADMIN_TOKEN` bypass — all IP-based logic gone.
  - Added `_extract_user_id(authorization)` helper: extracts Supabase user ID from `Bearer` JWT; returns `None` on failure. Used by both `/verify` and `/usage` to avoid duplication.
  - Added `get_user_verification_count(user_id)` — queries `verifications` table with `count="exact"` for the user's row count.
  - `/verify` now requires auth: returns 401 if no valid JWT. Checks Supabase count before running; returns 429 if `count >= FREE_LIMIT`. `verifications_remaining` computed as `FREE_LIMIT - count - 1` (count is pre-run).
  - `/usage` now uses Supabase count. Returns `{used: 0, remaining: 5}` for unauthenticated callers.
  - `request: Request` parameter removed from both endpoints (no longer needed).
- `api.js`: Added 401 handler in `startVerification` before the 429 check.
- `UploadForm.jsx`: Accepts `user` prop; renders sign-in prompt with link to `/login` if `user` is falsy.
- `VerifyPage.jsx`: Passes `user={user}` to `UploadForm`.

Note: `ADMIN_TOKEN` env var on Railway can be removed. To give yourself unlimited verifications, delete your rows from the `verifications` table in Supabase or increase `FREE_LIMIT`.

---

### Session 14 — 2026-06-07

**Supabase integration: auth + persistent storage + shareable links**

**Backend**
- `core/supabase_client.py` (new): `get_supabase()` factory; requires `SUPABASE_URL` + `SUPABASE_SECRET_KEY` env vars.
- `state.py`: added `run_id: str | None` and `user_id: str | None` to `PipelineState`.
- `pipeline.py`: `stream_pipeline()` now accepts `run_id` and `user_id` keyword args; both flow through all agents as pass-through state. Also fixed latent bug: added `skipped: []` to both `stream_pipeline` and `run_pipeline` initial states (was missing — agents that append to `skipped` would have hit `KeyError`).
- `api/routes.py`:
  - `save_result(run_id, state)` — upserts to Supabase `verifications` table. Stores individual columns (`user_id`, `github_username`, `resume_provided`, `github_data`, `skill_verification`, `project_matches`, `final_report`, `errors`, `current_agent`) **plus** a `state_data` JSONB column (full state for retrieval). Non-fatal — errors are logged, not raised.
  - `get_result(run_id)` — fetches `state_data` from Supabase. Used when run_id not in `_results` cache (e.g., after Railway restart).
  - `/verify`: extracts Supabase user from `Authorization: Bearer <token>` header (JWT). Sets `user_id` in state. Saves initial state to Supabase immediately. Passes `run_id` and `user_id` to `stream_pipeline`.
  - `_run_and_store`: now accepts `user_id`; calls `save_result()` after each agent step (5 writes total per run).
  - `/results/{run_id}`: serves from `_results` cache first; falls back to Supabase if missing (persists across restarts).
  - `run_id` is now part of state, so it's returned in `/results/{run_id}` response — frontend can use it for share URLs.

**Supabase table required** (`verifications`):
```sql
id uuid primary key,
user_id uuid references auth.users,
github_username text,
resume_provided bool,
github_data jsonb,
skill_verification jsonb,
project_matches jsonb,
final_report jsonb,
errors jsonb,
current_agent text,
state_data jsonb,
created_at timestamptz default now()
```

**Frontend**
- `src/lib/supabase.js` (new): Supabase client using `VITE_SUPABASE_URL` + `VITE_SUPABASE_PUBLISHABLE_KEY`.
- `src/components/Auth.jsx` (new): Google OAuth sign-in page. Redirects to `/verify` on success.
- `src/components/VerifyPage.jsx` (new): Extracted from `App.jsx` inline. Accepts `user` prop (unused currently).
- `src/components/ReportPage.jsx` (new): Public shareable report page at `/report/:runId`. Fetches from `/results/{runId}`, renders `ReportView`. No auth required.
- `src/App.jsx`: Rewrote. Adds `user`/`loading` state from `supabase.auth.getSession()` + `onAuthStateChange`. Protected routes: `/verify` requires auth (redirects to `/login`). `/login` redirects to `/verify` if already signed in. `/report/:runId` is public.
- `src/api.js`: `getAuthHeaders()` reads Supabase session and attaches `Authorization: Bearer <token>` if logged in. All three exports (`startVerification`, `getResults`, `getUsage`) use it.
- `src/components/ReportView.jsx`: Added Share Report button in the header button row (only shown when `state.run_id` is present). Copies `/report/:runId` URL to clipboard; button turns green "✓ Copied!" for 2s.

**New env vars needed**:
- Railway: `SUPABASE_URL`, `SUPABASE_SECRET_KEY`
- Vercel: `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`

**Install commands** (not yet run):
```bash
pip install supabase                    # in verifai/
cd frontend && npm install @supabase/supabase-js
```

---

### Session 13 — 2026-06-06

**PDF download added to `ReportView.jsx`**
- Installed `jspdf` and `html2canvas` (run `npm install jspdf html2canvas` in `verifai/frontend/`).
- Added `useRef` + `html2canvas`/`jsPDF` imports to `ReportView.jsx`.
- `ref={reportRef}` placed on the main report container `<div>` so the entire report is captured.
- `downloadPDF` function: uses `html2canvas` (scale 2, white background, CORS enabled), then slices the canvas into A4 pages via a `while (heightLeft > 0)` loop. Saves as `verifai-report-<username>.pdf`.
- `[generatingPDF, setGeneratingPDF]` state: button shows "Generating…" and is disabled while capture runs; `DebugInfo` is hidden (`hidden` prop) during capture so it doesn't appear in the PDF.
- `CandidateHeader` updated to accept `onDownloadPDF` and `generatingPDF` props; renders both buttons in a flex row at top right (Download PDF first, then ← New verification).

---

### Session 12 — 2026-06-04

**Errors vs skips — intentional skips no longer pollute the debug panel**
- `state.py`: added `skipped: list[str]` to `PipelineState`. Intentional no-ops go here; actual failures go to `errors`.
- `agents/resume_parser.py`: no-resume early exit now appends to `skipped` ("no resume provided — GitHub-only mode") instead of `errors`.
- `agents/coherence_verifier.py`: no-resume-claims early exit now appends to `skipped` ("no resume claims — skipping cross-reference") instead of `errors`. The no-github-data path remains in `errors` (that's a real failure, not an expected skip).
- `api/routes.py`: initial state now includes `"skipped": []`.
- `ReportView.jsx`: destructures `skipped` from state (available for future use). `DebugInfo` already gates on `errors?.length` — since skips are no longer in `errors`, the debug panel now hides automatically in GitHub-only mode.

---

### Session 11 — 2026-06-04

**Repo cap — 30 most recent repos (`github_scraper.py`, `models.py`, `ReportView.jsx`)**
- `client.get_repos()` result saved as `all_repos`; then sorted by `pushed_at` descending and sliced to 30 before processing. Keeps scrape time bounded for prolific users.
- `GitHubScrapeResult` gains two new fields: `repos_capped: bool = False` and `total_repos_found: int = 0`.
- Both are populated from `len(all_repos)` at construction time.
- `RepoTable` in `ReportView.jsx` accepts `reposCapped` and `totalReposFound` props; renders a small grey note ("Showing 30 most recent repos out of X total") directly below the section title when capped.

---

### Session 10 — 2026-06-04

**`frontend/vercel.json` — SPA routing fix**
- Created `verifai/frontend/vercel.json` with a catch-all rewrite: all routes → `/index.html`.
- Without this, a hard refresh or direct navigation to `/verify` on Vercel returns a 404 because Vercel looks for a file at that path. The rewrite hands all routing to React Router client-side.

---

### Session 9 — 2026-06-04

**`api/routes.py` — usage visibility**
- `VerifyResponse` Pydantic model gains `verifications_remaining: int`.
- `/verify` now computes `remaining = max(0, FREE_LIMIT - _ip_usage[client_ip])` after incrementing and returns it in the response body.
- New `GET /usage` endpoint returns `{used, remaining, limit}` for any IP — used by the frontend on load to show count without triggering a run.

**`api.js` — `getUsage` export**
- Added `export const getUsage` that fetches `GET /usage` and throws on non-OK.

**`UploadForm.jsx` — remaining verifications display**
- New `remaining` state (null until resolved; null hides the badge).
- `useEffect` on mount calls `getUsage()` and sets `remaining`; errors are swallowed silently.
- On successful submit, sets `remaining` from `data.verifications_remaining` returned by the server, then calls `onStarted`.
- On error, re-fetches `/usage` to sync count in case server incremented before rejecting.
- `RemainingBadge` component handles display:
  - `remaining > 1` → grey text "N free verifications remaining"
  - `remaining === 1` → amber (`#d97706`) "1 free verification remaining"
  - `remaining === 0` → red message with mailto link; submit button disabled (`isExhausted` flag)
- Submit button disabled when `loading || !username.trim() || isExhausted`.

---

### Session 8 — 2026-06-04

**Error handling: `current_agent = "complete"` on every exit path in `report_generator.py`**
- Three early-return paths were missing the terminal state set: the `no github_data` guard, the `_extract_json` failure path, and the bare `except` block.
- Without this, any pipeline failure left `current_agent` stuck at `"report_generator"` forever and the frontend polled indefinitely.

**GitHub 404 handling in `github_scraper.py`**
- Added `import requests` so `requests.HTTPError` can be caught specifically.
- The `get_user` call now has a dedicated `except requests.HTTPError` branch that checks `exc.response.status_code == 404`.
- On 404: appends user-friendly error ("GitHub user '...' not found. Please check the username and try again."), sets `current_agent = "complete"`, and returns early.
- Non-404 HTTPErrors and all other exceptions fall through to the original generic handler.

**Frontend error screen in `ReportView.jsx`**
- Added a null-guard at the top of the default export: when `final_report` is null, renders a centered error card with ⚠️ icon, message, error list, and a "Try Again" button that calls `onReset`.
- Message is contextual: if any error contains "not found" → shows "GitHub username not found" copy; otherwise generic "Something went wrong."
- `onReset` prop was already wired in `App.jsx` (`handleReset` → resets to form phase).

**IP rate limiting in `api/routes.py`**
- Added `_ip_usage: dict[str, int] = defaultdict(int)` and `FREE_LIMIT = 5`.
- `_get_client_ip()` reads `X-Forwarded-For` first (Railway sets this), falls back to `request.client.host`.
- `/verify` endpoint now accepts `request: Request`, extracts client IP, checks usage.
- Rate limit is bypassed if `X-Admin-Token` header matches the `ADMIN_TOKEN` env var. If `ADMIN_TOKEN` is unset, rate limiting is entirely disabled (safe local dev default).
- Returns HTTP 429 with `{message, contact}` detail on limit exceeded.

**429 handling in `api.js`**
- `startVerification` now checks `response.status === 429` before the generic `!response.ok` check.
- On 429: parses `data.detail.message` + `data.detail.contact` and throws a combined error string.
- `UploadForm` already catches thrown errors and displays them via `setError(err.message)` — no changes needed there.

**Env var to add on Railway:** `ADMIN_TOKEN=<any secret string>` — bypass key for testing without consuming rate limit slots.

---

### Session 7 — 2026-06-04

**LandingPage.jsx — copy updates**
- Hero subline replaced: now leads with audience ("Built for hiring junior engineers, new grads, and interns") and describes the full pipeline output.
- Scope note added below the "Try it free" button: small grey text (`fontSize: 13, color: "#6b7280"`) explaining the product is designed for candidates where GitHub is the primary signal. Not a disclaimer — framed as context.
- "How it works" step 3 body updated: now lists the four specific output types (skill evidence, project verification, activity patterns, targeted interview questions) rather than the previous generic description.

---

### Session 4 — 2026-06-02
- Timeline pre-filtering (`_has_time_claim()`), project interview questions, fork annotation, Jupyter rule.
- Project classification simplified to keyword-only (`CORPORATE_HINTS`).
- `InterviewQuestions` component in ReportView.
- `api.js` BASE URL reads `VITE_API_URL` env var.
- CORS updated: Vercel origin added, `allow_credentials=True`.
- **LLM provider switched from OpenAI to Anthropic.** All 4 agents updated to `client.messages.create(system=..., messages=[...])`. `requirements.txt`: `openai` → `anthropic`.
- MODEL updated to `claude-sonnet-4-5`.
- `_extract_json()` added locally to resume_parser, coherence_verifier, report_generator — handles markdown fences, embedded JSON fallback, returns `{}` on failure instead of raising.
