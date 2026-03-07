"""GeoJSON serializer for resolved events.

Rendering contract:
- exact/high-confidence: point marker
- district/province only: centroid + uncertainty radius or area shading
- low confidence: fuzzy marker / approximate styling
- multiple candidate locations: preserve alternatives in metadata
"""

from tribble.geolocation.types import PrecisionLevel, ResolvedEvent


def _uncertainty_radius_km(ev: ResolvedEvent) -> float | None:
    """Approximate uncertainty radius in km based on precision level."""
    match ev.precision_level:
        case PrecisionLevel.EXACT | PrecisionLevel.LOCALITY:
            return None
        case PrecisionLevel.DISTRICT:
            return 15.0
        case PrecisionLevel.PROVINCE:
            return 50.0
        case PrecisionLevel.COUNTRY:
            return 200.0
        case _:
            return None


def to_geojson(events: list[ResolvedEvent]) -> dict:
    """Convert resolved events to GeoJSON FeatureCollection."""
    features = []

    for ev in events:
        props = {
            "id": ev.id,
            "raw_place_text": ev.raw_place_text,
            "normalized_place_text": ev.normalized_place_text,
            "admin0": ev.admin0,
            "admin1": ev.admin1,
            "admin2": ev.admin2,
            "confidence_score": ev.confidence_score,
            "precision_level": ev.precision_level,
            "needs_human_review": ev.needs_human_review,
        }
        if ev.evidence_summary:
            props["evidence_summary"] = ev.evidence_summary

        radius = _uncertainty_radius_km(ev)
        if radius is not None:
            props["uncertainty_radius_km"] = radius

        geometry = {
            "type": "Point",
            "coordinates": [ev.longitude, ev.latitude],
        }

        features.append(
            {
                "type": "Feature",
                "geometry": geometry,
                "properties": props,
            }
        )

    return {
        "type": "FeatureCollection",
        "features": features,
    }
