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

    async def fetch_el_fasher_events(
        self, limit: int = 500
    ) -> list[dict]:
        """Fetch ACLED events filtered to El Fasher bbox, May 1-11 2024.

        Returns dicts shaped for the 'events' Supabase table.
        """
        raw = await self.fetch_events("Sudan", 2024, limit=limit)

        # Filter to El Fasher bbox: lat 13.3-14.0, lon 24.8-26.0
        # and date range May 1-11
        filtered = []
        for e in raw:
            try:
                lat = float(e.get("latitude", 0))
                lon = float(e.get("longitude", 0))
                date_str = e.get("event_date", "")
            except (ValueError, TypeError):
                continue

            if not (13.3 <= lat <= 14.0 and 24.8 <= lon <= 26.0):
                continue
            if not (date_str >= "2024-05-01" and date_str <= "2024-05-11"):
                continue

            event_type = e.get("event_type", "")
            fatalities = int(e.get("fatalities", 0) or 0)

            # Map ACLED event_type to ontology_class
            ontology_map = {
                "Battles": "armed_conflict",
                "Explosions/Remote violence": "shelling",
                "Violence against civilians": "armed_conflict",
                "Protests": "suspicious_activity",
                "Riots": "armed_conflict",
                "Strategic developments": "aid_obstruction",
            }
            ontology = ontology_map.get(event_type, "armed_conflict")

            # Map fatalities to severity
            if fatalities >= 10:
                severity = "critical"
            elif fatalities >= 3:
                severity = "high"
            elif fatalities >= 1:
                severity = "medium"
            else:
                severity = "low"

            filtered.append({
                "ontology_class": ontology,
                "severity": severity,
                "lat": lat,
                "lng": lon,
                "region_id": "north-darfur",
                "location_name": e.get("location", "El Fasher"),
                "timestamp": f"{date_str}T00:00:00Z",
                "description": f"[ACLED] {event_type}: {e.get('sub_event_type', '')}. {e.get('notes', '')}",
                "source_type": "acled",
                "source_label": f"ACLED {e.get('event_id_cnty', '')}",
                "confidence_score": 0.85,
                "verification_status": "verified",
                "assigned_ngo_ids": [],
                "related_event_ids": [],
            })
        return filtered

    async def import_as_reports(
        self, country: str, year: int, limit: int = 500
    ) -> list[CrisisReport]:
        return [acled_event_to_crisis_report(e) for e in await self.fetch_events(country, year, limit)]
