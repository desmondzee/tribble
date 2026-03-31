"""NGO relief runs API: submit and list relief reports for civilian visibility."""

import logging
from uuid import UUID

from fastapi import APIRouter, HTTPException, Query

from pydantic import BaseModel, Field

from tribble.db import get_supabase

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/relief", tags=["relief"])


# ------ Request/response models ------


class PointInput(BaseModel):
    lat: float = Field(..., ge=-90, le=90)
    lng: float = Field(..., ge=-180, le=180)
    name: str | None = None


class ReliefRunCreate(BaseModel):
    origin: PointInput
    destination: PointInput
    what_doing: str = Field(..., min_length=1, max_length=5000)
    what_providing: list[str] = Field(default_factory=list, max_length=30)
    cluster_id: UUID | None = None
    organisation_name: str = Field(default="Unknown", max_length=255)
    country_iso: str | None = Field(None, min_length=2, max_length=3)


class ReliefRunResponse(BaseModel):
    id: str
    status: str


class ReliefRunListItem(BaseModel):
    id: str
    origin_lat: float
    origin_lng: float
    origin_name: str | None
    destination_lat: float
    destination_lng: float
    destination_name: str | None
    what_doing: str
    what_providing: list[str]
    organisation_name: str
    cluster_id: str | None
    status: str
    created_at: str


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


@router.post("", status_code=201, response_model=ReliefRunResponse)
async def create_relief_run(body: ReliefRunCreate):
    """Create an NGO relief run. Civilians can see it on the map."""
    try:
        db = get_supabase()
    except RuntimeError:
        raise HTTPException(503, "Database unavailable")

    row = {
        "origin_lat": body.origin.lat,
        "origin_lng": body.origin.lng,
        "origin_name": body.origin.name,
        "destination_lat": body.destination.lat,
        "destination_lng": body.destination.lng,
        "destination_name": body.destination.name,
        "what_doing": body.what_doing,
        "what_providing": body.what_providing,
        "organisation_name": body.organisation_name,
        "cluster_id": str(body.cluster_id) if body.cluster_id else None,
        "country_iso": body.country_iso.upper() if body.country_iso else None,
        "status": "en_route",
    }
    try:
        result = db.table("ngo_relief_runs").insert(row).execute()
    except Exception as exc:
        logger.exception("Relief run insert failed: %s", exc)
        raise HTTPException(500, "Failed to create relief run")

    data = result.data
    if not data or not isinstance(data, list) or len(data) == 0:
        raise HTTPException(500, "Failed to create relief run")
    created = data[0]
    return ReliefRunResponse(
        id=str(created["id"]),
        status=created.get("status", "en_route"),
    )


@router.get("", response_model=dict)
async def list_relief_runs(
    cluster_id: UUID | None = Query(None),
    country_iso: str | None = Query(None),
    status: str | None = Query(None),
    bbox: str | None = Query(None),
    limit: int = Query(200, ge=1, le=500),
):
    """List relief runs as GeoJSON FeatureCollection (LineStrings) plus items for panels.
    Query by cluster_id, country_iso, status, or bbox (minLon,minLat,maxLon,maxLat).
    """
    try:
        db = get_supabase()
    except RuntimeError:
        raise HTTPException(503, "Database unavailable")

    q = db.table("ngo_relief_runs").select("*").order("created_at", desc=True).limit(limit)
    if cluster_id is not None:
        q = q.eq("cluster_id", str(cluster_id))
    if country_iso is not None:
        q = q.eq("country_iso", country_iso.upper())
    if status is not None:
        q = q.eq("status", status)

    try:
        rows = q.execute().data or []
    except Exception as exc:
        logger.exception("Relief runs query failed: %s", exc)
        raise HTTPException(503, "Database query failed")

    # Optional bbox filter: line must intersect bbox (simple midpoint or either endpoint in bbox)
    parsed_bbox = _parse_bbox(bbox)
    if parsed_bbox is not None:
        min_lon, min_lat, max_lon, max_lat = parsed_bbox
        filtered = []
        for r in rows:
            o_lng, o_lat = r.get("origin_lng"), r.get("origin_lat")
            d_lng, d_lat = r.get("destination_lng"), r.get("destination_lat")
            if o_lng is None or o_lat is None or d_lng is None or d_lat is None:
                continue
            # Include if origin or destination is inside bbox
            if (min_lon <= o_lng <= max_lon and min_lat <= o_lat <= max_lat) or (
                min_lon <= d_lng <= max_lon and min_lat <= d_lat <= max_lat
            ):
                filtered.append(r)
        rows = filtered

    features = []
    items = []
    for r in rows:
        o_lng = r.get("origin_lng")
        o_lat = r.get("origin_lat")
        d_lng = r.get("destination_lng")
        d_lat = r.get("destination_lat")
        if None in (o_lng, o_lat, d_lng, d_lat):
            continue
        run_id = str(r.get("id", ""))
        features.append(
            {
                "type": "Feature",
                "geometry": {
                    "type": "LineString",
                    "coordinates": [[float(o_lng), float(o_lat)], [float(d_lng), float(d_lat)]],
                },
                "properties": {
                    "id": run_id,
                    "type": "relief_run",
                    "what_doing": r.get("what_doing") or "",
                    "what_providing": r.get("what_providing") or [],
                    "organisation_name": r.get("organisation_name") or "Unknown",
                    "cluster_id": str(r["cluster_id"]) if r.get("cluster_id") else None,
                    "status": r.get("status") or "en_route",
                },
            }
        )
        items.append(
            ReliefRunListItem(
                id=run_id,
                origin_lat=float(o_lat),
                origin_lng=float(o_lng),
                origin_name=r.get("origin_name"),
                destination_lat=float(d_lat),
                destination_lng=float(d_lng),
                destination_name=r.get("destination_name"),
                what_doing=r.get("what_doing") or "",
                what_providing=r.get("what_providing") or [],
                organisation_name=r.get("organisation_name") or "Unknown",
                cluster_id=str(r["cluster_id"]) if r.get("cluster_id") else None,
                status=r.get("status") or "en_route",
                created_at=str(r.get("created_at", "")),
            )
        )

    return {
        "type": "FeatureCollection",
        "features": features,
        "items": [i.model_dump() for i in items],
    }
