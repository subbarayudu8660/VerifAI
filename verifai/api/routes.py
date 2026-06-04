import json
import os
import uuid
from collections import defaultdict
from pathlib import Path

from fastapi import APIRouter, BackgroundTasks, HTTPException, Request
from pydantic import BaseModel

from pipeline import stream_pipeline
from state import PipelineState

router = APIRouter()

_results: dict[str, PipelineState] = {}
_ip_usage: dict[str, int] = defaultdict(int)
FREE_LIMIT = 5


def _get_client_ip(request: Request) -> str:
    forwarded_for = request.headers.get("X-Forwarded-For")
    if forwarded_for:
        return forwarded_for.split(",")[0].strip()
    return request.client.host
_OUTPUTS_DIR = Path(__file__).parent.parent / "outputs"
_OUTPUTS_DIR.mkdir(exist_ok=True)


class VerifyRequest(BaseModel):
    github_username: str
    resume_text: str | None = None


class VerifyResponse(BaseModel):
    run_id: str
    status: str = "running"
    verifications_remaining: int


def _run_and_store(run_id: str, username: str, resume: str | None) -> None:
    state = None
    for state in stream_pipeline(username, resume):
        _results[run_id] = state  # live update after each agent
    if state is not None:
        out_file = _OUTPUTS_DIR / f"{run_id}.json"
        out_file.write_text(json.dumps(state, indent=2, default=str))


@router.post("/verify", response_model=VerifyResponse)
async def verify(body: VerifyRequest, background_tasks: BackgroundTasks, request: Request) -> VerifyResponse:
    client_ip = _get_client_ip(request)
    admin_token = request.headers.get("X-Admin-Token", "")
    admin_secret = os.getenv("ADMIN_TOKEN", "")
    if admin_secret and admin_token != admin_secret:
        if _ip_usage[client_ip] >= FREE_LIMIT:
            raise HTTPException(
                status_code=429,
                detail={
                    "message": "You've used your 5 free verifications.",
                    "contact": "Contact sboggavarapu@umass.edu for continued access.",
                },
            )
    _ip_usage[client_ip] += 1

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
        "skipped": [],
        "current_agent": "queued",
    }
    background_tasks.add_task(_run_and_store, run_id, body.github_username, body.resume_text)
    remaining = max(0, FREE_LIMIT - _ip_usage[client_ip])
    return VerifyResponse(run_id=run_id, verifications_remaining=remaining)


@router.get("/usage")
async def usage(request: Request):
    client_ip = _get_client_ip(request)
    used = _ip_usage[client_ip]
    remaining = max(0, FREE_LIMIT - used)
    return {"used": used, "remaining": remaining, "limit": FREE_LIMIT}


@router.get("/results/{run_id}")
async def results(run_id: str):
    if run_id not in _results:
        raise HTTPException(status_code=404, detail="run_id not found")
    return _results[run_id]
