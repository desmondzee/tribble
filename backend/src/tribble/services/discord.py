import logging

import httpx

from tribble.config import get_settings

logger = logging.getLogger(__name__)

SEVERITY_COLORS = {
    "critical": 0xFF0000,  # Red
    "high": 0xFF8800,      # Orange
    "medium": 0xFFCC00,    # Yellow
    "low": 0x00CC00,       # Green
}

SEVERITY_BADGES = {
    "critical": "\U0001f534 CRITICAL",
    "high": "\U0001f7e0 HIGH",
    "medium": "\U0001f7e1 MEDIUM",
    "low": "\U0001f7e2 LOW",
}


async def send_alert(event: dict) -> bool:
    """Post an event alert to the configured Discord webhook.

    Only sends for critical/high severity events.
    Returns True if sent successfully, False otherwise.
    """
    settings = get_settings()
    if not settings.discord_webhook_url:
        return False

    severity = event.get("severity", "low")
    if severity not in ("critical", "high"):
        return False

    badge = SEVERITY_BADGES.get(severity, severity)
    color = SEVERITY_COLORS.get(severity, 0x888888)
    ontology = event.get("ontology_class", "unknown")
    location = event.get("location_name", "Unknown location")
    confidence = event.get("confidence_score", 0)
    description = event.get("description", "No description")[:500]

    embed = {
        "title": f"{badge} — {ontology.replace('_', ' ').title()}",
        "description": description,
        "color": color,
        "fields": [
            {"name": "Location", "value": location, "inline": True},
            {"name": "Confidence", "value": f"{confidence:.0%}", "inline": True},
            {"name": "Severity", "value": severity.upper(), "inline": True},
        ],
        "footer": {"text": "Tribble Intelligence Platform"},
    }

    if event.get("lat") and event.get("lng"):
        embed["fields"].append({
            "name": "Coordinates",
            "value": f"{event['lat']:.4f}, {event['lng']:.4f}",
            "inline": True,
        })

    payload = {"embeds": [embed]}

    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            r = await client.post(settings.discord_webhook_url, json=payload)
            r.raise_for_status()
        return True
    except Exception as exc:
        logger.warning("Discord webhook failed: %s", exc)
        return False
