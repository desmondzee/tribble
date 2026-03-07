"""Multi-channel intake API: Discord, WhatsApp, email.

Minimal JSON payload per channel. POST to /api/intake/discord or /api/intake/whatsapp
with {"message": "...", "latitude": 4.85, "longitude": 31.6} to create a report and enqueue the pipeline.
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


class WhatsappIntakePayload(BaseModel):
    """Minimal payload for WhatsApp intake. Post from Twilio/Meta webhook or test client."""

    message: str = Field(min_length=10, max_length=5000, description="Report narrative")
    latitude: float = Field(ge=-90, le=90, description="WGS84 latitude")
    longitude: float = Field(ge=-180, le=180, description="WGS84 longitude")
    language: str = Field(default="en", min_length=2, max_length=35)
    country_iso: str | None = Field(default=None, max_length=3)


class IntakeReportResponse(BaseModel):
    report_id: str
    status: str


def _create_report_from_intake(
    source_type: SourceType,
    message: str,
    latitude: float,
    longitude: float,
    language: str = "en",
    country_iso: str | None = None,
) -> IntakeReportResponse:
    """Create report and job via RPC; return response or raise."""
    db = get_supabase()
    rpc_result = (
        db.rpc(
            "create_report_with_job",
            {
                "p_source_type": str(source_type),
                "p_mode": str(ReportMode.INCIDENT_CREATION),
                "p_anonymity": str(AnonymityLevel.ANONYMOUS),
                "p_event_timestamp": datetime.now(timezone.utc).isoformat(),
                "p_latitude": latitude,
                "p_longitude": longitude,
                "p_narrative": message,
                "p_language": language,
                "p_crisis_categories": [],
                "p_help_categories": [],
                "p_parent_report_id": None,
                "p_processing_metadata": {},
                **({"p_country_iso": country_iso.upper()} if country_iso else {}),
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


@router.post("/discord", status_code=201, response_model=IntakeReportResponse)
async def intake_discord(payload: DiscordIntakePayload):
    """Accept a crisis report from Discord (bot/webhook). Creates a report and enqueues pipeline job."""
    try:
        return _create_report_from_intake(
            SourceType.DISCORD_ANONYMOUS,
            message=payload.message,
            latitude=payload.latitude,
            longitude=payload.longitude,
            language=payload.language,
            country_iso=payload.country_iso,
        )
    except HTTPException:
        raise
    except httpx.ConnectError as exc:
        logger.error("Supabase connection failed: %s", exc)
        raise HTTPException(503, "Database unavailable")
    except Exception as exc:
        logger.exception("Unhandled error in Discord intake")
        raise HTTPException(500, "Internal server error")


@router.post("/whatsapp", status_code=201, response_model=IntakeReportResponse)
async def intake_whatsapp(payload: WhatsappIntakePayload):
    """Accept a crisis report from WhatsApp (Twilio/Meta webhook or test client). Creates a report and enqueues pipeline job."""
    try:
        return _create_report_from_intake(
            SourceType.WHATSAPP_ANONYMOUS,
            message=payload.message,
            latitude=payload.latitude,
            longitude=payload.longitude,
            language=payload.language,
            country_iso=payload.country_iso,
        )
    except HTTPException:
        raise
    except httpx.ConnectError as exc:
        logger.error("Supabase connection failed: %s", exc)
        raise HTTPException(503, "Database unavailable")
    except Exception as exc:
        logger.exception("Unhandled error in WhatsApp intake")
        raise HTTPException(500, "Internal server error")
