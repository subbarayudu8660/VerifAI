# VerifAI

Automated technical candidate verification. Give it a GitHub username and an optional resume — it scrapes public GitHub activity, detects AI-generated code, verifies resume claims against real evidence, and produces a recruiter-facing risk report with suggested interview questions.

---

## What it does

Most resume verification is manual and shallow. VerifAI runs a 5-agent pipeline that:

1. Parses the resume into structured claims (skills, projects, experience) and tags each with its source section
2. Scrapes every public GitHub repo — commits, languages, contributors, README text, flags
3. Samples commit diffs and scores them for AI-generation likelihood using GPT-4o
4. Verifies skill claims against GitHub (checking languages, README text, repo names, descriptions) and project claims against repos — experience section items are never checked against GitHub, because corporate code lives in private repos
5. Synthesises a dual report: recruiter risk assessment with red flags and interview questions, plus candidate-facing feedback

The frontend shows a trust score, per-skill confidence table, project claim matches, and suggested questions — readable in under 90 seconds.

---

## The 5-agent pipeline

```
parse_resume → scrape_github → detect_ai_code → verify_coherence → generate_report
                    ↓ (no GitHub data)
                generate_report
```

| # | Agent | What it does | API used |
|---|---|---|---|
| 1 | **Resume Parser** | Extracts every claim from resume text. Tags each with `source_section` (skills/projects/experience) and `skip_github_check`. Splits comma-grouped skills into individual entries. One claim per project. | OpenAI gpt-4o |
| 2 | **GitHub Scraper** | Fetches all public repos. Per repo: commits, contributors, languages, README (first 2000 chars), flags. Tracks `languages_first_seen` globally. Flags: `RECENT_CREATION`, `NO_COMMIT_HISTORY`, `FORK_NO_CONTRIBUTION`. | GitHub API |
| 3 | **AI Code Detector** | Samples up to 5 recent commit diffs per repo. Scores each for AI-generation likelihood (0–1) with reasoning. Skips repos with no commits. | GitHub API + OpenAI gpt-4o |
| 4 | **Coherence Verifier** | Skill matching checks language breakdown → README text → repo description → repo name (catches libraries like `scikit-learn`, `pandas`, `LangChain`). Skips non-verifiable tools (git, GitHub, Jupyter, VS Code, Agile etc.). Project claims matched by keyword overlap + tech-stack hints; unmatched projects classified as `CLAIM_NO_EVIDENCE`, `LIKELY_PRIVATE_CORPORATE`, or `LIKELY_PRIVATE_CLASSIFIED`. LLM verifies project/skill claims and generates interview questions for contradictions only. Experience section is never checked. | OpenAI gpt-4o |
| 5 | **Report Generator** | Synthesises all outputs into a `RecruiterReport` (overall risk, red flags, recommendation) and a `CandidateReport` (strengths, areas to address). | OpenAI gpt-4o |

---

## Project structure

```
verifai/
├── main.py                  ← FastAPI app + CORS middleware
├── pipeline.py              ← LangGraph StateGraph wiring
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
│   ├── models.py            ← All Pydantic models
│   ├── flags.py             ← Flag enum + make_flag() helper
│   ├── github_client.py     ← GitHub API wrapper (auth, exponential backoff, pagination)
│   └── llm.py               ← OpenAI client factory
│
├── api/
│   └── routes.py            ← POST /verify, GET /results/{run_id}
│
├── outputs/                 ← Per-run JSON files saved here (gitignored)
│
└── frontend/
    ├── package.json
    ├── vite.config.js
    ├── index.html
    └── src/
        ├── App.jsx              ← Phase state machine: form → polling → report
        ├── api.js               ← fetch wrappers for /verify and /results
        └── components/
            ├── UploadForm.jsx   ← GitHub username + optional PDF upload
            ├── StatusPoll.jsx   ← Polls every 3s, shows agent progress
            └── ReportView.jsx   ← Full report dashboard
```

---

## Environment variables

Create `verifai/.env` (copy from `.env.example`):

```
GITHUB_TOKEN=github_pat_...
OPENAI_API_KEY=sk-proj-...
```

**`GITHUB_TOKEN`** — GitHub fine-grained personal access token. Without it the scraper hits the anonymous rate limit (60 req/hr) immediately on accounts with more than a handful of repos.
- Go to: GitHub → Settings → Developer settings → Personal access tokens → Fine-grained tokens
- Set **Repository access** → Public Repositories (read-only)

**`OPENAI_API_KEY`** — Standard OpenAI key. All LLM calls use `gpt-4o`. Agents 1, 3, 4, and 5 each make one call per run. A full pipeline run on a small account costs roughly $0.05–0.15.

---

## Running locally

**Requirements:** Python 3.11+, Node 18+

```bash
# Clone and enter the project
cd verifai

# Install Python dependencies
pip install -r requirements.txt

# Install frontend dependencies
cd frontend && npm install && cd ..

# Set up environment variables
cp .env.example .env
# Edit .env and fill in both keys

# Terminal 1 — API server
uvicorn main:app --reload
# Runs at http://localhost:8000

# Terminal 2 — Frontend dev server
cd frontend
npm run dev
# Runs at http://localhost:5173
```

Open **http://localhost:5173**, enter a GitHub username, optionally upload a PDF resume, and click Run Verification.

PDF text is extracted client-side in the browser using `pdfjs-dist` — the backend only receives plain text, never a binary file.

---

## API

```
POST /verify
  Body: { "github_username": "string", "resume_text": "string | null" }
  Returns: { "run_id": "uuid", "status": "running" }

GET /results/{run_id}
  Returns: full PipelineState JSON
```

The pipeline runs as a FastAPI background task. Poll `/results/{run_id}` until `final_report` is not null or `errors` is non-empty.

Results are kept in memory and written to `outputs/<run_id>.json`.

---

## Running the scraper standalone

Agent 2 can run independently — no OpenAI key needed:

```bash
cd verifai
python -m agents.github_scraper <github_username>
# Progress logs → stderr
# JSON output → stdout

# Save to file
python -m agents.github_scraper torvalds 2>/dev/null > outputs/torvalds.json
```

---

## Output fields

| Field | Description |
|---|---|
| `github_data` | All repo metrics, flags, languages, README text |
| `resume_claims` | Every claim with `source_section` and `skip_github_check` |
| `ai_detection` | Per-repo AI likelihood scores with reasoning |
| `skill_verification` | Per-skill: confidence %, evidence repos, commit counts — sorted lowest first |
| `project_matches` | Per-project: matched repo link or flag (CORPORATE / CLASSIFIED / NO_EVIDENCE) |
| `coherence_report` | Per-claim verdicts + interview questions for contradictions |
| `final_report` | RecruiterReport (risk, recommendation, red flags) + CandidateReport (strengths, feedback) |
| `errors` | Agent failures — pipeline always continues |

## Flags

| Flag | Trigger |
|---|---|
| `RECENT_CREATION` | Repo created within 30 days |
| `NO_COMMIT_HISTORY` | 0 or 1 commits |
| `FORK_NO_CONTRIBUTION` | Forked repo with zero additional commits |
| `TEAM_CLAIM_SOLO_REPOS` | Resume claims teamwork but all repos are solo |
| `FIRST_COMMIT_IN_LANGUAGE` | Resume claims years of experience but first commit in that language is recent |
| `CLAIM_NO_EVIDENCE` | Project claim with no matching public repo and no corporate/classified explanation |
| `LIKELY_PRIVATE_CORPORATE` | Project likely in a private corporate repo — verify directly |
| `LIKELY_PRIVATE_CLASSIFIED` | Project likely classified/government work — verify directly |
