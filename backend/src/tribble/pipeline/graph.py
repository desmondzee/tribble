import logging
import math
from functools import wraps
from typing import Literal

from langgraph.graph import END, START, StateGraph

from tribble.models.confidence import ConfidenceBreakdown, SOURCE_PRIORS, compute_access_difficulty
from tribble.pipeline.state import PipelineState, PipelineStatus
from tribble.services.satellite_fusion import fuse_satellite_weather_report_signals

logger = logging.getLogger(__name__)


def _safe_node(fn):
    @wraps(fn)
    def wrapper(state: PipelineState) -> dict:
        report_id = state.get("report_id") or "unknown"
        logger.info(
            "Pipeline node %s for report %s",
            fn.__name__,
            report_id,
        )
        try:
            return fn(state)
        except Exception as exc:
            logger.error(
                "Pipeline node %s failed for report %s: %s",
                fn.__name__, report_id, exc, exc_info=True,
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
    trace = state["node_trace"] + ["enrich_weather"]
    raw_weather = state.get("weather_data")

    if not raw_weather or not isinstance(raw_weather, dict):
        return {"status": PipelineStatus.WEATHER_ENRICHED, "node_trace": trace, "weather_data": None}

    from tribble.ingest.weather import compute_weather_risks, WeatherConditions

    conditions = WeatherConditions(
        temperature_c=float(raw_weather.get("temperature_c", 25.0)),
        humidity_pct=float(raw_weather.get("humidity_pct", 50.0)),
        wind_speed_ms=float(raw_weather.get("wind_speed_ms", 2.0)),
        condition=str(raw_weather.get("condition", "Clear")),
        precipitation_mm=float(raw_weather.get("precipitation_mm", 0.0)),
    )
    risks = compute_weather_risks(conditions)

    enriched = {
        **raw_weather,
        "flood_risk": risks.flood_risk,
        "storm_risk": risks.storm_risk,
        "heat_risk": risks.heat_risk,
        "route_disruption_risk": risks.route_disruption_risk,
    }
    return {
        "status": PipelineStatus.WEATHER_ENRICHED,
        "node_trace": trace,
        "weather_data": enriched,
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


EL_FASHER_BBOX = {"lat_min": 13.3, "lat_max": 14.0, "lon_min": 24.8, "lon_max": 26.0}

SATELLITE_VALIDATION = {
    "water_need": {"index": "ndwi", "direction": "declining", "label": "NDWI decline indicates water body recession"},
    "food_need": {"index": "ndvi", "direction": "declining", "label": "NDVI decline indicates vegetation stress", "min_baseline": 0.25},
    "infrastructure_damage": {"index": "change_score", "direction": "rising", "label": "Change detection suggests structural damage"},
    "shelter_need": {"index": "ndwi", "direction": "rising", "label": "NDWI rise indicates flooding of built areas"},
}

WEATHER_VALIDATION = {
    "water_need": {"risk": "precipitation_mm", "check": "low", "threshold": 5.0, "label": "Low precipitation confirms water scarcity"},
    "shelter_need": {"risk": "storm_risk", "check": "high", "threshold": 0.5, "label": "Storm risk confirms shelter need"},
    "displacement": {"risk": "flood_risk", "check": "high", "threshold": 0.5, "label": "Flood risk supports displacement reports"},
    "aid_blocked": {"risk": "route_disruption_risk", "check": "high", "threshold": 0.4, "label": "Route disruption confirms access difficulty"},
    "food_need": {"risk": "precipitation_mm", "check": "low", "threshold": 5.0, "label": "Drought conditions support food insecurity"},
}


def _build_validation_context(state: PipelineState) -> dict:
    report_type = state.get("report_type") or ""
    sat_data = state.get("satellite_data") or {}
    weather = state.get("weather_data") or {}
    hits = state.get("corroboration_hits") or []
    corr_classes = state.get("corroboration_acled_classes")

    context: dict = {}

    # Satellite validation
    sat_rule = SATELLITE_VALIDATION.get(report_type)
    if sat_rule:
        index_key = sat_rule["index"]
        value = float(sat_data.get(index_key, 0.0))
        min_baseline = sat_rule.get("min_baseline")
        if min_baseline and float(sat_data.get("ndvi_baseline", 0.0)) < min_baseline:
            context["satellite"] = {"confirmed": False, "signal": "Arid region — satellite vegetation signal not meaningful", "confidence": 0.0}
        else:
            confirmed = (value < 0 if sat_rule["direction"] == "declining" else value > 0.15)
            context["satellite"] = {"confirmed": confirmed, "signal": sat_rule["label"], "confidence": min(abs(value), 1.0) if confirmed else 0.0}
    else:
        context["satellite"] = {"confirmed": False, "signal": "Satellite cannot directly validate this report type", "confidence": 0.0}

    # Weather validation
    wx_rule = WEATHER_VALIDATION.get(report_type)
    if wx_rule and weather:
        value = float(weather.get(wx_rule["risk"], 0.0))
        if wx_rule["check"] == "low":
            confirmed = value < wx_rule["threshold"]
        else:
            confirmed = value > wx_rule["threshold"]
        context["weather"] = {"confirmed": confirmed, "signal": wx_rule["label"], "confidence": 0.7 if confirmed else 0.0}
    else:
        context["weather"] = {"confirmed": False, "signal": "No weather validation for this report type", "confidence": 0.0}

    # ACLED validation
    acled_hits = [h for h in hits if h.get("source") == "acled"]
    if corr_classes and acled_hits:
        best = max(acled_hits, key=lambda h: {"critical": 4, "high": 3, "medium": 2, "low": 1}.get(h.get("severity", "low"), 0))
        context["acled"] = {
            "confirmed": True,
            "signal": f"ACLED {best.get('severity', '')} event within {best.get('distance_km', '?')}km",
            "confidence": min(compute_corroboration_score(acled_hits), 1.0),
        }
    elif corr_classes is None:
        context["acled"] = {"confirmed": False, "signal": "ACLED cannot validate this report type", "confidence": 0.0}
    else:
        context["acled"] = {"confirmed": False, "signal": "No matching ACLED events nearby", "confidence": 0.0}

    return context


@_safe_node
def score(state: PipelineState) -> dict:
    trace = state["node_trace"] + ["score"]

    # Real source prior
    source_type = state.get("source_type") or "web_anonymous"
    source_prior = SOURCE_PRIORS.get(source_type, 0.5)

    # Completeness from word count
    word_count = len((state.get("raw_narrative") or "").split())
    if word_count > 50:
        completeness = 0.8
    elif word_count > 20:
        completeness = 0.6
    else:
        completeness = 0.4

    # Geospatial consistency
    lat = state.get("latitude", 0.0)
    lon = state.get("longitude", 0.0)
    in_bbox = (
        EL_FASHER_BBOX["lat_min"] <= lat <= EL_FASHER_BBOX["lat_max"]
        and EL_FASHER_BBOX["lon_min"] <= lon <= EL_FASHER_BBOX["lon_max"]
    )
    geospatial = 0.8 if in_bbox else 0.4

    # Cross-source corroboration from corroborate node
    corroboration = float(state.get("corroboration_score", 0.0))

    # Weather plausibility
    weather = state.get("weather_data") or {}
    weather_plausibility = 0.5  # neutral default
    report_type = state.get("report_type") or ""
    if weather:
        flood_risk = float(weather.get("flood_risk", 0.0))
        if report_type in ("water_need", "food_need") and flood_risk < 0.2:
            weather_plausibility = 0.7
        elif report_type in ("displacement", "shelter_need") and flood_risk > 0.5:
            weather_plausibility = 0.8
        elif report_type in ("shelling", "gunfire"):
            weather_plausibility = 0.5

    # Satellite corroboration from enrich_satellite
    sat_data = state.get("satellite_data") or {}
    satellite_corr = float(sat_data.get("quality_score", 0.0)) * 0.5

    # Fusion
    fusion = fuse_satellite_weather_report_signals(
        satellite=state.get("satellite_data"),
        weather=state.get("weather_data"),
        reports={"cross_source_corroboration": corroboration},
    )
    satellite_alert_score = float(fusion["alert_score"])
    if satellite_corr < satellite_alert_score:
        satellite_corr = satellite_alert_score

    weather_risk = float(weather.get("flood_risk", 0.3))
    access_difficulty = compute_access_difficulty(weather_risk, satellite_corr)

    breakdown = ConfidenceBreakdown(
        source_prior=source_prior,
        spam_score=0.05,
        duplication_score=0.0,
        completeness_score=completeness,
        geospatial_consistency=geospatial,
        temporal_consistency=0.7,
        cross_source_corroboration=corroboration,
        weather_plausibility=weather_plausibility,
        satellite_corroboration=satellite_corr,
    )
    publishability = breakdown.compute_publishability()

    # Urgency from classification
    classification = state.get("classification") or {}
    urgency_hint = classification.get("urgency_hint", "medium")
    urgency_map = {"critical": 0.95, "high": 0.75, "medium": 0.5, "low": 0.25}
    urgency = urgency_map.get(urgency_hint, 0.5)

    # Validation context
    validation_context = _build_validation_context(state)

    return {
        "status": PipelineStatus.SCORED,
        "node_trace": trace,
        "satellite_alert": fusion,
        "confidence_breakdown": breakdown.model_dump(),
        "confidence_scores": {
            "publishability": publishability,
            "urgency": urgency,
            "access_difficulty": access_difficulty,
        },
        "validation_context": validation_context,
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
