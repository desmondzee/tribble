import logging
from datetime import datetime, timezone

import httpx
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from tribble.db import get_supabase
from tribble.models.report import AnonymityLevel, ReportMode, SourceType

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/reports", tags=["reports"])


class ReportSubmission(BaseModel):
    latitude: float = Field(ge=-90, le=90)
    longitude: float = Field(ge=-180, le=180)
    narrative: str = Field(min_length=10, max_length=5000)
    language: str = Field(default="en", min_length=2, max_length=35)
    crisis_categories: list[str] = Field(default_factory=list, max_length=20)
    help_categories: list[str] = Field(default_factory=list, max_length=20)
    anonymous: bool = True
    parent_report_id: str | None = None


class ReportResponse(BaseModel):
    report_id: str
    status: str


@router.post("", status_code=201, response_model=ReportResponse)
async def submit_report(sub: ReportSubmission):
    try:
        db = get_supabase()

        mode = (
            ReportMode.INCIDENT_ENRICHMENT
            if sub.parent_report_id
            else ReportMode.INCIDENT_CREATION
        )
        anon = AnonymityLevel.ANONYMOUS if sub.anonymous else AnonymityLevel.IDENTIFIED
        src = SourceType.WEB_ANONYMOUS if sub.anonymous else SourceType.WEB_IDENTIFIED

        loc = (
            db.table("locations")
            .insert(
                {
                    "country": "Unknown",
                    "country_iso": "UNK",
                    "geom": f"POINT({sub.longitude} {sub.latitude})",
                }
            )
            .execute()
        )
        if not loc.data:
            raise HTTPException(500, "Failed to create location record")

        rpt = (
            db.table("reports")
            .insert(
                {
                    "source_type": src,
                    "mode": mode,
                    "anonymity": anon,
                    "event_timestamp": datetime.now(timezone.utc).isoformat(),
                    "location_id": loc.data[0]["id"],
                    "narrative": sub.narrative,
                    "language": sub.language,
                    "crisis_categories": sub.crisis_categories,
                    "help_categories": sub.help_categories,
                    "parent_report_id": sub.parent_report_id,
                    "processing_metadata": {},
                }
            )
            .execute()
        )
        if not rpt.data:
            raise HTTPException(500, "Failed to create report record")

        rid = rpt.data[0]["id"]
        db.table("pipeline_jobs").insert({"report_id": rid, "priority": 0}).execute()
        return ReportResponse(report_id=rid, status="queued")
    except HTTPException:
        raise
    except httpx.ConnectError as exc:
        logger.error("Supabase connection failed: %s", exc)
        raise HTTPException(503, "Database unavailable")
    except Exception as exc:
        logger.exception("Unhandled error in report submission")
        raise HTTPException(500, "Internal server error")
