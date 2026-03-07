import logging

from fastapi import APIRouter, HTTPException, Query

from tribble.db import get_supabase

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/events", tags=["events"])


def _fatalities_to_severity(fatalities: int | None) -> str:
    if fatalities is None:
        return "low"
    if fatalities >= 10:
        return "critical"
    if fatalities >= 3:
        return "high"
    if fatalities >= 1:
        return "medium"
    return "low"


@router.get("/news")
async def get_news(
    limit: int = Query(30, ge=1, le=200),
    country_iso: str | None = None,
):
    try:
        db = get_supabase()
    except RuntimeError:
        raise HTTPException(503, "Database unavailable")

    try:
        # Use RPC to resolve coordinates from locations table in one call
        query = (
            db.rpc("get_news_events", {
                "p_limit": limit,
                "p_country_iso": country_iso.upper() if country_iso else None,
            })
        )
        rows = query.execute().data or []
    except Exception as exc:
        logger.error("News query failed (RPC): %s", exc)
        # Fallback: query without coordinates
        try:
            q = (
                db.table("reports")
                .select("id, narrative, source_type, event_timestamp, processing_metadata")
                .eq("source_type", "acled_historical")
                .order("event_timestamp", desc=True)
                .limit(limit)
            )
            if country_iso:
                q = q.eq("processing_metadata->>acled_country_iso", country_iso.upper())
            rows = q.execute().data or []
        except Exception as exc2:
            logger.error("News fallback query failed: %s", exc2)
            raise HTTPException(503, "Database query failed")

    items = []
    for row in rows:
        meta = row.get("processing_metadata") or {}

        fatalities = meta.get("acled_fatalities")
        severity = _fatalities_to_severity(fatalities)

        narrative = row.get("narrative") or ""
        headline = narrative.removeprefix("[ACLED] ").strip() or "Incident reported"

        # Coordinates from RPC (lat/lng) or fallback (none)
        lat = row.get("lat")
        lng = row.get("lng")

        items.append({
            "id": row["id"],
            "headline": headline,
            "source": meta.get("acled_source", "ACLED"),
            "severity": severity,
            "timestamp": row.get("event_timestamp"),
            "lat": float(lat) if lat is not None else None,
            "lng": float(lng) if lng is not None else None,
            "country": meta.get("acled_country_iso"),
            "event_type": meta.get("acled_event_type"),
        })

    return {"items": items}
