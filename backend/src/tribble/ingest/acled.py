import logging
from datetime import datetime, timezone

import httpx

from tribble.models.report import AnonymityLevel, CrisisReport, ReportMode, SourceType

logger = logging.getLogger(__name__)

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
        raise ValueError(
            f"ACLED event {event.get('event_id_cnty', 'unknown')} has invalid/missing date: "
            f"{event.get('event_date')!r}"
        )

    try:
        lat = float(event["latitude"])
        lon = float(event["longitude"])
    except (KeyError, ValueError, TypeError):
        raise ValueError(
            f"ACLED event {event.get('event_id_cnty', 'unknown')} has invalid/missing coordinates"
        )

    return CrisisReport(
        source_type=SourceType.ACLED_HISTORICAL,
        mode=ReportMode.INCIDENT_CREATION,
        anonymity=AnonymityLevel.IDENTIFIED,
        event_timestamp=ts,
        latitude=lat,
        longitude=lon,
        narrative=f"[ACLED] {event_type}: {event.get('sub_event_type', '')}. {event.get('notes', '')}",
        language="en",
        crisis_categories=cats,
        processing_metadata={
            "acled_event_id": event.get("event_id_cnty"),
            "acled_event_type": event_type,
            "acled_sub_event_type": event.get("sub_event_type"),
            "acled_fatalities": fatalities,
            "acled_actors": [
                event.get("actor1"),
                event.get("actor2"),
                event.get("assoc_actor_1"),
            ],
            "acled_country_iso": event.get("iso3"),
            "acled_admin1": event.get("admin1"),
            "acled_admin2": event.get("admin2"),
            "acled_admin3": event.get("admin3"),
            "acled_location_name": event.get("location"),
            "acled_source": event.get("source"),
            "acled_geo_precision": event.get("geo_precision"),
            "acled_population": event.get("population_best"),
            "acled_civilian_targeting": event.get("civilian_targeting"),
        },
    )


class ACLEDClient:
    def __init__(self, api_key: str, email: str):
        self.api_key = api_key
        self.email = email
        self._http = httpx.AsyncClient(timeout=30.0)

    async def __aenter__(self):
        return self

    async def __aexit__(self, *_):
        await self._http.aclose()

    def _build_params(self, country: str, year: int, limit: int = 500, page: int = 1) -> dict:
        if not country or len(country) > 100:
            raise ValueError(f"Invalid country parameter: {country!r}")
        if year < 1990 or year > 2100:
            raise ValueError(f"Year out of range: {year}")
        if limit < 1 or limit > 5000:
            raise ValueError(f"Limit out of range: {limit}")
        return {
            "key": self.api_key,
            "email": self.email,
            "country": country,
            "year": str(year),
            "limit": str(limit),
            "page": str(page),
        }

    async def fetch_events(self, country: str, year: int, limit: int = 500) -> list[dict]:
        params = self._build_params(country, year, limit)
        r = await self._http.get(ACLED_BASE_URL, params=params)
        r.raise_for_status()
        body = r.json()
        if "data" not in body:
            logger.error("ACLED API response missing 'data' key, keys: %s", list(body.keys()))
            raise ValueError("Unexpected ACLED API response format")
        return body["data"]

    async def import_as_reports(
        self, country: str, year: int, limit: int = 500
    ) -> list[CrisisReport]:
        return [acled_event_to_crisis_report(e) for e in await self.fetch_events(country, year, limit)]
