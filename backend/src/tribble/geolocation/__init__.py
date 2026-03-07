"""
Conflict-intelligence geolocation subsystem.

Pipeline: Ingestion → Location extraction → Candidate resolution → Disambiguation scoring → Output.
"""

from tribble.geolocation.types import (
    RawReport,
    PlaceMention,
    ResolvedEvent,
    GeometryType,
    PrecisionLevel,
    ExtractionMethod,
)
from tribble.geolocation.extraction import extract_place_mentions
from tribble.geolocation.resolution import resolve_report, run_pipeline
from tribble.geolocation.scoring import score_candidates
from tribble.geolocation.serializer import to_geojson
from tribble.geolocation.providers import get_candidates

__all__ = [
    "RawReport",
    "PlaceMention",
    "ResolvedEvent",
    "GeometryType",
    "PrecisionLevel",
    "ExtractionMethod",
    "extract_place_mentions",
    "resolve_report",
    "run_pipeline",
    "score_candidates",
    "get_candidates",
    "to_geojson",
]
