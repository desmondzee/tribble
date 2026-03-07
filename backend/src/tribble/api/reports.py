from datetime import datetime, timezone

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from tribble.db import get_supabase
from tribble.models.report import AnonymityLevel, ReportMode, SourceType

router = APIRouter(prefix="/api/reports", tags=["reports"])


class ReportSubmission(BaseModel):
    latitude: float = Field(ge=-90, le=90)
    longitude: float = Field(ge=-180, le=180)
    narrative: str = Field(min_length=10, max_length=5000)
    language: str = "en"
    crisis_categories: list[str] = Field(default_factory=list)
    help_categories: list[str] = Field(default_factory=list)
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

        rid = rpt.data[0]["id"]
        db.table("pipeline_jobs").insert({"report_id": rid, "priority": 0}).execute()
        return ReportResponse(report_id=rid, status="queued")
    except HTTPException:
        raise
    except Exception:
        raise HTTPException(503, "Database unavailable")
