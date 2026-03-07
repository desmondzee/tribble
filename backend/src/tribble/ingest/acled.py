from datetime import datetime, timezone
from urllib.parse import urlencode

import httpx

from tribble.models.report import AnonymityLevel, CrisisReport, ReportMode, SourceType

ACLED_BASE_URL = "https://api.acleddata.com/acled/read"

EVENT_TYPE_MAP: dict[str, list[str]] = {
    "Battles": ["violence_active_threat"],
    "Explosions/Remote violence": ["violence_active_threat", "infrastructure_damage"],
    "Violence against civilians": ["violence_active_threat"],
    "Protests": ["public_service_interruption"],
    "Riots": ["violence_active_threat", "public_service_interruption"],
    "Strategic developments": ["aid_delivery_update"],
}


def acled_event_to_crisis_report(event: dict) -> CrisisReport:
    event_type = event.get("event_type", "")
    cats = list(EVENT_TYPE_MAP.get(event_type, []))
    fatalities = int(event.get("fatalities", 0) or 0)
    if fatalities > 0 and "violence_active_threat" not in cats:
        cats.append("violence_active_threat")
    try:
        ts = datetime.strptime(event["event_date"], "%Y-%m-%d").replace(tzinfo=timezone.utc)
    except (ValueError, KeyError):
        ts = datetime.now(timezone.utc)
    return CrisisReport(
        source_type=SourceType.ACLED_HISTORICAL,
        mode=ReportMode.INCIDENT_CREATION,
        anonymity=AnonymityLevel.IDENTIFIED,
        event_timestamp=ts,
        latitude=float(event.get("latitude", 0)),
        longitude=float(event.get("longitude", 0)),
        narrative=f"[ACLED] {event_type}: {event.get('sub_event_type', '')}. {event.get('notes', '')}",
        language="en",
        crisis_categories=cats,
        processing_metadata={
            "acled_event_id": event.get("event_id_cnty"),
            "acled_event_type": event_type,
            "acled_fatalities": fatalities,
            "acled_actors": [event.get("actor1"), event.get("actor2")],
            "acled_country_iso": event.get("iso3"),
        },
    )


class ACLEDClient:
    def __init__(self, api_key: str, email: str):
        self.api_key = api_key
        self.email = email
        self._http = httpx.AsyncClient(timeout=30.0)

    def _build_url(self, country: str, year: int, limit: int = 500, page: int = 1) -> str:
        return f"{ACLED_BASE_URL}?{urlencode({
            'key': self.api_key,
            'email': self.email,
            'country': country,
            'year': str(year),
            'limit': str(limit),
            'page': str(page),
        })}"

    async def fetch_events(self, country: str, year: int, limit: int = 500) -> list[dict]:
        r = await self._http.get(self._build_url(country, year, limit))
        r.raise_for_status()
        return r.json().get("data", [])

    async def import_as_reports(
        self, country: str, year: int, limit: int = 500
    ) -> list[CrisisReport]:
        return [acled_event_to_crisis_report(e) for e in await self.fetch_events(country, year, limit)]
