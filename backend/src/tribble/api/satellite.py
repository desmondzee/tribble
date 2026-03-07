"""Satellite scenes API: list scenes in a date range for the UI."""
from fastapi import APIRouter, Query, HTTPException

from tribble.db import get_supabase

router = APIRouter(prefix="/api/satellite", tags=["satellite"])


@router.get("/scenes")
async def list_satellite_scenes(
    date_from: str = Query(..., description="Start date YYYY-MM-DD"),
    date_to: str = Query(..., description="End date YYYY-MM-DD"),
):
    """Return satellite scenes with acquisition_date in [date_from, date_to] (inclusive)."""
    try:
        sb = get_supabase()
    except RuntimeError:
        raise HTTPException(status_code=503, detail="Database not configured")

    r = (
        sb.table("satellite_scenes")
        .select("id, scene_id, acquisition_date, cloud_cover_pct, tile_url, bbox, ndvi, ndwi, lat, lng")
        .gte("acquisition_date", f"{date_from}T00:00:00Z")
        .lte("acquisition_date", f"{date_to}T23:59:59Z")
        .order("acquisition_date")
        .execute()
    )
    scenes = r.data or []
    return {"scenes": scenes, "date_from": date_from, "date_to": date_to}
