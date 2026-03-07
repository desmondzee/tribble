import logging
from functools import wraps
from typing import Literal

from langgraph.graph import END, START, StateGraph

from tribble.pipeline.state import PipelineState, PipelineStatus

logger = logging.getLogger(__name__)


def _safe_node(fn):
    @wraps(fn)
    def wrapper(state: PipelineState) -> dict:
        try:
            return fn(state)
        except Exception as exc:
            logger.error(
                "Pipeline node %s failed for report %s: %s",
                fn.__name__, state.get("report_id"), exc, exc_info=True,
            )
            return {
                "status": PipelineStatus.ERROR,
                "node_trace": state.get("node_trace", []) + [fn.__name__],
                "error": f"{fn.__name__}: {exc}",
            }
    return wrapper


@_safe_node
def prefilter(state: PipelineState) -> dict:
    trace = state["node_trace"] + ["prefilter"]
    narrative = (state.get("raw_narrative") or "").strip()
    if not narrative or len(narrative) < 10:
        return {"status": PipelineStatus.REJECTED, "node_trace": trace, "error": "Too short"}
    return {"status": PipelineStatus.PREFILTERED, "node_trace": trace}


def normalize(state: PipelineState) -> dict:
    trace = state["node_trace"] + ["normalize"]
    return {
        "status": PipelineStatus.NORMALIZED,
        "node_trace": trace,
        "normalized": {
            "narrative_clean": state["raw_narrative"].strip(),
            "word_count": len(state["raw_narrative"].split()),
        },
    }


def translate(state: PipelineState) -> dict:
    trace = state["node_trace"] + ["translate"]
    t = None if state.get("language") == "en" else state["raw_narrative"]
    return {"status": PipelineStatus.TRANSLATED, "node_trace": trace, "translation": t}


def classify(state: PipelineState) -> dict:
    trace = state["node_trace"] + ["classify"]
    return {
        "status": PipelineStatus.CLASSIFIED,
        "node_trace": trace,
        "classification": {
            "crisis_categories": [],
            "help_categories": [],
            "urgency_hint": "medium",
        },
    }


def geocode(state: PipelineState) -> dict:
    trace = state["node_trace"] + ["geocode"]
    return {
        "status": PipelineStatus.GEOCODED,
        "node_trace": trace,
        "geocoded_location": {
            "latitude": state["latitude"],
            "longitude": state["longitude"],
            "precision": "approximate",
        },
    }


def deduplicate(state: PipelineState) -> dict:
    trace = state["node_trace"] + ["deduplicate"]
    return {"status": PipelineStatus.DEDUPLICATED, "node_trace": trace, "duplicates_found": []}


def corroborate(state: PipelineState) -> dict:
    trace = state["node_trace"] + ["corroborate"]
    return {"status": PipelineStatus.CORROBORATED, "node_trace": trace, "corroboration_hits": []}


def enrich_weather(state: PipelineState) -> dict:
    return {
        "status": PipelineStatus.WEATHER_ENRICHED,
        "node_trace": state["node_trace"] + ["enrich_weather"],
    }


def enrich_satellite(state: PipelineState) -> dict:
    return {
        "status": PipelineStatus.SATELLITE_ENRICHED,
        "node_trace": state["node_trace"] + ["enrich_satellite"],
    }


def score(state: PipelineState) -> dict:
    trace = state["node_trace"] + ["score"]
    return {
        "status": PipelineStatus.SCORED,
        "node_trace": trace,
        "confidence_breakdown": {
            "source_prior": 0.5,
            "spam_score": 0.05,
            "duplication_score": 0.0,
            "completeness_score": 0.5,
            "geospatial_consistency": 0.5,
            "temporal_consistency": 0.5,
            "cross_source_corroboration": 0.0,
            "weather_plausibility": 0.5,
            "satellite_corroboration": 0.0,
        },
        "confidence_scores": {
            "publishability": 0.5,
            "urgency": 0.5,
            "access_difficulty": 0.3,
        },
    }


def cluster_node(state: PipelineState) -> dict:
    return {
        "status": PipelineStatus.PUBLISHED,
        "node_trace": state["node_trace"] + ["cluster"],
    }


def _route_prefilter(state: PipelineState) -> Literal["normalize", "__end__"]:
    return END if state["status"] == PipelineStatus.REJECTED else "normalize"


def build_pipeline():
    g = StateGraph(PipelineState)
    for name, fn in [
        ("prefilter", prefilter),
        ("normalize", normalize),
        ("translate", translate),
        ("classify", classify),
        ("geocode", geocode),
        ("deduplicate", deduplicate),
        ("corroborate", corroborate),
        ("enrich_weather", enrich_weather),
        ("enrich_satellite", enrich_satellite),
        ("score", score),
        ("cluster", cluster_node),
    ]:
        g.add_node(name, fn)
    g.add_edge(START, "prefilter")
    g.add_conditional_edges("prefilter", _route_prefilter)
    for a, b in [
        ("normalize", "translate"),
        ("translate", "classify"),
        ("classify", "geocode"),
        ("geocode", "deduplicate"),
        ("deduplicate", "corroborate"),
        ("corroborate", "enrich_weather"),
        ("enrich_weather", "enrich_satellite"),
        ("enrich_satellite", "score"),
        ("score", "cluster"),
    ]:
        g.add_edge(a, b)
    g.add_edge("cluster", END)
    return g.compile()
