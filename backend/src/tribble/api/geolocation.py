"""Geolocation API: expose geolocated events as GeoJSON for the map."""

from datetime import datetime

from fastapi import APIRouter, HTTPException, Query

from tribble.db import get_supabase
from tribble.geolocation import run_pipeline, to_geojson

router = APIRouter(prefix="/api/geolocation", tags=["geolocation"])


def _report_row_to_dict(row: dict) -> dict:
    """Convert DB report row to pipeline input format."""
    narrative = (row.get("narrative") or "").strip()
    if not narrative or len(narrative) < 10:
        return {}
    event_ts = row.get("event_timestamp") or row.get("created_at")
    metadata = row.get("processing_metadata") or {}
    if not isinstance(metadata, dict):
        metadata = {}
    pub_date = None
    if event_ts:
        try:
            pub_date = event_ts.isoformat() if hasattr(event_ts, "isoformat") else str(event_ts)
        except Exception:
            pass
    return {
        "article_text": narrative,
        "text": narrative,
        "title": "",
        "source_url": "",
        "source_name": row.get("source_type", ""),
        "publish_date": pub_date,
        "source_language": row.get("language", "en"),
        "existing_lat": metadata.get("latitude"),
        "existing_lng": metadata.get("longitude"),
        "media_urls": [],
    }


@router.get("/geojson")
async def get_geolocation_geojson(
    limit: int = Query(50, ge=1, le=200),
    report_ids: str | None = Query(None, description="Comma-separated report IDs to geolocate"),
):
    """Fetch reports, run geolocation pipeline, return GeoJSON FeatureCollection."""
    try:
        db = get_supabase()
    except Exception:
        raise HTTPException(503, "Database unavailable")

    try:
        q = (
            db.table("reports")
            .select("id,source_type,narrative,language,event_timestamp,created_at,processing_metadata")
            .order("created_at", desc=True)
            .limit(limit)
        )
        if report_ids:
            ids = [x.strip() for x in report_ids.split(",") if x.strip()]
            if ids:
                q = q.in_("id", ids)
        rows = q.execute().data or []
    except Exception:
        raise HTTPException(503, "Database unavailable")

    reports = []
    for row in rows:
        d = _report_row_to_dict(row)
        if d:
            reports.append(d)

    if not reports:
        return {"type": "FeatureCollection", "features": []}

    events = run_pipeline(reports)
    return to_geojson(events)
