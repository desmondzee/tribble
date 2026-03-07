"""Gazetteer and geocoding providers."""

from tribble.geolocation.providers.base import GazetteerProvider
from tribble.geolocation.providers.geonames import GeoNamesProvider
from tribble.geolocation.types import PlaceMention, RawReport


def get_candidates(mention: PlaceMention, report: RawReport) -> list:
    """Get candidate locations from all configured providers."""
    from tribble.geolocation.types import CandidateLocation

    provider = GeoNamesProvider()
    # Use source_language or existing coords as context; country hint from text if available
    context_country = None  # TODO: extract from report
    return provider.search(mention, context_country)
