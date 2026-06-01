# VerifAI

Automated technical candidate verification. Give it a GitHub username and an optional resume — it scrapes public GitHub activity, detects AI-generated code, verifies resume claims against real evidence, and produces a recruiter report with red flags and suggested interview questions.

---

## What it does

Most resume verification is manual and shallow. VerifAI runs a 5-agent pipeline that:

1. Parses the resume into structured claims (skills, projects, experience) and tags each with its source section
2. Scrapes every public GitHub repo — commits, languages, contributors, README text, flags
3. Samples commit diffs and scores them for AI-generation likelihood
4. Verifies skill claims against GitHub (languages, README text, repo names) and project claims against repos via keyword overlap — experience items are never checked, because corporate code lives in private repos
5. Synthesises a dual report: recruiter assessment with red flags and interview questions, plus candidate-facing feedback

---

## The 5-agent pipeline

```
parse_resume → scrape_github → detect_ai_code → verify_coherence → generate_report
                    ↓ (if GitHub fetch fails)
                generate_report
```

| # | Agent | What it does | API |
|---|---|---|---|
| 1 | **Resume Parser** | Extracts every claim from resume text. Tags each with `source_section` and `skip_github_check`. Splits comma-grouped skills into individual entries. | OpenAI |
| 2 | **GitHub Scraper** | Fetches all public repos. Per repo: commits, contributors, languages, README. Flags: `RECENT_CREATION` (≤20 days), `NO_COMMIT_HISTORY`, `FORK_NO_CONTRIBUTION`. | GitHub API |
| 3 | **AI Code Detector** | Samples up to 5 recent commit diffs per repo (max 3000 chars each). Scores for AI-generation likelihood with reasoning. Skips repos with no commits. | GitHub API + OpenAI |
| 4 | **Coherence Verifier** | Skill matching checks languages → README → description → repo name, with alias map for libraries (React→JS, LangChain→Python+text). Project claims matched by keyword overlap. Unmatched projects classified as `CLAIM_NO_EVIDENCE`, `LIKELY_PRIVATE_CORPORATE`, or `LIKELY_PRIVATE_CLASSIFIED`. Generates interview questions for contradictions. | OpenAI |
| 5 | **Report Generator** | Synthesises all outputs into a `RecruiterReport` (red flags, recommendation) and a `CandidateReport` (strengths, areas to address). | OpenAI |

---

## Project structure

```
verifai/
├── main.py                  ← FastAPI app + CORS
├── pipeline.py              ← LangGraph StateGraph wiring + stream_pipeline()
├── state.py                 ← PipelineState TypedDict (shared by all agents)
├── requirements.txt
├── .env.example
│
├── agents/
│   ├── resume_parser.py     ← Agent 1
│   ├── github_scraper.py    ← Agent 2 (also runnable standalone)
│   ├── ai_code_detector.py  ← Agent 3
│   ├── coherence_verifier.py← Agent 4
│   └── report_generator.py  ← Agent 5
│
├── core/
│   ├── constants.py         ← All thresholds, alias maps, skip lists
│   ├── models.py            ← All Pydantic models
│   ├── flags.py             ← Flag enum + make_flag() helper
│   ├── github_client.py     ← GitHub API wrapper (auth, backoff, pagination)
│   └── llm.py               ← OpenAI client factory
│
├── api/
│   └── routes.py            ← POST /verify, GET /results/{run_id}
│
├── outputs/                 ← Per-run JSON files (gitignored)
│
└── frontend/
    ├── package.json         ← pdfjs-dist pinned at 3.11.174
    ├── vite.config.js
    ├── index.html
    └── src/
        ├── App.jsx              ← Phase state machine: form → polling → report
        ├── api.js               ← fetch wrappers for /verify and /results
        └── components/
            ├── UploadForm.jsx   ← GitHub username + optional PDF upload
            ├── StatusPoll.jsx   ← Polls every 3s, shows live agent progress
            └── ReportView.jsx   ← Full report: candidate header, red flags, skills, projects, repos
```

---

## Environment variables

Create `verifai/.env` (copy from `.env.example`):

```
GITHUB_TOKEN=github_pat_...
OPENAI_API_KEY=sk-proj-...
```

**`GITHUB_TOKEN`** — GitHub fine-grained personal access token. Without it the scraper hits the 60 req/hr anonymous rate limit immediately on accounts with more than a handful of repos.
- GitHub → Settings → Developer settings → Personal access tokens → Fine-grained tokens
- Repository access: Public Repositories (read-only)

**`OPENAI_API_KEY`** — All LLM calls use `gpt-4o`. Agents 1, 3, 4, and 5 each make one call per run. A full pipeline run costs roughly $0.05–0.15.

---

## Running locally

Requirements: Python 3.11+, Node 18+

```bash
cd verifai

# Python setup
pip install -r requirements.txt
cp .env.example .env   # fill in both keys

# Terminal 1 — API server
uvicorn main:app --reload
# http://localhost:8000

# Terminal 2 — Frontend
cd frontend
npm install
npm run dev
# http://localhost:5173
```

PDF text is extracted client-side using `pdfjs-dist` — the backend only receives plain text.

---

## API

```
POST /verify
  Body: { "github_username": "string", "resume_text": "string | null" }
  Returns: { "run_id": "uuid", "status": "running" }

GET /results/{run_id}
  Returns: full PipelineState JSON
```

The pipeline runs as a background task. Poll `/results/{run_id}` until `final_report` is not null. The `current_agent` field updates after each agent completes, so you can show live progress.

Results are kept in memory and written to `outputs/<run_id>.json`.

---

## Running the scraper standalone

Agent 2 runs independently — no OpenAI key needed:

```bash
cd verifai
python -m agents.github_scraper <github_username>
# Progress → stderr, JSON → stdout

python -m agents.github_scraper torvalds 2>/dev/null > outputs/torvalds.json
```

---

## Output fields

| Field | Description |
|---|---|
| `github_data` | Repo metrics, flags, languages, README text |
| `resume_claims` | Every claim with `source_section` and `skip_github_check` |
| `ai_detection` | Per-repo AI likelihood scores with reasoning |
| `skill_verification` | Per-skill: evidence repos, commit counts |
| `project_matches` | Per-project: matched repo link or flag (CORPORATE / CLASSIFIED / NO_EVIDENCE) |
| `coherence_report` | Per-claim verdicts + interview questions for contradictions |
| `final_report` | RecruiterReport (red flags, recommendation) + CandidateReport (strengths, feedback) |
| `errors` | Agent failures — pipeline always continues |

## Flags

| Flag | Trigger |
|---|---|
| `RECENT_CREATION` | Repo created within 20 days |
| `NO_COMMIT_HISTORY` | 0 or 1 commits |
| `FORK_NO_CONTRIBUTION` | Forked repo with zero additional commits |
| `TEAM_CLAIM_SOLO_REPOS` | Resume claims teamwork but all repos are solo |
| `FIRST_COMMIT_IN_LANGUAGE` | Claims years of experience but first commit in that language is recent |
| `CLAIM_NO_EVIDENCE` | Project claim with no matching public repo |
| `LIKELY_PRIVATE_CORPORATE` | Project likely in a corporate private repo — verify directly |
| `LIKELY_PRIVATE_CLASSIFIED` | Project likely classified/government work — verify directly |
