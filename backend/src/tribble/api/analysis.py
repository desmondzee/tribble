import logging
from datetime import datetime

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel

from tribble.config import get_settings
from tribble.db import get_supabase
from tribble.ingest.satellite_indices import compute_flood_change_scores
from tribble.services.gemini_provider import GeminiProvider
from tribble.services.flock_provider import FlockProvider
from tribble.utils.geo import haversine_km
from tribble.services.risk_scoring import (
    classify_baseline_vegetation,
    compute_corridor_risk,
    compute_zone_risk_profile,
    build_viewer_url,
)
from tribble.services.satellite_vision import get_or_create_ai_analysis_async
from tribble.services.event_satellite import run_event_satellite_analysis

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/analysis", tags=["analysis"])


def _build_analysis_prompt(
    events: list[dict],
    civilian_reports: list[dict],
    weather: list[dict],
) -> str:
    event_summary = "\n".join(
        f"- {e.get('timestamp','?')}: {e.get('ontology_class','?')} ({e.get('severity','?')}) "
        f"at {e.get('location_name','?')}: {e.get('description','')[:200]}"
        for e in events[:50]
    )
    report_summary = "\n".join(
        f"- {r.get('timestamp','?')}: [{r.get('report_type','?')}] {r.get('severity','?')} "
        f"at {r.get('location_name','?')}: {r.get('narrative','')[:150]}"
        for r in civilian_reports[:80]
    )
    weather_summary = "\n".join(
        f"- {w.get('date','?')}: {w.get('temperature_c','?')}°C, "
        f"humidity {w.get('humidity_pct','?')}%, precip {w.get('precipitation_mm','?')}mm"
        for w in weather[:15]
    )

    return f"""You are a humanitarian intelligence analyst for the El Fasher crisis in North Darfur, Sudan (May 2024).

Analyze the following data and produce:
1. **Situation Report**: Current status overview (2-3 paragraphs)
2. **Trend Analysis**: Key escalation/de-escalation patterns
3. **Needs Assessment**: Priority humanitarian needs ranked by urgency
4. **Recommendations**: 3-5 actionable recommendations for NGOs

## Armed Conflict Events ({len(events)} total)
{event_summary or "No events available."}

## Civilian Reports ({len(civilian_reports)} total)
{report_summary or "No civilian reports available."}

## Weather Conditions
{weather_summary or "No weather data available."}

Respond with structured analysis. Be specific about locations and dates."""


@router.post("/run")
async def run_analysis():
    """Read from Supabase tables, build data summary, send to Gemini for analysis."""
    settings = get_settings()

    try:
        sb = get_supabase()
    except RuntimeError:
        raise HTTPException(status_code=503, detail="Supabase not configured")

    # Fetch data from Supabase
    events_resp = sb.table("events").select("*").order("timestamp", desc=True).limit(100).execute()
    reports_resp = sb.table("civilian_reports").select("*").order("timestamp", desc=True).limit(200).execute()
    weather_resp = sb.table("weather_data").select("*").order("date", desc=True).limit(15).execute()

    events = events_resp.data or []
    civilian_reports = reports_resp.data or []
    weather = weather_resp.data or []

    if not events and not civilian_reports:
        raise HTTPException(status_code=404, detail="No data available for analysis. Run seed script first.")

    prompt = _build_analysis_prompt(events, civilian_reports, weather)

    # Try Gemini first
    gemini = GeminiProvider(
        api_key=settings.gemini_api_key,
        model=settings.gemini_model,
    )
    result = await gemini.generate(prompt)

    # Fall back to Flock if Gemini unavailable
    if result.status != "ok" and settings.enable_flock:
        logger.info("Gemini unavailable (%s), falling back to Flock", result.status)
        flock = FlockProvider(
            api_key=settings.flock_api_key,
            base_url=settings.flock_api_base_url,
            model=settings.flock_model,
        )
        result = await flock.generate(prompt)

    if result.status != "ok":
        raise HTTPException(
            status_code=503,
            detail=f"No LLM provider available: {result.error or result.status}",
        )

    # Store result in analysis_results table
    analysis_row = {
        "analysis_type": "situation_report",
        "summary": result.text,
        "details": result.metadata,
        "provider": result.metadata.get("provider", "unknown"),
        "model": result.model,
        "events_analyzed": len(events),
        "reports_analyzed": len(civilian_reports),
    }
    sb.table("analysis_results").insert(analysis_row).execute()

    return {
        "analysis": result.text,
        "provider": result.metadata.get("provider"),
        "model": result.model,
        "events_analyzed": len(events),
        "reports_analyzed": len(civilian_reports),
    }


# ---------------------------------------------------------------------------
# Satellite analysis
# ---------------------------------------------------------------------------


def _closest_weather(scene_date: str, weather: list[dict]) -> dict | None:
    """Return the weather record closest in date to a satellite scene."""
    if not weather or not scene_date:
        return None
    try:
        target = datetime.fromisoformat(scene_date).date()
    except (ValueError, TypeError):
        return None
    best, best_delta = None, None
    for w in weather:
        try:
            d = datetime.fromisoformat(w["date"]).date()
        except (ValueError, TypeError, KeyError):
            continue
        delta = abs((d - target).days)
        if best_delta is None or delta < best_delta:
            best, best_delta = w, delta
    return best


_haversine_km = haversine_km


def _risk_level_from_profile(profile: dict) -> str:
    max_risk = max(profile.values())
    if max_risk >= 0.8:
        return "critical"
    if max_risk >= 0.6:
        return "high"
    if max_risk >= 0.3:
        return "moderate"
    return "low"


def _assign_zone_narratives(zones: list[dict], llm_text: str) -> None:
    """Match '### <location>' sections from LLM output to zones. Falls back to full text."""
    import re
    sections = re.split(r"^###\s+", llm_text, flags=re.MULTILINE)
    location_map: dict[str, str] = {}
    for section in sections:
        if not section.strip():
            continue
        lines = section.strip().split("\n", 1)
        heading = lines[0].strip().lower()
        body = lines[1].strip() if len(lines) > 1 else ""
        if body:
            location_map[heading] = body

    for zone in zones:
        loc = (zone.get("location") or "").lower()
        zone["narrative"] = location_map.get(loc, llm_text)


@router.get("/dashboard")
async def get_dashboard():
    """Operational dashboard: risk zones, corridor advisories, satellite viewer links."""
    settings = get_settings()

    try:
        sb = get_supabase()
    except RuntimeError:
        raise HTTPException(status_code=503, detail="Supabase not configured")

    # Fetch all data sources
    clusters = (sb.table("incident_clusters").select("*").execute()).data or []
    scenes = (sb.table("satellite_scenes").select("*").order("acquisition_date").execute()).data or []
    weather = (sb.table("weather_data").select("*").order("date").execute()).data or []
    acled_events = (sb.table("events").select("*").execute()).data or []
    reports = (sb.table("civilian_reports").select("*").execute()).data or []

    if not clusters:
        raise HTTPException(status_code=404, detail="No incident clusters available. Run seed + pipeline first.")

    # Determine baseline vegetation from earliest satellite scene
    baseline_ndvi = float(scenes[0].get("ndvi", 0.15)) if scenes else 0.15
    baseline_veg = classify_baseline_vegetation(baseline_ndvi)

    # Build zones
    zones = []
    for cluster in clusters:
        c_lat = float(cluster.get("centroid_lat", 0))
        c_lng = float(cluster.get("centroid_lng", 0))
        c_radius = float(cluster.get("radius_km", 5.0))

        # Find ACLED events near this cluster
        nearby_acled = [
            e for e in acled_events
            if _haversine_km(c_lat, c_lng, float(e.get("lat", 0)), float(e.get("lng", 0))) <= c_radius + 2
        ]

        # Count report types in this cluster's area
        nearby_reports = [
            r for r in reports
            if _haversine_km(c_lat, c_lng, float(r.get("lat", 0)), float(r.get("lng", 0))) <= c_radius
        ]
        report_type_counts: dict[str, int] = {}
        for r in nearby_reports:
            rt = r.get("report_type", "unknown")
            report_type_counts[rt] = report_type_counts.get(rt, 0) + 1

        # Find closest satellite scene
        closest_scene = None
        min_dist = float("inf")
        for s in scenes:
            d = _haversine_km(c_lat, c_lng, float(s.get("lat", 0)), float(s.get("lng", 0)))
            if d < min_dist:
                min_dist, closest_scene = d, s

        # Optional AI analysis for this zone's scene (cached per scene_id)
        ai_analysis = None
        if closest_scene:
            scene_id = closest_scene.get("scene_id") or str(closest_scene.get("id", ""))
            if scene_id:
                ai_analysis = await get_or_create_ai_analysis_async(sb, scene_id, closest_scene)
        satellite_ai_dict = ai_analysis.to_dict_for_fusion() if ai_analysis else None

        # Find closest weather
        closest_wx = _closest_weather(
            cluster.get("last_updated", ""),
            weather,
        ) or {}

        # Compute risk profile
        sat_data = {
            "ndvi": float(closest_scene.get("ndvi", 0)) if closest_scene else 0.0,
            "ndwi": float(closest_scene.get("ndwi", 0)) if closest_scene else 0.0,
            "quality_score": float(closest_scene.get("quality_score", 0)) if closest_scene else 0.0,
            "change_score": 0.0,
        }
        risk_profile = compute_zone_risk_profile(
            acled_events=nearby_acled,
            report_type_counts=report_type_counts,
            weather=closest_wx,
            satellite=sat_data,
            baseline_vegetation=baseline_veg,
            satellite_ai=satellite_ai_dict,
        )
        risk_level = _risk_level_from_profile(risk_profile)
        top_risks = sorted(risk_profile, key=risk_profile.get, reverse=True)[:2]

        # Satellite context with viewer URL and optional AI analysis
        satellite_context = {"scenes": [], "change_detection": None, "baseline_vegetation": baseline_veg, "viewer_url": None, "ai_analysis": None}
        if closest_scene:
            satellite_context["scenes"] = [{
                "acquisition_date": closest_scene.get("acquisition_date"),
                "tile_url": closest_scene.get("tile_url"),
                "bbox": closest_scene.get("bbox"),
                "cloud_cover_pct": closest_scene.get("cloud_cover_pct"),
                "ndvi": closest_scene.get("ndvi"),
                "ndwi": closest_scene.get("ndwi"),
                "quality_score": closest_scene.get("quality_score"),
            }]
            bbox = closest_scene.get("bbox")
            if bbox and isinstance(bbox, list) and len(bbox) == 4:
                satellite_context["viewer_url"] = build_viewer_url(bbox, closest_scene.get("acquisition_date", ""))

            if satellite_ai_dict:
                satellite_context["ai_analysis"] = satellite_ai_dict

            # Change detection if multiple scenes
            if len(scenes) >= 2:
                first, last = scenes[0], scenes[-1]
                satellite_context["change_detection"] = {
                    "ndvi_delta": round(float(last.get("ndvi", 0)) - float(first.get("ndvi", 0)), 4),
                    "ndwi_delta": round(float(last.get("ndwi", 0)) - float(first.get("ndwi", 0)), 4),
                    "flood_score": compute_flood_change_scores(
                        ndwi_before=float(first.get("ndwi", 0)),
                        ndwi_after=float(last.get("ndwi", 0)),
                        mndwi_before=float(first.get("mndwi", 0)),
                        mndwi_after=float(last.get("mndwi", 0)),
                    )["flood_score"],
                }

        # Corroboration summary
        acled_severities = [e.get("severity", "low") for e in nearby_acled]
        severity_order = {"critical": 4, "high": 3, "medium": 2, "low": 1}
        acled_max = max(acled_severities, key=lambda s: severity_order.get(s, 0)) if acled_severities else None

        corroboration = {
            "acled_events_nearby": len(nearby_acled),
            "acled_severity_max": acled_max,
            "cross_report_density": min(len(nearby_reports) / 50.0, 1.0),
            "satellite_confirmed": [k for k in ["infrastructure_damage", "flood_risk", "water_scarcity"] if risk_profile.get(k, 0) > 0.5 and closest_scene],
            "weather_confirmed": [k for k in ["flood_risk", "water_scarcity"] if risk_profile.get(k, 0) > 0.5 and closest_wx],
        }
        if satellite_ai_dict and float(satellite_ai_dict.get("infrastructure_damage_score_ai", 0)) > 0.5 and closest_scene:
            if "infrastructure_damage" not in corroboration["satellite_confirmed"]:
                corroboration["satellite_confirmed"] = list(corroboration["satellite_confirmed"]) + ["infrastructure_damage"]

        zones.append({
            "cluster_id": cluster.get("id"),
            "location": cluster.get("admin1") or cluster.get("country", "Unknown"),
            "centroid": [c_lat, c_lng],
            "radius_km": c_radius,
            "report_count": cluster.get("report_count", 0),
            "risk_profile": risk_profile,
            "top_risks": top_risks,
            "risk_level": risk_level,
            "corroboration": corroboration,
            "satellite_context": satellite_context,
            "narrative": None,  # filled by Gemini below
        })

    # Corridor advisories between cluster pairs within 25km
    corridors = []
    zone_data_for_corridors = [
        {"centroid": (z["centroid"][0], z["centroid"][1]), "risk_level": z["risk_level"], "location": z["location"]}
        for z in zones
    ]
    for i, z1 in enumerate(zones):
        for z2 in zones[i + 1:]:
            c1 = (z1["centroid"][0], z1["centroid"][1])
            c2 = (z2["centroid"][0], z2["centroid"][1])
            dist = _haversine_km(*c1, *c2)
            if dist > 25.0:
                continue

            # Find ACLED events and clusters near the path between these two
            path_acled = [
                e for e in acled_events
                if _haversine_km(float(e.get("lat", 0)), float(e.get("lng", 0)), (c1[0]+c2[0])/2, (c1[1]+c2[1])/2) < dist
            ]
            path_clusters = [
                zd for j, zd in enumerate(zone_data_for_corridors)
                if j != i and zd["centroid"] != c2
            ]

            corridor = compute_corridor_risk(c1, c2, path_acled, path_clusters)
            corridors.append({
                "from": {"name": z1["location"], "centroid": z1["centroid"]},
                "to": {"name": z2["location"], "centroid": z2["centroid"]},
                "distance_km": corridor["distance_km"],
                "risk_level": corridor["risk_level"],
                "hazards": corridor["hazards"],
                "advisory": None,  # filled by Gemini below
            })

    # Generate Gemini narratives for high-risk zones
    high_risk_zones = [z for z in zones if z["risk_level"] in ("critical", "high")]
    if high_risk_zones and settings.gemini_api_key:
        zone_summaries = "\n".join(
            f"- {z['location']}: risk_level={z['risk_level']}, top_risks={z['top_risks']}, "
            f"acled_events={z['corroboration']['acled_events_nearby']}, reports={z['report_count']}, "
            f"profile={z['risk_profile']}"
            for z in high_risk_zones
        )
        corridor_summaries = "\n".join(
            f"- {c['from']['name']} -> {c['to']['name']}: {c['risk_level']}, hazards={c['hazards']}"
            for c in corridors if c["risk_level"] in ("critical", "high")
        )
        narrative_prompt = f"""You are an NGO operations analyst. Write brief, actionable summaries.

For each zone listed below, write a heading "### <location>" followed by 1-2 sentences about the key risks and what NGOs should prioritize.
For each high-risk corridor, write 1 sentence of routing advice under "### Corridors".
End with a section "### Summary" containing a 2-3 sentence overall situation summary.

## High-Risk Zones
{zone_summaries}

## High-Risk Corridors
{corridor_summaries or "No high-risk corridors identified."}

Be specific about risk types and actionable. No hedging."""

        gemini = GeminiProvider(api_key=settings.gemini_api_key, model=settings.gemini_model)
        llm_result = await gemini.generate(narrative_prompt)

        if llm_result.status == "ok" and llm_result.text:
            narrative_summary = llm_result.text
            # Parse per-zone narratives from the structured LLM output
            _assign_zone_narratives(high_risk_zones, llm_result.text)
        else:
            narrative_summary = None
    else:
        narrative_summary = None

    return {
        "generated_at": datetime.now().isoformat(),
        "data_coverage": {
            "satellite_scenes": len(scenes),
            "weather_records": len(weather),
            "civilian_reports": len(reports),
            "acled_events": len(acled_events),
            "incident_clusters": len(clusters),
        },
        "baseline_vegetation": baseline_veg,
        "zones": zones,
        "corridors": corridors,
        "narrative_summary": narrative_summary,
    }


# ---------------------------------------------------------------------------
# Event-driven satellite analysis
# ---------------------------------------------------------------------------


class EventSatelliteBody(BaseModel):
    event_ids: list[str] | None = None
    limit: int = 10
    persist: bool = True
    events_with_coords: list[dict] | None = None


@router.post("/event-satellite")
async def run_event_satellite(body: EventSatelliteBody | None = None):
    """Run event-driven satellite analysis: parse event (context-driven), multi-time snapshots, aid-impact synthesis.

    Body: { "event_ids": ["uuid1", "uuid2"] } to analyse events from the events table; or
    "events_with_coords": [ { "id", "lat", "lng", "narrative" or "description", "timestamp" or "event_timestamp", ... } ]
    to run for feed items (e.g. news) without fetching from DB. Returns per-event: parsed_event,
    snapshots (period_label, acquisition_date, image_url, satellite_analysis), aid_impact.
    Organisations can use snapshots to see infrastructure across different time periods.
    """
    try:
        sb = get_supabase()
    except RuntimeError:
        raise HTTPException(status_code=503, detail="Supabase not configured")

    opts = body or EventSatelliteBody()
    event_ids = opts.event_ids
    limit = opts.limit
    persist = opts.persist
    events_with_coords = opts.events_with_coords

    events: list[dict] = []
    if events_with_coords:
        for e in events_with_coords[:20]:
            if not isinstance(e, dict):
                continue
            lat, lng = e.get("lat"), e.get("lng")
            if lat is None or lng is None:
                continue
            events.append({
                "id": e.get("id") or e.get("event_id"),
                "event_id": e.get("event_id") or e.get("id"),
                "lat": float(lat),
                "lng": float(lng),
                "description": e.get("description") or e.get("narrative") or "",
                "narrative": e.get("narrative") or e.get("description") or "",
                "timestamp": e.get("timestamp") or e.get("event_timestamp"),
                "event_timestamp": e.get("event_timestamp") or e.get("timestamp"),
                "ontology_class": e.get("ontology_class"),
                "processing_metadata": e.get("processing_metadata"),
            })
    elif event_ids:
        for eid in event_ids[:20]:
            resp = sb.table("events").select("*").eq("id", eid).execute()
            if resp.data and len(resp.data) > 0:
                events.append(resp.data[0])
    else:
        resp = (
            sb.table("events")
            .select("*")
            .not_.is_("lat", "null")
            .not_.is_("lng", "null")
            .order("timestamp", desc=True)
            .limit(limit)
            .execute()
        )
        events = resp.data or []

    if not events:
        raise HTTPException(
            status_code=404,
            detail="No events with coordinates found. Provide event_ids or ensure events table has lat/lng.",
        )

    results = []
    for event in events:
        try:
            out = await run_event_satellite_analysis(sb, event)
            results.append(out)
            if persist and out.get("event_id"):
                aid = out.get("aid_impact") or {}
                sb.table("analysis_results").insert({
                    "analysis_type": "event_satellite_aid_impact",
                    "summary": aid.get("summary", ""),
                    "details": {
                        "event_id": out.get("event_id"),
                        "parsed_event": out.get("parsed_event"),
                        "snapshots": out.get("snapshots"),
                        "synthesis": aid,
                    },
                    "provider": "gemini",
                    "model": None,
                    "events_analyzed": 1,
                    "reports_analyzed": 0,
                }).execute()
        except Exception as exc:
            logger.warning("Event satellite analysis failed for event %s: %s", event.get("id"), exc)
            results.append({
                "event_id": str(event.get("id")) if event.get("id") else None,
                "error": str(exc),
                "parsed_event": None,
                "snapshots": [],
                "aid_impact": None,
            })

    return {"results": results}


@router.get("/event-satellite")
async def get_event_satellite_results(
    event_ids: str | None = Query(None, description="Comma-separated event or report IDs to fetch satellite analysis for"),
    limit: int = Query(50, ge=1, le=200, description="Max number of stored results to return when event_ids not provided"),
):
    """Return stored event-driven satellite analysis from Supabase for the feed, Inspect, and Helios.

    Use event_ids to get results for specific events (e.g. feed item ids): all snapshots and photos
    across time intervals are in each result's snapshots array. Use in a satellite analysis bar
    per event to show image_url, acquisition_date, period_label for before/at_event/after.
    Only events with coordinates have satellite analysis; do not draw a 5km footprint for
    cluster markers that have no events inside their radius.
    """
    try:
        sb = get_supabase()
    except RuntimeError:
        raise HTTPException(status_code=503, detail="Supabase not configured")

    ids_set: set[str] | None = None
    if event_ids:
        ids_set = {x.strip() for x in event_ids.split(",") if x.strip()}

    try:
        q = (
            sb.table("analysis_results")
            .select("id, summary, details, created_at")
            .eq("analysis_type", "event_satellite_aid_impact")
            .order("created_at", desc=True)
            .limit(limit * 2 if ids_set else limit)
        )
        rows = q.execute().data or []
    except Exception as exc:
        logger.warning("Event satellite GET failed: %s", exc)
        raise HTTPException(status_code=503, detail="Database query failed")

    results = []
    seen_event_ids: set[str] = set()
    for r in rows:
        details = r.get("details") or {}
        if not isinstance(details, dict):
            continue
        eid = details.get("event_id")
        if eid is not None:
            eid = str(eid)
        if ids_set is not None and eid not in ids_set:
            continue
        if eid and eid in seen_event_ids:
            continue
        if eid:
            seen_event_ids.add(eid)
        results.append({
            "event_id": eid,
            "parsed_event": details.get("parsed_event"),
            "snapshots": details.get("snapshots") or [],
            "aid_impact": details.get("synthesis"),
            "summary": r.get("summary"),
            "created_at": r.get("created_at"),
        })
        if ids_set and len(results) >= len(ids_set):
            break
        if not ids_set and len(results) >= limit:
            break

    return {"results": results}
