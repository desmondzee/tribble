"""
GeoNames provider for candidate resolution.

Uses GeoNames web API (free tier). Requires GEONAMES_USERNAME env var.
Fallback: returns empty list if not configured.
"""

import os

import httpx

from tribble.geolocation.types import CandidateLocation, GeometryType, PlaceMention, PrecisionLevel
from tribble.geolocation.providers.base import GazetteerProvider


class GeoNamesProvider(GazetteerProvider):
    """GeoNames search API provider."""

    BASE_URL = "https://secure.geonames.org/searchJSON"

    def __init__(self, username: str | None = None):
        self.username = username or os.environ.get("GEONAMES_USERNAME", "")

    def search(self, mention: PlaceMention, context_country: str | None = None) -> list[CandidateLocation]:
        if not self.username:
            return []

        params: dict = {
            "q": mention.normalized_text or mention.raw_text,
            "username": self.username,
            "maxRows": 10,
            "style": "FULL",
        }
        if context_country:
            params["country"] = context_country

        try:
            with httpx.Client(timeout=10.0) as client:
                r = client.get(self.BASE_URL, params=params)
                r.raise_for_status()
                data = r.json()
        except Exception:
            return []

        candidates: list[CandidateLocation] = []
        for g in data.get("geonames", []):
            lat = g.get("lat")
            lng = g.get("lng")
            if lat is None or lng is None:
                continue
            try:
                lat_f = float(lat)
                lng_f = float(lng)
            except (TypeError, ValueError):
                continue

            admin0 = ""
            admin1 = ""
            admin2 = ""
            for k, v in (g.get("countryName") or {}, g.get("adminName1") or {}, g.get("adminName2") or {}).items():
                if v:
                    if "country" in str(k).lower():
                        admin0 = str(v)
                    elif "admin1" in str(k).lower() or "adminName1" in str(k):
                        admin1 = str(v)
                    elif "admin2" in str(k).lower() or "adminName2" in str(k):
                        admin2 = str(v)

            # GeoNames returns flat keys
            admin0 = admin0 or str(g.get("countryName", ""))
            admin1 = admin1 or str(g.get("adminName1", ""))
            admin2 = admin2 or str(g.get("adminName2", ""))

            fcl = g.get("fcl") or ""
            geom_type = GeometryType.POINT
            prec = PrecisionLevel.UNKNOWN
            if fcl == "P":  # populated place
                prec = PrecisionLevel.LOCALITY
            elif fcl == "A":  # administrative
                prec = PrecisionLevel.PROVINCE if not admin2 else PrecisionLevel.DISTRICT
            elif fcl == "L":  # area
                prec = PrecisionLevel.DISTRICT
                geom_type = GeometryType.ADMIN_AREA

            candidates.append(
                CandidateLocation(
                    name=str(g.get("name", "")),
                    latitude=lat_f,
                    longitude=lng_f,
                    admin0=admin0,
                    admin1=admin1,
                    admin2=admin2,
                    gazetteer_source="geonames",
                    gazetteer_id=str(g.get("geonameId", "")),
                    population=g.get("population"),
                    feature_class=fcl or None,
                    geometry_type=geom_type,
                    precision_level=prec,
                )
            )

        return candidates
