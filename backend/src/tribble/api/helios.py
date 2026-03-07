import logging

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from tribble.config import get_settings
from tribble.db import get_supabase
from tribble.services.gemini_provider import GeminiProvider

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/helios", tags=["helios"])


class ChatRequest(BaseModel):
    message: str = Field(..., min_length=1, max_length=2000)


class ChatResponse(BaseModel):
    reply: str


def _fetch_event_context() -> str:
    """Fetch latest ACLED events and format as context for the LLM."""
    try:
        db = get_supabase()
        rows = db.rpc("get_news_events", {"p_limit": 50, "p_country_iso": None}).execute().data or []
    except Exception as exc:
        logger.warning("Failed to fetch events for HELIOS context: %s", exc)
        return "No event data available."

    if not rows:
        return "No recent events in the database."

    lines = []
    for r in rows:
        meta = r.get("processing_metadata") or {}
        ts = r.get("event_timestamp", "unknown date")
        narrative = (r.get("narrative") or "").removeprefix("[ACLED] ").strip()
        lat = r.get("lat")
        lng = r.get("lng")
        loc = f"{lat:.2f}, {lng:.2f}" if lat and lng else "unknown location"
        fatalities = meta.get("acled_fatalities", 0)
        event_type = meta.get("acled_event_type", "unknown")
        region = meta.get("acled_admin1", "")

        lines.append(
            f"- [{ts}] {event_type} in {region} ({loc}), "
            f"{fatalities} fatalities: {narrative[:300]}"
        )

    return f"{len(rows)} recent events in South Sudan:\n" + "\n".join(lines)


SYSTEM_PROMPT = """You are HELIOS, a humanitarian intelligence analyst for Tribble — \
a real-time operational platform monitoring South Sudan.

You have access to the latest ACLED (Armed Conflict Location & Event Data) events below. \
Answer the user's question based on this data. Be concise, structured, and actionable. \
Use markdown formatting (headers, bullets, bold) for readability.

If asked to summarize, group events by region or type. Highlight critical threats first. \
If the user asks something outside the scope of the data, say so clearly.

## Current Event Data
{events}
"""


@router.post("/chat", response_model=ChatResponse)
async def helios_chat(req: ChatRequest):
    settings = get_settings()

    if not settings.gemini_api_key:
        raise HTTPException(503, "HELIOS AI is not configured")

    event_context = _fetch_event_context()
    prompt = SYSTEM_PROMPT.format(events=event_context) + f"\n\n## User Question\n{req.message}"

    provider = GeminiProvider(api_key=settings.gemini_api_key, model=settings.gemini_model)
    result = await provider.generate(prompt)

    if result.status == "disabled":
        raise HTTPException(503, "HELIOS AI is not configured")
    if result.status == "unavailable":
        logger.error("Gemini failed: %s", result.error)
        raise HTTPException(502, "HELIOS AI is temporarily unavailable")

    return ChatResponse(reply=result.text)
