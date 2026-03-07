"""Route suggestion API: recency-aware safe routing away from recent events."""

from datetime import datetime, timedelta, timezone
import logging
import math

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel, Field

from tribble.config import get_settings
from tribble.db import get_supabase
from tribble.services.anthropic_provider import AnthropicProvider
from tribble.services.risk_scoring import compute_corridor_risk
from tribble.utils.geo import haversine_km

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/routes", tags=["routes"])


# ------ Request/response models ------


class Point(BaseModel):
    lat: float = Field(..., ge=-90, le=90)
    lng: float = Field(..., ge=-180, le=180)


class SuggestPostBody(BaseModel):
    origin: Point
    destination: Point
    avoid_recent_hours: int = Field(24, ge=1, le=720)
    country_iso: str | None = None


def _cluster_centroid(cluster: dict) -> tuple[float, float]:
    """Extract (lat, lng) from cluster row (table returns centroid as geography or centroid_lat/lng)."""
    if cluster.get("centroid_lat") is not None and cluster.get("centroid_lng") is not None:
        return (float(cluster["centroid_lat"]), float(cluster["centroid_lng"]))
    centroid = cluster.get("centroid")
    if isinstance(centroid, dict) and "coordinates" in centroid:
        coords = centroid["coordinates"]
        return (float(coords[1]), float(coords[0]))
    return (0.0, 0.0)


def _event_to_acled_shape(row: dict) -> dict:
    """Shape events table row for compute_corridor_risk (lat, lng, ontology_class, severity)."""
    return {
        "lat": float(row.get("lat", 0)),
        "lng": float(row.get("lng", 0)),
        "ontology_class": row.get("ontology_class", "armed_conflict"),
        "severity": row.get("severity", "low"),
        "timestamp": row.get("timestamp"),
    }


def _filter_recent_events(events: list[dict], since_ts: datetime) -> list[dict]:
    """Keep only events with timestamp >= since_ts."""
    out = []
    for e in events:
        ts = e.get("timestamp")
        if ts is None:
            continue
        if isinstance(ts, str):
            try:
                dt = datetime.fromisoformat(ts.replace("Z", "+00:00"))
            except ValueError:
                continue
        else:
            dt = ts
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        if dt >= since_ts:
            out.append(e)
    return out


def _filter_recent_clusters(clusters: list[dict], since_ts: datetime) -> list[dict]:
    """Keep only clusters with last_updated >= since_ts."""
    out = []
    for c in clusters:
        lu = c.get("last_updated")
        if lu is None:
            out.append(c)
            continue
        if isinstance(lu, str):
            try:
                dt = datetime.fromisoformat(lu.replace("Z", "+00:00"))
            except ValueError:
                out.append(c)
                continue
        else:
            dt = lu
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        if dt >= since_ts:
            out.append(c)
    return out


def _point_to_segment_distance_km(
    point: tuple[float, float],
    seg_start: tuple[float, float],
    seg_end: tuple[float, float],
) -> float:
    """Approximate distance from a point to a line segment in km."""
    px, py = point
    ax, ay = seg_start
    bx, by = seg_end
    dx, dy = bx - ax, by - ay
    if dx == 0 and dy == 0:
        return haversine_km(px, py, ax, ay)
    t = max(0.0, min(1.0, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy)))
    proj_lat = ax + t * dx
    proj_lon = ay + t * dy
    return haversine_km(px, py, proj_lat, proj_lon)


def _nearest_event_to_segment(
    events: list[dict], seg_start: tuple[float, float], seg_end: tuple[float, float]
) -> tuple[dict | None, float]:
    """Return (event, distance_km) for the event nearest to the segment, or (None, inf)."""
    best_event, best_dist = None, float("inf")
    for e in events:
        elat, elng = float(e.get("lat", 0)), float(e.get("lng", 0))
        d = _point_to_segment_distance_km((elat, elng), seg_start, seg_end)
        if d < best_dist:
            best_dist = d
            best_event = e
    return (best_event, best_dist)


def _offset_waypoint(
    seg_start: tuple[float, float],
    seg_end: tuple[float, float],
    event_lat: float,
    event_lng: float,
    offset_km: float = 15.0,
) -> tuple[float, float]:
    """Return a waypoint (lat, lng) offset from the segment midpoint, away from the event."""
    mid_lat = (seg_start[0] + seg_end[0]) / 2
    mid_lng = (seg_start[1] + seg_end[1]) / 2
    # Vector from event to midpoint
    dx = mid_lat - event_lat
    dy = mid_lng - event_lng
    n = math.sqrt(dx * dx + dy * dy) or 1.0
    # Move from midpoint in direction away from event; ~111 km per degree
    step = offset_km / 111.0
    way_lat = mid_lat + (dx / n) * step
    way_lng = mid_lng + (dy / n) * step
    return (way_lat, way_lng)


async def _fetch_route_data(
    sb,
    avoid_recent_hours: int,
    country_iso: str | None,
) -> tuple[list[dict], list[dict], list[dict]]:
    """Fetch events, clusters, and reports; return (events, clusters, zone_data_for_risk)."""
    since = datetime.now(timezone.utc) - timedelta(hours=avoid_recent_hours)
    since_iso = since.isoformat()

    events_raw = sb.table("events").select("*").order("timestamp", desc=True).limit(200).execute()
    events_all = events_raw.data or []
    events = _filter_recent_events(events_all, since)

    clusters_raw = sb.table("incident_clusters").select("*").execute()
    clusters_all = clusters_raw.data or []
    clusters_recent = _filter_recent_clusters(clusters_all, since)

    zone_data_for_risk = [
        {"centroid": _cluster_centroid(c), "risk_level": _severity_to_risk(c.get("weighted_severity", 0.0)), "location": c.get("admin1") or c.get("country", "Unknown")}
        for c in clusters_recent
    ]

    if country_iso:
        iso_upper = country_iso.upper()
        events = [e for e in events if e.get("region_id") == iso_upper or (e.get("location_name") and iso_upper in (e.get("location_name") or ""))]
        try:
            clusters_in_country = sb.rpc(
                "get_incident_clusters_geojson",
                {"p_country_iso": iso_upper, "p_limit": 500},
            ).execute().data or []
        except Exception:
            clusters_in_country = [c for c in clusters_recent if (c.get("country_iso") or "").upper() == iso_upper]
        if clusters_in_country:
            zone_data_for_risk = [
                {"centroid": (float(c["centroid_lat"]), float(c["centroid_lng"])) if c.get("centroid_lat") is not None else _cluster_centroid(c), "risk_level": _severity_to_risk(c.get("weighted_severity", 0.0)), "location": c.get("admin1") or c.get("country", "Unknown")}
                for c in clusters_in_country
            ]

    return events, clusters_recent, zone_data_for_risk


def _severity_to_risk(weighted_severity: float) -> str:
    if weighted_severity >= 0.8:
        return "critical"
    if weighted_severity >= 0.5:
        return "high"
    if weighted_severity >= 0.2:
        return "moderate"
    return "low"


def _build_recent_events_nearby(
    events: list[dict],
    origin: tuple[float, float],
    destination: tuple[float, float],
    path_radius_km: float = 25.0,
) -> list[dict]:
    """Events that are near the segment or within path_radius_km of midpoint."""
    mid_lat = (origin[0] + destination[0]) / 2
    mid_lng = (origin[1] + destination[1]) / 2
    out = []
    for e in events:
        elat, elng = float(e.get("lat", 0)), float(e.get("lng", 0))
        dist_to_mid = haversine_km(elat, elng, mid_lat, mid_lng)
        dist_to_seg = _point_to_segment_distance_km((elat, elng), origin, destination)
        if dist_to_mid <= path_radius_km or dist_to_seg <= path_radius_km:
            out.append({
                "id": str(e.get("id", "")),
                "headline": e.get("description") or e.get("location_name") or "Incident",
                "lat": elat,
                "lng": elng,
                "timestamp": e.get("timestamp"),
                "severity": e.get("severity", "low"),
            })
    return out


@router.get("/suggest")
async def suggest_routes_get(
    from_lat: float = Query(..., ge=-90, le=90),
    from_lng: float = Query(..., ge=-180, le=180),
    to_lat: float = Query(..., ge=-90, le=90),
    to_lng: float = Query(..., ge=-180, le=180),
    avoid_recent_hours: int = Query(24, ge=1, le=720),
    country_iso: str | None = Query(None),
):
    """Suggest safe routes between origin and destination, avoiding recent events."""
    origin = (from_lat, from_lng)
    destination = (to_lat, to_lng)
    return await _suggest_impl(origin, destination, avoid_recent_hours, country_iso)


@router.post("/suggest")
async def suggest_routes_post(body: SuggestPostBody):
    """Suggest safe routes (POST body)."""
    origin = (body.origin.lat, body.origin.lng)
    destination = (body.destination.lat, body.destination.lng)
    return await _suggest_impl(
        origin,
        destination,
        body.avoid_recent_hours,
        body.country_iso,
    )


async def _suggest_impl(
    origin: tuple[float, float],
    destination: tuple[float, float],
    avoid_recent_hours: int,
    country_iso: str | None,
) -> dict:
    try:
        sb = get_supabase()
    except RuntimeError:
        raise HTTPException(status_code=503, detail="Supabase not configured")

    events, clusters_recent, zone_data_for_risk = await _fetch_route_data(
        sb, avoid_recent_hours, country_iso
    )
    acled_for_risk = [_event_to_acled_shape(e) for e in events]

    recent_events_nearby = _build_recent_events_nearby(events, origin, destination)

    origin_float = (float(origin[0]), float(origin[1]))
    dest_float = (float(destination[0]), float(destination[1]))

    path_acled = [
        e for e in acled_for_risk
        if _point_to_segment_distance_km((e["lat"], e["lng"]), origin_float, dest_float) < 50
    ]
    dist_km = haversine_km(*origin_float, *dest_float)
    path_clusters = [
        zd for zd in zone_data_for_risk
        if _point_to_segment_distance_km(zd["centroid"], origin_float, dest_float) < max(50, dist_km)
    ]

    primary_corridor = compute_corridor_risk(
        origin_float, dest_float, path_acled, path_clusters
    )
    # Do not recommend direct route when high/critical risk or multiple incidents on/near path
    primary_not_recommended = (
        primary_corridor["risk_level"] in ("high", "critical")
        or len(path_acled) >= 2
    )
    if primary_not_recommended:
        primary_advisory = (
            "We suggest aid does not use this corridor due to multiple reported incidents along the road."
            + (f" Reported hazards: {', '.join(primary_corridor['hazards'])}." if primary_corridor["hazards"] else "")
        )
    else:
        primary_advisory = (
            f"Risk: {primary_corridor['risk_level']}. "
            + (f"Hazards: {', '.join(primary_corridor['hazards'])}." if primary_corridor["hazards"] else "No hazards on path.")
        )
    primary_route = {
        "type": "primary",
        "summary": "Direct route",
        "waypoints_or_corridor": [list(origin_float), list(dest_float)],
        "risk_level": primary_corridor["risk_level"],
        "advisory": primary_advisory.strip(),
        "distance_km": primary_corridor["distance_km"],
        "recommended": not primary_not_recommended,
    }

    suggested_routes = [primary_route]
    alternative_route = None

    nearest_event, nearest_dist = _nearest_event_to_segment(
        events, origin_float, dest_float
    )
    if nearest_event is not None and nearest_dist < 10.0 and primary_corridor["risk_level"] in ("high", "critical"):
        waypoint = _offset_waypoint(
            origin_float, dest_float,
            float(nearest_event.get("lat", 0)), float(nearest_event.get("lng", 0)),
            offset_km=15.0,
        )
        leg1 = compute_corridor_risk(
            origin_float, waypoint,
            [e for e in acled_for_risk if _point_to_segment_distance_km((e["lat"], e["lng"]), origin_float, waypoint) < 50],
            [zd for zd in zone_data_for_risk if _point_to_segment_distance_km(zd["centroid"], origin_float, waypoint) < 50],
        )
        leg2 = compute_corridor_risk(
            waypoint, dest_float,
            [e for e in acled_for_risk if _point_to_segment_distance_km((e["lat"], e["lng"]), waypoint, dest_float) < 50],
            [zd for zd in zone_data_for_risk if _point_to_segment_distance_km(zd["centroid"], waypoint, dest_float) < 50],
        )
        alt_risk = "critical" if leg1["risk_level"] == "critical" or leg2["risk_level"] == "critical" else (
            "high" if leg1["risk_level"] == "high" or leg2["risk_level"] == "high" else (
                "moderate" if leg1["risk_level"] == "moderate" or leg2["risk_level"] == "moderate" else "low"
            )
        )
        alternative_route = {
            "type": "alternative",
            "summary": "Detour around recent incident area",
            "waypoints_or_corridor": [list(origin_float), list(waypoint), list(dest_float)],
            "risk_level": alt_risk,
            "advisory": "We suggest using this detour to avoid the affected corridor; verify local conditions before travel.",
            "distance_km": round(leg1["distance_km"] + leg2["distance_km"], 1),
            "recommended": True,
        }
        suggested_routes.append(alternative_route)

    narrative = None
    settings = get_settings()
    if settings.anthropic_api_key and (recent_events_nearby or alternative_route):
        prompt = """You are a humanitarian routing advisor. In 1-2 short sentences, give a suggestion only:
- Mention which recent events affect the area (if any).
- Suggest that aid avoid the direct route when there are multiple incidents; recommend the alternative when available.
Use phrases like "we suggest avoiding" or "we do not recommend sending aid through". Be specific but clearly only suggesting."""
        if recent_events_nearby:
            prompt += "\n\nRecent events near the path:\n"
            for e in recent_events_nearby[:5]:
                prompt += f"- {e.get('headline', '')} ({e.get('severity', '')}) at {e.get('lat')}, {e.get('lng')}\n"
        prompt += f"\nPrimary route risk: {primary_route['risk_level']}. recommended={primary_route['recommended']}."
        if alternative_route:
            prompt += f" Alternative route risk: {alternative_route['risk_level']} (suggested when direct is not recommended)."
        try:
            llm = AnthropicProvider(api_key=settings.anthropic_api_key, model=settings.llm_model)
            result = await llm.generate(prompt)
            if result.status == "ok" and result.text:
                narrative = result.text.strip()
        except Exception as exc:
            logger.warning("Narrative generation failed: %s", exc)

    return {
        "recent_events_nearby": recent_events_nearby,
        "suggested_routes": suggested_routes,
        "narrative": narrative,
    }
