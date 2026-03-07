import logging
from typing import Any
from uuid import UUID

from fastapi import APIRouter, HTTPException, Query

from tribble.config import get_settings
from tribble.db import get_supabase

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/clusters", tags=["clusters"])


def _parse_bbox(bbox: str | None) -> tuple[float, float, float, float] | None:
    if bbox is None:
        return None
    parts = bbox.split(",")
    if len(parts) != 4:
        raise HTTPException(422, "bbox must be minLon,minLat,maxLon,maxLat")
    try:
        min_lon, min_lat, max_lon, max_lat = (float(p.strip()) for p in parts)
    except ValueError:
        raise HTTPException(422, "bbox must contain numeric values")
    if not (-180 <= min_lon <= 180 and -180 <= max_lon <= 180):
        raise HTTPException(422, "bbox longitudes must be between -180 and 180")
    if not (-90 <= min_lat <= 90 and -90 <= max_lat <= 90):
        raise HTTPException(422, "bbox latitudes must be between -90 and 90")
    if min_lon >= max_lon or min_lat >= max_lat:
        raise HTTPException(422, "bbox min values must be less than max values")
    return min_lon, min_lat, max_lon, max_lat


@router.get("")
async def get_clusters(
    bbox: str | None = Query(None),
    min_severity: float = Query(0.0, ge=0, le=1),
    country_iso: str | None = None,
    limit: int = Query(200, ge=1, le=1000),
):
    try:
        db = get_supabase()
    except RuntimeError:
        raise HTTPException(503, "Database unavailable")

    parsed_bbox = _parse_bbox(bbox)
    rpc_params: dict[str, Any] = {
        "p_min_severity": min_severity,
        "p_country_iso": country_iso.upper() if country_iso else None,
        "p_limit": limit,
        "p_min_lon": None,
        "p_min_lat": None,
        "p_max_lon": None,
        "p_max_lat": None,
    }
    if parsed_bbox is not None:
        rpc_params["p_min_lon"] = parsed_bbox[0]
        rpc_params["p_min_lat"] = parsed_bbox[1]
        rpc_params["p_max_lon"] = parsed_bbox[2]
        rpc_params["p_max_lat"] = parsed_bbox[3]

    try:
        clusters = db.rpc("get_incident_clusters_geojson", rpc_params).execute().data or []
    except Exception as exc:
        logger.error("Cluster query failed: %s", exc)
        raise HTTPException(503, "Database query failed")

    features = []
    for cluster in clusters:
        lng = cluster.get("centroid_lng")
        lat = cluster.get("centroid_lat")
        if lng is None or lat is None:
            continue
        features.append(
            {
                "type": "Feature",
                "geometry": {
                    "type": "Point",
                    "coordinates": [lng, lat],
                },
                "properties": {
                    key: cluster.get(key)
                    for key in [
                        "id",
                        "report_count",
                        "weighted_severity",
                        "weighted_confidence",
                        "top_need_categories",
                        "access_blockers",
                        "infrastructure_hazards",
                        "evidence_summary",
                        "radius_km",
                        "country",
                        "last_updated",
                    ]
                },
            }
        )
    return {"type": "FeatureCollection", "features": features}


@router.post("/refresh")
async def refresh_clusters(
    radius_km: float | None = Query(None, ge=0.1, le=500),
    time_window_hours: int | None = Query(None, ge=1, le=8760),
):
    """Recompute incident clusters from report locations (PostGIS ST_ClusterDBSCAN)."""
    try:
        db = get_supabase()
    except RuntimeError:
        raise HTTPException(503, "Database unavailable")

    settings = get_settings()
    p_radius_km = radius_km if radius_km is not None else settings.cluster_radius_km
    p_time_window_hours = time_window_hours if time_window_hours is not None else settings.cluster_time_window_hours

    try:
        result = (
            db.rpc(
                "refresh_incident_clusters",
                {"p_radius_km": p_radius_km, "p_time_window_hours": p_time_window_hours},
            )
            .execute()
            .data
        )
    except Exception as exc:
        logger.error("Cluster refresh failed: %s", exc)
        raise HTTPException(503, "Database query failed")

    if not result or not isinstance(result, list):
        count = 0
    else:
        row = result[0] if result else {}
        count = int(row.get("clusters_updated", 0))

    return {"clusters_updated": count}


@router.get("/{cluster_id}/relief")
async def get_cluster_relief_runs(cluster_id: UUID):
    """Relief runs linked to this cluster (for cluster inspect panel)."""
    try:
        db = get_supabase()
    except RuntimeError:
        raise HTTPException(503, "Database unavailable")
    try:
        rows = (
            db.table("ngo_relief_runs")
            .select("*")
            .eq("cluster_id", str(cluster_id))
            .in_("status", ["planned", "en_route"])
            .order("created_at", desc=True)
            .limit(50)
            .execute()
            .data
            or []
        )
    except Exception as exc:
        logger.exception("Cluster relief query failed: %s", exc)
        raise HTTPException(503, "Database query failed")
    items = []
    for r in rows:
        o_lng, o_lat = r.get("origin_lng"), r.get("origin_lat")
        d_lng, d_lat = r.get("destination_lng"), r.get("destination_lat")
        if None in (o_lng, o_lat, d_lng, d_lat):
            continue
        items.append(
            {
                "id": str(r["id"]),
                "origin_lat": float(o_lat),
                "origin_lng": float(o_lng),
                "origin_name": r.get("origin_name"),
                "destination_lat": float(d_lat),
                "destination_lng": float(d_lng),
                "destination_name": r.get("destination_name"),
                "what_doing": r.get("what_doing") or "",
                "what_providing": r.get("what_providing") or [],
                "organisation_name": r.get("organisation_name") or "Unknown",
                "cluster_id": str(r["cluster_id"]) if r.get("cluster_id") else None,
                "status": r.get("status") or "en_route",
                "created_at": str(r.get("created_at", "")),
            }
        )
    return {"items": items}
