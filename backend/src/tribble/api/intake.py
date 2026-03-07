"""Multi-channel intake API: Discord, WhatsApp, email.

Simplest integration: Discord intake with a minimal JSON payload.
POST /api/intake/discord with {"message": "...", "latitude": 4.85, "longitude": 31.6}
creates a report with source_type=discord_anonymous and enqueues the pipeline job.
"""

import logging
from datetime import datetime, timezone

import httpx
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from tribble.db import get_supabase
from tribble.models.report import AnonymityLevel, ReportMode, SourceType

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/intake", tags=["intake"])


class DiscordIntakePayload(BaseModel):
    """Minimal payload for Discord intake. Post from a bot or webhook."""

    message: str = Field(min_length=10, max_length=5000, description="Report narrative")
    latitude: float = Field(ge=-90, le=90, description="WGS84 latitude")
    longitude: float = Field(ge=-180, le=180, description="WGS84 longitude")
    language: str = Field(default="en", min_length=2, max_length=35)
    country_iso: str | None = Field(default=None, max_length=3)


class IntakeReportResponse(BaseModel):
    report_id: str
    status: str


@router.post("/discord", status_code=201, response_model=IntakeReportResponse)
async def intake_discord(payload: DiscordIntakePayload):
    """Accept a crisis report from Discord (bot/webhook). Creates a report and enqueues pipeline job."""
    try:
        db = get_supabase()
        rpc_result = (
            db.rpc(
                "create_report_with_job",
                {
                    "p_source_type": str(SourceType.DISCORD_ANONYMOUS),
                    "p_mode": str(ReportMode.INCIDENT_CREATION),
                    "p_anonymity": str(AnonymityLevel.ANONYMOUS),
                    "p_event_timestamp": datetime.now(timezone.utc).isoformat(),
                    "p_latitude": payload.latitude,
                    "p_longitude": payload.longitude,
                    "p_narrative": payload.message,
                    "p_language": payload.language,
                    "p_crisis_categories": [],
                    "p_help_categories": [],
                    "p_parent_report_id": None,
                    "p_processing_metadata": {},
                    **(
                        {"p_country_iso": payload.country_iso.upper()}
                        if payload.country_iso
                        else {}
                    ),
                },
            )
            .execute()
        )
        rows = rpc_result.data or []
        if not rows or not rows[0].get("report_id"):
            raise HTTPException(500, "Failed to create queued report")
        return IntakeReportResponse(
            report_id=str(rows[0]["report_id"]),
            status="queued",
        )
    except HTTPException:
        raise
    except httpx.ConnectError as exc:
        logger.error("Supabase connection failed: %s", exc)
        raise HTTPException(503, "Database unavailable")
    except Exception as exc:
        logger.exception("Unhandled error in Discord intake")
        raise HTTPException(500, "Internal server error")
