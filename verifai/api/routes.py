import json
import logging
import uuid
from pathlib import Path

from fastapi import APIRouter, BackgroundTasks, Header, HTTPException
from pydantic import BaseModel

from core.supabase_client import get_supabase
from pipeline import stream_pipeline
from state import PipelineState

router = APIRouter()
logger = logging.getLogger(__name__)

_results: dict[str, PipelineState] = {}   # in-memory cache — cleared on restart
FREE_LIMIT = 5
UNLIMITED_EMAILS: set[str] = {"sboggavarapu@umass.edu", "subbarayudu8660@gmail.com"}

_OUTPUTS_DIR = Path(__file__).parent.parent / "outputs"
_OUTPUTS_DIR.mkdir(exist_ok=True)


# ---------------------------------------------------------------------------
# Auth helper
# ---------------------------------------------------------------------------

def _get_user_info(authorization: str | None) -> tuple[str | None, str | None]:
    """Returns (user_id, email) from a Bearer token, or (None, None) on failure."""
    if not authorization or not authorization.startswith("Bearer "):
        return None, None
    token = authorization[len("Bearer "):]
    try:
        resp = get_supabase().auth.get_user(token)
        if resp and resp.user:
            return resp.user.id, resp.user.email
    except Exception:
        pass
    return None, None


def _extract_user_id(authorization: str | None) -> str | None:
    user_id, _ = _get_user_info(authorization)
    return user_id


# ---------------------------------------------------------------------------
# Supabase helpers
# ---------------------------------------------------------------------------

def get_user_verification_count(user_id: str) -> int:
    try:
        supabase = get_supabase()
        result = (
            supabase.table("verifications")
            .select("id", count="exact")
            .eq("user_id", user_id)
            .execute()
        )
        return result.count or 0
    except Exception as e:
        print(f"[supabase] count error: {e}")
        return 0


def save_result(run_id: str, state: dict) -> None:
    """Persist state to Supabase. Non-fatal — errors are logged, not raised."""
    try:
        supabase = get_supabase()
        result = supabase.table("verifications").upsert({
            "id": run_id,
            "user_id": state.get("user_id"),
            "github_username": state.get("github_username", ""),
            "resume_provided": state.get("resume_raw") is not None,
            "github_data": state.get("github_data"),
            "skill_verification": state.get("skill_verification"),
            "project_matches": state.get("project_matches"),
            "final_report": state.get("final_report"),
            "errors": state.get("errors", []),
            "current_agent": state.get("current_agent", "queued"),
        }).execute()
        print(f"[supabase] saved run {run_id}")
    except Exception as exc:
        print(f"[supabase] SAVE ERROR: {exc}")
        logger.warning("Supabase save_result failed for %s: %s", run_id, exc)


def get_result(run_id: str) -> dict | None:
    if run_id in _results:
        return _results[run_id]
    try:
        supabase = get_supabase()
        result = (
            supabase.table("verifications")
            .select("*")
            .eq("id", run_id)
            .single()
            .execute()
        )
        if result.data:
            print(f"[supabase] fetched {run_id} from database")
            return result.data
    except Exception as e:
        print(f"[supabase] GET ERROR: {e}")
    return None


# ---------------------------------------------------------------------------
# Pydantic models
# ---------------------------------------------------------------------------

class VerifyRequest(BaseModel):
    github_username: str
    resume_text: str | None = None


class VerifyResponse(BaseModel):
    run_id: str
    status: str = "running"
    verifications_remaining: int


class FeedbackRequest(BaseModel):
    run_id: str | None = None
    github_username: str | None = None
    rating: str | None = None
    comment: str | None = None


# ---------------------------------------------------------------------------
# Background task
# ---------------------------------------------------------------------------

def _run_and_store(run_id: str, username: str, resume: str | None, user_id: str | None) -> None:
    state = None
    for state in stream_pipeline(username, resume, run_id=run_id, user_id=user_id):
        _results[run_id] = state
        save_result(run_id, state)
    if state is not None:
        out_file = _OUTPUTS_DIR / f"{run_id}.json"
        out_file.write_text(json.dumps(state, indent=2, default=str))


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------

@router.post("/verify", response_model=VerifyResponse)
async def verify(
    body: VerifyRequest,
    background_tasks: BackgroundTasks,
    authorization: str | None = Header(None),
) -> VerifyResponse:
    user_id, user_email = _get_user_info(authorization)

    if not user_id:
        raise HTTPException(
            status_code=401,
            detail={"message": "Please sign in to verify candidates."},
        )

    unlimited = user_email in UNLIMITED_EMAILS
    if not unlimited:
        count = get_user_verification_count(user_id)
        if count >= FREE_LIMIT:
            raise HTTPException(
                status_code=429,
                detail={
                    "message": f"You've used all {FREE_LIMIT} free verifications.",
                    "contact": "Contact sboggavarapu@umass.edu for more access.",
                },
            )
        remaining = max(0, FREE_LIMIT - count - 1)
    else:
        count = 0
        remaining = FREE_LIMIT

    run_id = str(uuid.uuid4())
    initial_state: PipelineState = {
        "run_id": run_id,
        "user_id": user_id,
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
    _results[run_id] = initial_state
    save_result(run_id, initial_state)

    background_tasks.add_task(_run_and_store, run_id, body.github_username, body.resume_text, user_id)
    return VerifyResponse(run_id=run_id, verifications_remaining=remaining)


@router.get("/usage")
async def usage(authorization: str | None = Header(None)):
    user_id, user_email = _get_user_info(authorization)
    if not user_id:
        return {"used": 0, "remaining": FREE_LIMIT, "limit": FREE_LIMIT, "unlimited": False}
    if user_email in UNLIMITED_EMAILS:
        return {"used": 0, "remaining": FREE_LIMIT, "limit": FREE_LIMIT, "unlimited": True}
    used = get_user_verification_count(user_id)
    remaining = max(0, FREE_LIMIT - used)
    return {"used": used, "remaining": remaining, "limit": FREE_LIMIT, "unlimited": False}


@router.get("/history")
async def history(authorization: str | None = Header(None)):
    user_id = _extract_user_id(authorization)
    if not user_id:
        raise HTTPException(status_code=401, detail="Not authenticated")
    try:
        supabase = get_supabase()
        result = (
            supabase.table("verifications")
            .select("id, github_username, created_at, current_agent")
            .eq("user_id", user_id)
            .order("created_at", desc=True)
            .execute()
        )
        return {"verifications": result.data or []}
    except Exception as e:
        print(f"[supabase] history error: {e}")
        return {"verifications": []}


@router.post("/feedback")
async def feedback(body: FeedbackRequest):
    try:
        supabase = get_supabase()
        supabase.table("feedback").insert({
            "run_id": body.run_id,
            "github_username": body.github_username,
            "rating": body.rating,
            "comment": body.comment,
        }).execute()
        print(f"[feedback] {body.rating} for {body.github_username}")
    except Exception as e:
        print(f"[feedback] error: {e}")
    return {"ok": True}


@router.get("/results/{run_id}")
async def results(run_id: str):
    state = get_result(run_id)
    if state is None:
        raise HTTPException(status_code=404, detail="Run not found")
    return state
