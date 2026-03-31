"""Satellite scenes API: list scenes in a date range for the UI."""
from datetime import datetime, timedelta

import httpx
from fastapi import APIRouter, Query, HTTPException
from fastapi.responses import Response

from tribble.db import get_supabase
from tribble.ingest.satellite import viewable_preview_url

router = APIRouter(prefix="/api/satellite", tags=["satellite"])


def _five_day_intervals(min_date: str, max_date: str) -> list[dict]:
    """Build 5-day intervals covering [min_date, max_date] from actual data."""
    start = datetime.strptime(min_date[:10], "%Y-%m-%d").date()
    end = datetime.strptime(max_date[:10], "%Y-%m-%d").date()
    intervals = []
    current = start
    while current <= end:
        interval_end = min(current + timedelta(days=4), end)
        date_from = current.strftime("%Y-%m-%d")
        date_to = interval_end.strftime("%Y-%m-%d")
        label = f"{current.strftime('%b %d')}–{interval_end.strftime('%d')}"
        intervals.append({"label": label, "date_from": date_from, "date_to": date_to})
        current = interval_end + timedelta(days=1)
    return intervals


@router.get("/scenes/intervals")
async def list_satellite_scenes_intervals():
    """Return date range and 5-day intervals derived from actual satellite_scenes data (Sentinel-2)."""
    try:
        sb = get_supabase()
    except RuntimeError:
        raise HTTPException(status_code=503, detail="Database not configured")

    r = (
        sb.table("satellite_scenes")
        .select("acquisition_date")
        .order("acquisition_date")
        .execute()
    )
    rows = r.data or []
    if not rows:
        return {"min_date": None, "max_date": None, "intervals": []}

    dates = [row["acquisition_date"] for row in rows if row.get("acquisition_date")]
    if not dates:
        return {"min_date": None, "max_date": None, "intervals": []}

    min_date = min(dates)
    max_date = max(dates)
    intervals = _five_day_intervals(min_date, max_date)
    return {"min_date": min_date[:10], "max_date": max_date[:10], "intervals": intervals}


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


@router.get("/preview")
async def get_satellite_preview(
    scene_id: str = Query(..., description="STAC item id (e.g. S2B_MSIL2A_...)"),
    collection: str = Query("sentinel-2-l2a", description="STAC collection id"),
):
    """Proxy Planetary Computer preview image so the browser can load it same-origin.

    Fetches the PNG from Planetary Computer Data API and streams it with
    appropriate headers so <img src="/api/satellite/preview?scene_id=..."> works.
    """
    url = viewable_preview_url(collection, scene_id)
    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            r = await client.get(url)
            r.raise_for_status()
            return Response(
                content=r.content,
                media_type="image/png",
                headers={
                    "Cache-Control": "public, max-age=3600",
                },
            )
    except httpx.HTTPStatusError as e:
        raise HTTPException(status_code=e.response.status_code, detail="Preview unavailable")
    except Exception:
        raise HTTPException(status_code=502, detail="Failed to fetch preview")
