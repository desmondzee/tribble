import asyncio
import json
import logging
from functools import wraps
from typing import Literal

from langgraph.graph import END, START, StateGraph

from tribble.config import get_settings
from tribble.models.confidence import ConfidenceBreakdown, SOURCE_PRIORS, compute_access_difficulty
from tribble.pipeline.state import PipelineState, PipelineStatus
from tribble.services.satellite_fusion import fuse_satellite_weather_report_signals
from tribble.services.zai_provider import get_zai_provider
from tribble.utils.geo import haversine_km

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
    lang = state.get("language") or "en"
    raw = state.get("raw_narrative") or ""

    if lang == "en":
        return {"status": PipelineStatus.TRANSLATED, "node_trace": trace, "translation": None}

    provider = get_zai_provider()
    if provider is None:
        return {"status": PipelineStatus.TRANSLATED, "node_trace": trace, "translation": raw}

    prompt = (
        "Translate the following crisis report to English. "
        "Output only the translation, no preamble or explanation.\n\n"
    )
    prompt += raw[:4000]
    result = asyncio.run(provider.generate(prompt))
    if result.status == "ok" and result.text:
        return {"status": PipelineStatus.TRANSLATED, "node_trace": trace, "translation": result.text.strip()}
    return {"status": PipelineStatus.TRANSLATED, "node_trace": trace, "translation": raw}


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

REPORT_TYPE_KEYWORDS: list[tuple[list[str], str]] = [
    (["shelling", "shelled", "artillery", "bombardment"], "shelling"),
    (["gunfire", "shooting", "gun shot"], "gunfire"),
    (["water shortage", "no water", "water station", "water supply", "running out of water"], "water_need"),
    (["food shortage", "no food", "hunger", "starving", "food distribution"], "food_need"),
    (["medical", "hospital", "injured", "medicine", "doctor"], "medical_need"),
    (["shelter", "displaced", "fleeing", "refugee camp"], "shelter_need"),
    (["displacement", "fled", "fleeing", "evacuat"], "displacement"),
    (["bridge", "destroyed", "damage", "infrastructure", "building collapsed"], "infrastructure_damage"),
    (["aid blocked", "convoy", "humanitarian access", "blocked"], "aid_blocked"),
    (["looting", "looted", "stolen"], "looting"),
    (["missing person", "missing people", "abducted"], "missing_persons"),
]


def _keyword_report_type(narrative: str) -> str | None:
    """Fallback when FLock is disabled: match narrative keywords to report_type."""
    text = (narrative or "").lower()
    for keywords, report_type in REPORT_TYPE_KEYWORDS:
        if any(k in text for k in keywords):
            return report_type
    return None


@_safe_node
def verify_extract(state: PipelineState) -> dict:
    """Extract report_type from narrative via FLock (if enabled) or keyword fallback."""
    import asyncio

    trace = state["node_trace"] + ["verify_extract"]
    narrative = (state.get("raw_narrative") or "").strip()
    norm = state.get("normalized") or {}
    narrative = str(norm.get("narrative_clean") or narrative)
    report_type_val: str | None = None
    provider_used = "keyword_fallback"
    plausibility = "ok"

    if get_settings().enable_flock and (get_settings().flock_api_key or "").strip():
        prompt = (
            "Given this crisis report narrative, choose exactly one report_type from this list: "
            "shelling, gunfire, food_need, water_need, medical_need, shelter_need, displacement, "
            "infrastructure_damage, aid_blocked, looting, missing_persons. "
            "Reply with only that one word, nothing else. If the report does not match any type, reply: unknown."
        )
        prompt += f"\n\nNarrative: {narrative[:1500]}"
        try:
            from tribble.services.flock_provider import FlockProvider

            settings = get_settings()
            flock = FlockProvider(
                api_key=settings.flock_api_key,
                base_url=settings.flock_api_base_url,
                model=settings.flock_model,
            )
            result = asyncio.run(flock.generate(prompt))
            if result.status == "ok" and result.text:
                raw = result.text.strip().lower().split()
                for word in raw:
                    if word in REPORT_TYPE_CATEGORIES:
                        report_type_val = word
                        provider_used = "flock"
                        break
        except Exception:
            pass

    if report_type_val is None:
        report_type_val = _keyword_report_type(narrative)

    llm_verification: dict = {
        "report_type": report_type_val,
        "plausibility": plausibility,
        "provider": provider_used,
    }
    return {
        "node_trace": trace,
        "report_type": report_type_val,
        "llm_verification": llm_verification,
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
    narrative = (state.get("translation") or state.get("raw_narrative") or "").strip()
    categories = list(REPORT_TYPE_CATEGORIES.get(report_type, []))
    help_cats: list[str] = []

    provider = get_zai_provider()
    if provider is not None and narrative:
        prompt = (
            "From this crisis report narrative, extract two lists. Reply with only valid JSON in this exact shape: "
            '{"crisis_categories": ["category1", ...], "help_categories": ["help1", ...]}. '
            "Use only these crisis_categories when applicable: security, food, water_sanitation, health, shelter, "
            "displacement, infrastructure, access. Use only these help_categories when applicable: food_aid, water_aid, "
            "medical_aid, shelter_aid, protection, logistics. If none apply use empty arrays. Narrative:\n\n"
        )
        prompt += narrative[:3000]
        result = asyncio.run(provider.generate(prompt))
        if result.status == "ok" and result.text:
            text = result.text.strip()
            if "```" in text:
                parts = text.split("```")
                for part in parts:
                    part = part.strip()
                    if part.startswith("json"):
                        part = part[4:].strip()
                    if part.startswith("{"):
                        text = part
                        break
            try:
                parsed = json.loads(text)
                if isinstance(parsed, dict):
                    cr = parsed.get("crisis_categories")
                    hc = parsed.get("help_categories")
                    if isinstance(cr, list):
                        categories = [str(x) for x in cr if x]
                    if isinstance(hc, list):
                        help_cats = [str(x) for x in hc if x]
            except (json.JSONDecodeError, TypeError):
                pass

    severity_hints = ["critical", "high", "medium", "low"]
    urgency = "medium"
    for hint in severity_hints:
        if hint in (narrative or state.get("raw_narrative") or "").lower():
            urgency = SEVERITY_URGENCY[hint]
            break

    return {
        "status": PipelineStatus.CLASSIFIED,
        "node_trace": trace,
        "classification": {
            "crisis_categories": categories,
            "help_categories": help_cats if provider else [],
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
def fetch_weather(state: PipelineState) -> dict:
    """Populate weather_data for report location (and optional date) via Open-Meteo."""
    trace = state["node_trace"] + ["fetch_weather"]
    lat = state.get("latitude", 0.0)
    lon = state.get("longitude", 0.0)
    timestamp = state.get("timestamp") or ""
    date_str: str | None = None
    if timestamp:
        try:
            from datetime import datetime
            dt = datetime.fromisoformat(timestamp.replace("Z", "+00:00"))
            date_str = dt.strftime("%Y-%m-%d")
        except (ValueError, TypeError):
            pass
    from tribble.ingest.weather import fetch_weather_for_pipeline
    raw_weather = fetch_weather_for_pipeline(lat=lat, lon=lon, date_str=date_str)
    return {"node_trace": trace, "weather_data": raw_weather}


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
def fetch_satellite(state: PipelineState) -> dict:
    """Populate satellite_eo_features and satellite_quality for report location via STAC."""
    trace = state["node_trace"] + ["fetch_satellite"]
    lat = state.get("latitude", 0.0)
    lon = state.get("longitude", 0.0)
    timestamp = state.get("timestamp") or ""
    date_str: str | None = None
    if timestamp:
        try:
            from datetime import datetime
            dt = datetime.fromisoformat(timestamp.replace("Z", "+00:00"))
            date_str = dt.strftime("%Y-%m-%d")
        except (ValueError, TypeError):
            pass
    from tribble.ingest.satellite import fetch_satellite_for_pipeline
    eo_features, quality, scene = fetch_satellite_for_pipeline(lat=lat, lon=lon, date_str=date_str)
    return {
        "node_trace": trace,
        "satellite_eo_features": eo_features,
        "satellite_quality": quality,
        "satellite_scene": scene,
    }


@_safe_node
def enrich_satellite(state: PipelineState) -> dict:
    eo_features = state.get("satellite_eo_features") or {}
    quality = state.get("satellite_quality") or {}
    flood_score = float(eo_features.get("flood_score", 0.0))
    change_score = float(eo_features.get("change_score", 0.0))
    quality_score = float(quality.get("quality_score", 0.0))

    # Optional AI analysis when flag on and we have a scene with tile_url
    satellite_ai_dict: dict | None = None
    settings = get_settings()
    scene = state.get("satellite_scene")
    if settings.enable_satellite_ai_analysis and scene and (scene.get("tile_url") or "").strip():
        try:
            from tribble.db import get_supabase
            from tribble.services.satellite_vision import get_or_create_ai_analysis

            sb = get_supabase()
            analysis = get_or_create_ai_analysis(sb, scene.get("scene_id", ""), scene)
            satellite_ai_dict = analysis.to_dict_for_fusion()
            flood_score = max(flood_score, analysis.flood_score_ai)
            change_score = max(change_score, analysis.infrastructure_damage_score_ai)
        except Exception as exc:
            logger.debug("Satellite AI analysis skipped: %s", exc)

    reason_codes = []
    if quality_score < 0.5:
        reason_codes.append("low_scene_quality")
    if flood_score > 0.6:
        reason_codes.append("flood_signal_detected")
    if satellite_ai_dict and float(satellite_ai_dict.get("flood_score_ai", 0)) > 0.5:
        reason_codes.append("ai_flood_signal")
    if satellite_ai_dict and float(satellite_ai_dict.get("infrastructure_damage_score_ai", 0)) > 0.5:
        reason_codes.append("ai_infrastructure_concern")
    if not reason_codes:
        reason_codes.append("limited_satellite_signal")

    satellite_data = {
        "flood_score": round(max(0.0, min(flood_score, 1.0)), 4),
        "change_score": round(max(0.0, min(change_score, 1.0)), 4),
        "quality_score": round(max(0.0, min(quality_score, 1.0)), 4),
        "reason_codes": reason_codes,
    }
    if satellite_ai_dict:
        satellite_data["flood_score_ai"] = satellite_ai_dict.get("flood_score_ai", 0.0)
        satellite_data["infrastructure_damage_score_ai"] = satellite_ai_dict.get("infrastructure_damage_score_ai", 0.0)

    return {
        "status": PipelineStatus.SATELLITE_ENRICHED,
        "node_trace": state["node_trace"] + ["enrich_satellite"],
        "satellite_data": satellite_data,
        "satellite_ai": satellite_ai_dict,
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

    # LLM verification (FLock or keyword fallback)
    llm_verification = state.get("llm_verification")
    if llm_verification is not None:
        context["llm_verification"] = llm_verification

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
        ("verify_extract", verify_extract),
        ("classify", classify),
        ("geocode", geocode),
        ("deduplicate", deduplicate),
        ("corroborate", corroborate),
        ("fetch_weather", fetch_weather),
        ("enrich_weather", enrich_weather),
        ("fetch_satellite", fetch_satellite),
        ("enrich_satellite", enrich_satellite),
        ("score", score),
        ("cluster", cluster_node),
    ]:
        g.add_node(name, fn)
    g.add_edge(START, "prefilter")
    g.add_conditional_edges("prefilter", _route_prefilter)
    for a, b in [
        ("normalize", "translate"),
        ("translate", "verify_extract"),
        ("verify_extract", "classify"),
        ("classify", "geocode"),
        ("geocode", "deduplicate"),
        ("deduplicate", "corroborate"),
        ("corroborate", "fetch_weather"),
        ("fetch_weather", "enrich_weather"),
        ("enrich_weather", "fetch_satellite"),
        ("fetch_satellite", "enrich_satellite"),
        ("enrich_satellite", "score"),
        ("score", "cluster"),
    ]:
        g.add_edge(a, b)
    g.add_edge("cluster", END)
    return g.compile()
