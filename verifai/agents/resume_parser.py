"""Agent 1 — Resume Parser.

Extracts structured claims from raw resume text using OpenAI.
Every claim is tagged with source_section so downstream agents know
whether to check it against GitHub (projects/skills only — never experience).
"""

import json
import re

from core.llm import MODEL, get_client
from core.models import ResumeClaim, ResumeClaimsResult
from state import PipelineState


def _extract_json(text: str) -> dict:
    """Extract JSON from LLM response, handling markdown fences and malformed output."""
    text = text.strip()
    if text.startswith("```"):
        text = re.sub(r"^```(?:json)?\n?", "", text)
        text = re.sub(r"\n?```$", "", text)
        text = text.strip()
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        pass
    match = re.search(r"\{.*\}", text, re.DOTALL)
    if match:
        try:
            return json.loads(match.group())
        except json.JSONDecodeError:
            pass
    return {}


_SYSTEM = """\
You are a resume parser. Extract every verifiable claim from the resume text provided.

Return JSON with exactly this shape:
{
  "candidate_name": "string or null",
  "claims": [
    {
      "claim": "concise statement of the claim",
      "category": "skill | project | role | education | achievement",
      "source_section": "skills | projects | experience | education | other",
      "company": "Company Name or null",
      "skip_github_check": false,
      "confidence": 0.0-1.0,
      "raw_text": "verbatim excerpt from resume"
    }
  ]
}

Guidelines:
- category:
    skill: individual technologies, languages, frameworks, tools, platforms
    project: named projects with described contributions
    role: job titles, companies, employment periods
    education: degrees, institutions, graduation years
    achievement: metrics, awards, quantified outcomes

- source_section: which resume section the claim came from
    skills: from a Skills / Technical Skills section
    projects: from a Projects section
    experience: from Experience / Work History / Internships section
    education: from Education section
    other: anything else

- company: populated for experience claims (the employer); null otherwise

- skip_github_check:
    true  → claim is from experience/work history (corporate code is in private repos)
    false → claim is from skills or projects section (checkable against GitHub)

- For SKILLS section: extract EACH technology as a SEPARATE claim.
  If the resume says "Python, TypeScript, Java, C++" — emit four separate skill claims,
  one per technology. Never group multiple technologies into one claim string.
  EXCLUDE these tool/environment skills entirely — they cannot be verified on GitHub:
  git, github, vs code, vscode, visual studio code, jupyter notebook, jupyter,
  virtualenv, virtual environments, terminal, linux, windows, macos, unix,
  agile, scrum, jira, confluence, slack, notion, trello.

- For PROJECTS section: emit EXACTLY ONE claim per named project.
  Use the project title/name as the claim, and roll all bullet points describing
  that project into the raw_text field. Do NOT emit a separate claim per bullet point.
  Example — if the resume has:
    "UFC Fight Predictor — Predicts winner using ML. Built XGBoost model. 87% accuracy."
  Emit ONE claim: { "claim": "UFC Fight Predictor", "raw_text": "...all bullets..." }
  NOT three separate claims for the prediction, the model, and the accuracy.

- confidence: 1.0 = explicitly stated, 0.7 = implied, 0.4 = vague
"""


def parse_resume(state: PipelineState) -> PipelineState:
    state["current_agent"] = "resume_parser"

    if not state.get("resume_raw"):
        state["skipped"].append("resume_parser: no resume provided — GitHub-only mode")
        return state

    client = get_client()
    try:
        resp = client.messages.create(
            model=MODEL,
            max_tokens=8096,
            system=_SYSTEM,
            messages=[{"role": "user", "content": state["resume_raw"]}],
        )
        data = _extract_json(resp.content[0].text)
        if not data:
            state["errors"].append(
                f"resume_parser: LLM response could not be parsed as JSON "
                f"(stop_reason={resp.stop_reason}, output_tokens={resp.usage.output_tokens})"
            )
            return state

        claims = []
        for raw in data.get("claims", []):
            # Back-fill skip_github_check if LLM missed it
            if "skip_github_check" not in raw:
                raw["skip_github_check"] = raw.get("source_section", "") == "experience"
            claims.append(ResumeClaim(**raw))

        result = ResumeClaimsResult(
            candidate_name=data.get("candidate_name"),
            claims=claims,
        )
        state["resume_claims"] = result.model_dump(mode="json")
    except Exception as exc:
        state["errors"].append(f"resume_parser: {exc}")

    return state
