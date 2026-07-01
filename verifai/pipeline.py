"""LangGraph orchestration for the VerifAI pipeline.

Nodes run in order: parse_resume → scrape_github → parallel_agents →
generate_report.

parallel_agents runs detect_ai_code and verify_coherence simultaneously
using ThreadPoolExecutor — both only need github_data and resume_claims,
which are set after Agent 2 finishes.

If github_data is None after Agent 2, parallel_agents is skipped via a
conditional edge and the graph jumps straight to generate_report.
"""

import logging
from concurrent.futures import ThreadPoolExecutor

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


def run_parallel_agents(state: PipelineState) -> PipelineState:
    """Run detect_ai_code and verify_coherence concurrently.

    Each agent receives a shallow copy with independent errors/skipped lists so
    concurrent appends don't race. After both finish, their outputs are merged
    back into the main state.
    """
    state["current_agent"] = "parallel_agents"
    logger.info(">>> Starting parallel_agents (ai_code_detector + coherence_verifier)")

    # Build isolated copies — new lists prevent concurrent-append races
    original_errors = list(state.get("errors", []))
    original_skipped = list(state.get("skipped", []))

    ai_input: PipelineState = {**state, "errors": list(original_errors), "skipped": list(original_skipped)}
    coherence_input: PipelineState = {**state, "errors": list(original_errors), "skipped": list(original_skipped)}

    with ThreadPoolExecutor(max_workers=2) as executor:
        ai_future = executor.submit(detect_ai_code, ai_input)
        coherence_future = executor.submit(verify_coherence, coherence_input)
        ai_state = ai_future.result()
        coherence_state = coherence_future.result()

    logger.info(">>> Finished parallel_agents")

    # Merge outputs into main state
    state["ai_detection"] = ai_state.get("ai_detection")
    state["skill_verification"] = coherence_state.get("skill_verification")
    state["project_matches"] = coherence_state.get("project_matches")
    state["coherence_report"] = coherence_state.get("coherence_report")

    # Accumulate new errors/skipped from both agents (slice off the originals they started with)
    state["errors"] = original_errors + ai_state["errors"][len(original_errors):] + coherence_state["errors"][len(original_errors):]
    state["skipped"] = original_skipped + ai_state["skipped"][len(original_skipped):] + coherence_state["skipped"][len(original_skipped):]

    return state


def _after_github(state: PipelineState) -> str:
    if state.get("github_data") is None:
        return "generate_report"
    return "parallel_agents"


def build_graph() -> StateGraph:
    graph = StateGraph(PipelineState)

    graph.add_node("parse_resume", _wrap(parse_resume, "resume_parser"))
    graph.add_node("scrape_github", _wrap(scrape_github, "github_scraper"))
    graph.add_node("parallel_agents", _wrap(run_parallel_agents, "parallel_agents"))
    graph.add_node("generate_report", _wrap(generate_report, "report_generator"))

    graph.set_entry_point("parse_resume")
    graph.add_edge("parse_resume", "scrape_github")
    graph.add_conditional_edges("scrape_github", _after_github, {
        "parallel_agents": "parallel_agents",
        "generate_report": "generate_report",
    })
    graph.add_edge("parallel_agents", "generate_report")
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
