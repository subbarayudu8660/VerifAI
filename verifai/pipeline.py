"""LangGraph orchestration for the VerifAI pipeline.

Nodes run in order: parse_resume → scrape_github → detect_ai_code →
verify_coherence → generate_report.

If github_data is None after Agent 2, Agents 3 and 4 are skipped via a
conditional edge and the graph jumps straight to generate_report.
"""

import logging

from langgraph.graph import END, StateGraph

from agents.ai_code_detector import detect_ai_code
from agents.coherence_verifier import verify_coherence
from agents.github_scraper import scrape_github
from agents.report_generator import generate_report
from agents.resume_parser import parse_resume
from state import PipelineState

logger = logging.getLogger(__name__)


def _wrap(agent_fn, agent_name: str):
    """Wraps an agent function so errors are caught and logged to state."""
    def node(state: PipelineState) -> PipelineState:
        logger.info(">>> Starting %s", agent_name)
        try:
            result = agent_fn(state)
            logger.info(">>> Finished %s", agent_name)
            return result
        except Exception as exc:
            logger.error(">>> %s raised unhandled exception: %s", agent_name, exc)
            state["errors"].append(f"{agent_name}: unhandled exception: {exc}")
            state["current_agent"] = agent_name
            return state
    node.__name__ = agent_name
    return node


def _after_github(state: PipelineState) -> str:
    if state.get("github_data") is None:
        return "generate_report"
    return "detect_ai_code"


def build_graph() -> StateGraph:
    graph = StateGraph(PipelineState)

    graph.add_node("parse_resume", _wrap(parse_resume, "resume_parser"))
    graph.add_node("scrape_github", _wrap(scrape_github, "github_scraper"))
    graph.add_node("detect_ai_code", _wrap(detect_ai_code, "ai_code_detector"))
    graph.add_node("verify_coherence", _wrap(verify_coherence, "coherence_verifier"))
    graph.add_node("generate_report", _wrap(generate_report, "report_generator"))

    graph.set_entry_point("parse_resume")
    graph.add_edge("parse_resume", "scrape_github")
    graph.add_conditional_edges("scrape_github", _after_github, {
        "detect_ai_code": "detect_ai_code",
        "generate_report": "generate_report",
    })
    graph.add_edge("detect_ai_code", "verify_coherence")
    graph.add_edge("verify_coherence", "generate_report")
    graph.add_edge("generate_report", END)

    return graph


_compiled = build_graph().compile()


def run_pipeline(github_username: str, resume_raw: str | None = None) -> PipelineState:
    initial: PipelineState = {
        "run_id": None,
        "user_id": None,
        "github_username": github_username,
        "resume_raw": resume_raw,
        "resume_claims": None,
        "github_data": None,
        "ai_detection": None,
        "coherence_report": None,
        "skill_verification": None,
        "project_matches": None,
        "final_report": None,
        "errors": [],
        "skipped": [],
        "current_agent": "",
    }
    return _compiled.invoke(initial)


def stream_pipeline(
    github_username: str,
    resume_raw: str | None = None,
    *,
    run_id: str | None = None,
    user_id: str | None = None,
):
    """Yield full PipelineState after each agent completes."""
    initial: PipelineState = {
        "run_id": run_id,
        "user_id": user_id,
        "github_username": github_username,
        "resume_raw": resume_raw,
        "resume_claims": None,
        "github_data": None,
        "ai_detection": None,
        "coherence_report": None,
        "skill_verification": None,
        "project_matches": None,
        "final_report": None,
        "errors": [],
        "skipped": [],
        "current_agent": "",
    }
    yield from _compiled.stream(initial, stream_mode="values")
