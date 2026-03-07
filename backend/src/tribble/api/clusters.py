import logging
from typing import Any

from fastapi import APIRouter, HTTPException, Query

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
