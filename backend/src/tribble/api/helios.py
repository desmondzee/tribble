import logging
import re

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from tribble.config import get_settings
from tribble.db import get_supabase
from tribble.services.anthropic_provider import AnthropicProvider

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/helios", tags=["helios"])

# Default origin/destination for route suggestion when user asks for safe routes
# (North Darfur region; user can use Safe Routes page for custom coordinates)
DEFAULT_ORIGIN = (13.5, 25.2)
DEFAULT_DESTINATION = (13.8, 25.5)

ROUTING_KEYWORDS = re.compile(
    r"\b(safe\s+route|alternative\s+route|another\s+way\s+in|avoid\s+the\s+incident|"
    r"get\s+from\s+.+\s+to\s+|how\s+do\s+i\s+get\s+to|route\s+from|directions|"
    r"way\s+into|detour|bypass|recent\s+event)\b",
    re.IGNORECASE,
)


class ChatRequest(BaseModel):
    message: str = Field(..., min_length=1, max_length=2000)
    persona: str | None = Field(None, description="civilian | organization — tailors advice for individuals vs NGOs")


class SummarizeEventItem(BaseModel):
    id: str
    headline: str
    source: str
    severity: str
    lat: float | None
    lng: float | None
    event_type: str | None = None


class SummarizeRequest(BaseModel):
    message: str = Field(..., min_length=1, max_length=2000)
    events: list[SummarizeEventItem] = Field(..., max_length=200)


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


def _format_route_suggestion(data: dict) -> str:
    """Format route suggestion API response as markdown for HELIOS reply (suggestion-only)."""
    lines = ["## Safe route suggestion\n"]
    if data.get("narrative"):
        lines.append(data["narrative"].strip())
        lines.append("")
    for route in data.get("suggested_routes", []):
        if route.get("recommended") is False:
            lines.append("**Not recommended**: " + (route.get("summary") or "Direct route") + " — risk: " + route.get("risk_level", "unknown") + ".")
            lines.append("  We suggest aid does not use this corridor due to multiple incidents.")
            lines.append("  " + route.get("advisory", ""))
        else:
            label = "**Suggested route**" if route.get("type") == "alternative" else "**Primary**"
            lines.append(f"{label}: {route.get('summary', '')} — risk: {route.get('risk_level', 'unknown')}.")
            lines.append(f"  {route.get('advisory', '')}")
        if route.get("distance_km") is not None:
            lines.append(f"  Distance: ~{route['distance_km']} km.")
        lines.append("")
    events = data.get("recent_events_nearby", [])
    if events:
        lines.append("**Recent events near the path:**")
        for e in events[:5]:
            lines.append(f"- {e.get('headline', '')} ({e.get('severity', '')})")
        lines.append("")
    lines.append("*These are suggestions only; verify local conditions.*")
    lines.append("*For a custom origin/destination, use the Safe Routes page.*")
    return "\n".join(lines)


async def _try_route_suggestion() -> str | None:
    """If route suggestion API is available, return formatted suggestion; else None."""
    try:
        from tribble.api.routes import _suggest_impl
        result = await _suggest_impl(
            DEFAULT_ORIGIN,
            DEFAULT_DESTINATION,
            avoid_recent_hours=24,
            country_iso=None,
        )
        return _format_route_suggestion(result)
    except Exception as exc:
        logger.warning("Route suggestion failed: %s", exc)
        return None


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
- **Routing**: When the user asks for safe routes, alternative ways in, or how to avoid recent incidents, \
you will be given structured route suggestion data — present it clearly and recommend primary vs alternative.
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

CIVILIAN_OVERVIEW_INSTRUCTIONS = """
## Important: This user is a CIVILIAN (individual/family), not an organization or NGO.
Tailor all advice for people on the ground trying to stay safe, not for humanitarian operations.

- **Overview and action plan**: Focus on personal safety — which areas to avoid, when to shelter in place, \
when to consider leaving, how to stay informed, family safety steps, and what to do if caught near an incident. \
Do NOT recommend "priorities for response", "resources to deploy", or operational planning for NGOs.
- **Hotspots**: Explain where risks are so the user can avoid them or take precautions; frame as "avoid" or "be cautious near" rather than "priority for deployment".
- **Routing**: Safe routes are for the user's own movement; keep advice practical for individuals and families.
"""


SUMMARIZE_SYSTEM = """You are a humanitarian intelligence analyst summarizing ACLED (conflict/event) data for operators.

You are given a list of nearby events (headlines, source, severity, location). The user will ask you to summarize them or answer questions about these specific events.

Be concise and structured. Use markdown (headers, bullets, bold). Focus on:
- Main themes and event types
- Severity and hotspots
- Any patterns or escalation risks

Answer only from the provided events. If asked about something not in the list, say so.
"""


def _format_events_for_summary(events: list[SummarizeEventItem]) -> str:
    lines = []
    for e in events:
        loc = f"{e.lat:.2f}, {e.lng:.2f}" if e.lat is not None and e.lng is not None else "unknown"
        lines.append(
            f"- [{e.severity}] {e.headline} — {e.source} ({loc})"
        )
    return "\n".join(lines) if lines else "No events provided."


@router.post("/chat", response_model=ChatResponse)
async def helios_chat(req: ChatRequest):
    settings = get_settings()

    if not settings.anthropic_api_key:
        raise HTTPException(503, "HELIOS AI is not configured")

    if ROUTING_KEYWORDS.search(req.message):
        suggestion = await _try_route_suggestion()
        if suggestion:
            return ChatResponse(reply=suggestion)
        # Fall through to normal reply if route API failed

    event_context = _fetch_event_context()
    prompt = SYSTEM_PROMPT.format(events=event_context)
    if (req.persona or "").lower() == "civilian":
        prompt = prompt.rstrip() + "\n" + CIVILIAN_OVERVIEW_INSTRUCTIONS
    prompt = prompt + f"\n\n## User Question\n{req.message}"

    provider = AnthropicProvider(api_key=settings.anthropic_api_key, model=settings.llm_model)
    result = await provider.generate(prompt)

    if result.status == "disabled":
        raise HTTPException(503, "HELIOS AI is not configured")
    if result.status == "unavailable":
        logger.error("Claude failed: %s", result.error)
        raise HTTPException(502, "HELIOS AI is temporarily unavailable")

    return ChatResponse(reply=result.text)


@router.post("/summarize", response_model=ChatResponse)
async def helios_summarize(req: SummarizeRequest):
    settings = get_settings()
    if not settings.anthropic_api_key:
        raise HTTPException(503, "Events summary is not configured")

    events_block = _format_events_for_summary(req.events)
    prompt = SUMMARIZE_SYSTEM + "\n\n## Nearby events\n" + events_block + "\n\n## User question\n" + req.message

    provider = AnthropicProvider(api_key=settings.anthropic_api_key, model=settings.llm_model)
    result = await provider.generate(prompt)

    if result.status == "disabled":
        raise HTTPException(503, "Events summary is not configured")
    if result.status == "unavailable":
        logger.error("Claude summarize failed: %s", result.error)
        raise HTTPException(502, "Events summary is temporarily unavailable")

    return ChatResponse(reply=result.text)
