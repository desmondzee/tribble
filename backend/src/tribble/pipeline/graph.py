import logging
import math
from functools import wraps
from typing import Literal

from langgraph.graph import END, START, StateGraph

from tribble.models.confidence import compute_access_difficulty
from tribble.pipeline.state import PipelineState, PipelineStatus
from tribble.services.satellite_fusion import fuse_satellite_weather_report_signals

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


@_safe_node
def normalize(state: PipelineState) -> dict:
    trace = state["node_trace"] + ["normalize"]
    narrative = (state.get("raw_narrative") or "")
    return {
        "status": PipelineStatus.NORMALIZED,
        "node_trace": trace,
        "normalized": {
            "narrative_clean": narrative.strip(),
            "word_count": len(narrative.split()),
        },
    }


@_safe_node
def translate(state: PipelineState) -> dict:
    trace = state["node_trace"] + ["translate"]
    t = None if state.get("language") == "en" else state["raw_narrative"]
    return {"status": PipelineStatus.TRANSLATED, "node_trace": trace, "translation": t}


REPORT_TYPE_CATEGORIES: dict[str, list[str]] = {
    "shelling": ["security"],
    "gunfire": ["security"],
    "food_need": ["food"],
    "water_need": ["water_sanitation"],
    "medical_need": ["health"],
    "shelter_need": ["shelter"],
    "displacement": ["displacement"],
    "infrastructure_damage": ["infrastructure"],
    "aid_blocked": ["access"],
    "looting": ["security", "food"],
    "missing_persons": ["security"],
}

SEVERITY_URGENCY: dict[str, str] = {
    "critical": "critical",
    "high": "high",
    "medium": "medium",
    "low": "low",
}


@_safe_node
def classify(state: PipelineState) -> dict:
    trace = state["node_trace"] + ["classify"]
    report_type = state.get("report_type") or ""
    categories = list(REPORT_TYPE_CATEGORIES.get(report_type, []))

    narrative = state.get("raw_narrative") or ""
    severity_hints = ["critical", "high", "medium", "low"]
    urgency = "medium"
    for hint in severity_hints:
        if hint in narrative.lower():
            urgency = SEVERITY_URGENCY[hint]
            break

    return {
        "status": PipelineStatus.CLASSIFIED,
        "node_trace": trace,
        "classification": {
            "crisis_categories": categories,
            "help_categories": [],
            "urgency_hint": urgency,
        },
    }


@_safe_node
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


@_safe_node
def deduplicate(state: PipelineState) -> dict:
    trace = state["node_trace"] + ["deduplicate"]
    return {"status": PipelineStatus.DEDUPLICATED, "node_trace": trace, "duplicates_found": []}


ACLED_CORROBORATION_MAP: dict[str, list[str] | None] = {
    "shelling": ["shelling"],
    "gunfire": ["armed_conflict"],
    "infrastructure_damage": ["shelling", "armed_conflict"],
    "looting": ["armed_conflict"],
    "displacement": ["armed_conflict", "shelling"],
    "aid_blocked": ["aid_obstruction"],
    "shelter_need": ["armed_conflict", "shelling"],
    "missing_persons": ["armed_conflict"],
    "medical_need": ["armed_conflict"],
    "food_need": ["aid_obstruction", "armed_conflict"],
}


def _haversine_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    r = 6371.0
    dlat = math.radians(lat2 - lat1)
    dlon = math.radians(lon2 - lon1)
    a = math.sin(dlat / 2) ** 2 + math.cos(math.radians(lat1)) * math.cos(math.radians(lat2)) * math.sin(dlon / 2) ** 2
    return r * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))


def compute_corroboration_score(hits: list[dict]) -> float:
    if not hits:
        return 0.0
    score = 0.0
    for h in hits:
        dist = float(h.get("distance_km", 5.0))
        severity = h.get("severity", "low")
        proximity_factor = max(0.0, 1.0 - (dist / 5.0))
        severity_weight = {"critical": 1.0, "high": 0.7, "medium": 0.4, "low": 0.2}.get(severity, 0.3)
        score += proximity_factor * severity_weight
    return min(score, 1.0)


@_safe_node
def corroborate(state: PipelineState) -> dict:
    trace = state["node_trace"] + ["corroborate"]
    hits = list(state.get("corroboration_hits") or [])
    report_type = state.get("report_type") or ""
    matching_classes = ACLED_CORROBORATION_MAP.get(report_type)

    cross_source_corroboration = compute_corroboration_score(hits)

    return {
        "status": PipelineStatus.CORROBORATED,
        "node_trace": trace,
        "corroboration_hits": hits,
        "corroboration_score": cross_source_corroboration,
        "corroboration_acled_classes": matching_classes,
    }


@_safe_node
def enrich_weather(state: PipelineState) -> dict:
    return {
        "status": PipelineStatus.WEATHER_ENRICHED,
        "node_trace": state["node_trace"] + ["enrich_weather"],
    }


@_safe_node
def enrich_satellite(state: PipelineState) -> dict:
    eo_features = state.get("satellite_eo_features") or {}
    quality = state.get("satellite_quality") or {}
    flood_score = float(eo_features.get("flood_score", 0.0))
    change_score = float(eo_features.get("change_score", 0.0))
    quality_score = float(quality.get("quality_score", 0.0))

    reason_codes = []
    if quality_score < 0.5:
        reason_codes.append("low_scene_quality")
    if flood_score > 0.6:
        reason_codes.append("flood_signal_detected")
    if not reason_codes:
        reason_codes.append("limited_satellite_signal")

    satellite_data = {
        "flood_score": round(max(0.0, min(flood_score, 1.0)), 4),
        "change_score": round(max(0.0, min(change_score, 1.0)), 4),
        "quality_score": round(max(0.0, min(quality_score, 1.0)), 4),
        "reason_codes": reason_codes,
    }
    return {
        "status": PipelineStatus.SATELLITE_ENRICHED,
        "node_trace": state["node_trace"] + ["enrich_satellite"],
        "satellite_data": satellite_data,
    }


@_safe_node
def score(state: PipelineState) -> dict:
    trace = state["node_trace"] + ["score"]
    fusion = fuse_satellite_weather_report_signals(
        satellite=state.get("satellite_data"),
        weather=state.get("weather_data"),
        reports={"cross_source_corroboration": 0.5},
    )
    satellite_corroboration = float(fusion["alert_score"])
    weather_risk = float((state.get("weather_data") or {}).get("flood_risk", 0.3))
    access_difficulty = compute_access_difficulty(weather_risk, satellite_corroboration)

    return {
        "status": PipelineStatus.SCORED,
        "node_trace": trace,
        "satellite_alert": fusion,
        "confidence_breakdown": {
            "source_prior": 0.5,
            "spam_score": 0.05,
            "duplication_score": 0.0,
            "completeness_score": 0.5,
            "geospatial_consistency": 0.5,
            "temporal_consistency": 0.5,
            "cross_source_corroboration": 0.0,
            "weather_plausibility": 0.5,
            "satellite_corroboration": satellite_corroboration,
        },
        "confidence_scores": {
            "publishability": 0.5,
            "urgency": 0.5,
            "access_difficulty": access_difficulty,
        },
    }


@_safe_node
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
