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


def _rough_distance_km(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    """Approximate distance in km using equirectangular projection."""
    import math
    dlat = math.radians(lat2 - lat1)
    dlng = math.radians(lng2 - lng1) * math.cos(math.radians((lat1 + lat2) / 2))
    return math.sqrt(dlat * dlat + dlng * dlng) * 6371


def _fetch_event_context() -> str:
    """Fetch latest ACLED events and format as context with proximity clusters."""
    try:
        db = get_supabase()
        rows = db.rpc("get_news_events", {"p_limit": 50, "p_country_iso": None}).execute().data or []
    except Exception as exc:
        logger.warning("Failed to fetch events for HELIOS context: %s", exc)
        return "No event data available."

    if not rows:
        return "No recent events in the database."

    # Build event lines
    events = []
    for r in rows:
        meta = r.get("processing_metadata") or {}
        events.append({
            "ts": r.get("event_timestamp", "unknown"),
            "narrative": (r.get("narrative") or "").removeprefix("[ACLED] ").strip(),
            "lat": r.get("lat"),
            "lng": r.get("lng"),
            "fatalities": meta.get("acled_fatalities", 0),
            "event_type": meta.get("acled_event_type", "unknown"),
            "region": meta.get("acled_admin1", ""),
            "location": meta.get("acled_location_name", ""),
        })

    lines = []
    for e in events:
        loc = f"{e['lat']:.2f}, {e['lng']:.2f}" if e["lat"] and e["lng"] else "unknown"
        lines.append(
            f"- [{e['ts']}] {e['event_type']} at {e['location']} in {e['region']} "
            f"({loc}), {e['fatalities']} killed: {e['narrative'][:250]}"
        )

    # Rough proximity clusters: group events within ~50km
    geo_events = [e for e in events if e["lat"] and e["lng"]]
    assigned = [False] * len(geo_events)
    clusters = []
    for i, ev in enumerate(geo_events):
        if assigned[i]:
            continue
        group = [ev]
        assigned[i] = True
        for j in range(i + 1, len(geo_events)):
            if assigned[j]:
                continue
            if _rough_distance_km(ev["lat"], ev["lng"], geo_events[j]["lat"], geo_events[j]["lng"]) < 50:
                group.append(geo_events[j])
                assigned[j] = True
        if len(group) >= 2:
            clusters.append(group)

    proximity = ""
    if clusters:
        proximity = "\n\n## Proximity Clusters (events within ~50km of each other)\n"
        for idx, grp in enumerate(clusters, 1):
            types = set(e["event_type"] for e in grp)
            total_dead = sum(e["fatalities"] or 0 for e in grp)
            center_lat = sum(e["lat"] for e in grp) / len(grp)
            center_lng = sum(e["lng"] for e in grp) / len(grp)
            regions = set(e["region"] for e in grp if e["region"])
            proximity += (
                f"- **Cluster {idx}** ({', '.join(regions)}): "
                f"{len(grp)} events near {center_lat:.2f}, {center_lng:.2f} — "
                f"types: {', '.join(types)}, total fatalities: {total_dead}\n"
            )

    return f"{len(rows)} recent events in South Sudan:\n" + "\n".join(lines) + proximity


SYSTEM_PROMPT = """You are HELIOS, a humanitarian intelligence analyst for Tribble — \
a real-time operational platform monitoring South Sudan.

You have access to the latest ACLED (Armed Conflict Location & Event Data) events below. \
Each event includes coordinates (lat, lng), region, event type, fatalities, and a narrative. \
Answer the user's question based on this data. Be concise, structured, and actionable. \
Use markdown formatting (headers, bullets, bold) for readability.

## Your Capabilities
- **Situation overview**: Summarize what's happening across all events
- **Proximity analysis**: Identify clusters of events that are geographically close (within ~50km). \
Events at similar coordinates indicate hotspots. Flag areas where multiple incident types converge.
- **Action planning**: When asked, recommend a rough plan of action for humanitarian responders — \
which areas to prioritize, what resources to deploy, safe corridors to avoid, and escalation risks.
- **Pattern detection**: Spot recurring event types, escalation trends, or regional patterns.

When giving an overview or action plan, always include:
1. The top 3-5 hotspot areas with approximate coordinates
2. What's happening at each (event types, severity, fatalities)
3. Proximity of events to each other (are incidents clustered or spread?)
4. Recommended priorities for response

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
