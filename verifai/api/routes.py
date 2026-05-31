import json
import uuid
from pathlib import Path

from fastapi import APIRouter, BackgroundTasks, HTTPException
from pydantic import BaseModel

from pipeline import run_pipeline
from state import PipelineState

router = APIRouter()

_results: dict[str, PipelineState] = {}
_OUTPUTS_DIR = Path(__file__).parent.parent / "outputs"
_OUTPUTS_DIR.mkdir(exist_ok=True)


class VerifyRequest(BaseModel):
    github_username: str
    resume_text: str | None = None


class VerifyResponse(BaseModel):
    run_id: str
    status: str = "running"


def _run_and_store(run_id: str, username: str, resume: str | None) -> None:
    state = run_pipeline(username, resume)
    _results[run_id] = state
    out_file = _OUTPUTS_DIR / f"{run_id}.json"
    out_file.write_text(json.dumps(state, indent=2, default=str))


@router.post("/verify", response_model=VerifyResponse)
async def verify(body: VerifyRequest, background_tasks: BackgroundTasks) -> VerifyResponse:
    run_id = str(uuid.uuid4())
    _results[run_id] = {
        "github_username": body.github_username,
        "resume_raw": body.resume_text,
        "resume_claims": None,
        "github_data": None,
        "ai_detection": None,
        "coherence_report": None,
        "skill_verification": None,
        "project_matches": None,
        "final_report": None,
        "errors": [],
        "current_agent": "queued",
    }
    background_tasks.add_task(_run_and_store, run_id, body.github_username, body.resume_text)
    return VerifyResponse(run_id=run_id)


@router.get("/results/{run_id}")
async def results(run_id: str) -> PipelineState:
    if run_id not in _results:
        raise HTTPException(status_code=404, detail="run_id not found")
    return _results[run_id]
