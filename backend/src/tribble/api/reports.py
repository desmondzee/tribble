import logging
from datetime import datetime, timezone
from uuid import UUID

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
    parent_report_id: UUID | None = None
    country: str | None = None
    country_iso: str | None = None


class ReportResponse(BaseModel):
    report_id: str
    status: str


class ReportValidationResponse(BaseModel):
    confidence_scores: dict
    validation_context: dict
    breakdown: dict | None = None


@router.get("/{report_id}/validation", response_model=ReportValidationResponse)
async def get_report_validation(report_id: UUID):
    """Return validation context (weather, satellite, ACLED) and confidence scores for a report.

    Returns 404 if the report has no confidence_scores yet (e.g. still queued).
    """
    db = get_supabase()
    rows = (
        db.table("confidence_scores")
        .select("publishability,urgency,access_difficulty,breakdown")
        .eq("report_id", str(report_id))
        .order("created_at", desc=True)
        .limit(1)
        .execute()
        .data
        or []
    )
    if not rows:
        raise HTTPException(404, "Validation not available for this report")
    row = rows[0]
    breakdown = row.get("breakdown") or {}
    validation_context = breakdown.get("validation_context") or {}
    return ReportValidationResponse(
        confidence_scores={
            "publishability": float(row.get("publishability", 0.0)),
            "urgency": float(row.get("urgency", 0.0)),
            "access_difficulty": float(row.get("access_difficulty", 0.0)),
        },
        validation_context=validation_context,
        breakdown=breakdown,
    )


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

        rpc_result = (
            db.rpc(
                "create_report_with_job",
                {
                    "p_source_type": str(src),
                    "p_mode": str(mode),
                    "p_anonymity": str(anon),
                    "p_event_timestamp": datetime.now(timezone.utc).isoformat(),
                    "p_latitude": sub.latitude,
                    "p_longitude": sub.longitude,
                    "p_narrative": sub.narrative,
                    "p_language": sub.language,
                    "p_crisis_categories": sub.crisis_categories,
                    "p_help_categories": sub.help_categories,
                    "p_parent_report_id": (
                        str(sub.parent_report_id) if sub.parent_report_id else None
                    ),
                    "p_processing_metadata": {},
                    **({"p_country": sub.country} if sub.country else {}),
                    **({"p_country_iso": sub.country_iso} if sub.country_iso else {}),
                },
            )
            .execute()
        )
        rows = rpc_result.data or []
        if not rows or not rows[0].get("report_id"):
            raise HTTPException(500, "Failed to create queued report")

        return ReportResponse(report_id=str(rows[0]["report_id"]), status="queued")
    except HTTPException:
        raise
    except httpx.ConnectError as exc:
        logger.error("Supabase connection failed: %s", exc)
        raise HTTPException(503, "Database unavailable")
    except Exception as exc:
        logger.exception("Unhandled error in report submission")
        raise HTTPException(500, "Internal server error")
