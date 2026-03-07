"""
Type definitions for the geolocation pipeline.

All models are Pydantic for validation and serialization.
"""

from datetime import datetime
from enum import StrEnum

from pydantic import BaseModel, Field


class GeometryType(StrEnum):
    POINT = "point"
    ADMIN_AREA = "admin-area"
    POLYGON_CENTROID = "polygon-centroid"
    UNKNOWN = "unknown"


class PrecisionLevel(StrEnum):
    EXACT = "exact"
    LOCALITY = "locality"
    DISTRICT = "district"
    PROVINCE = "province"
    COUNTRY = "country"
    UNKNOWN = "unknown"


class ExtractionMethod(StrEnum):
    GAZETTEER_MATCH = "gazetteer_match"
    GEONAMES_API = "geonames_api"
    MAPBOX_GEOCODE = "mapbox_geocode"
    MANUAL = "manual"
    FALLBACK = "fallback"


# --- Input ---


class RawReport(BaseModel):
    """Input: raw article/report for geolocation."""

    article_text: str = Field(min_length=1)
    title: str = ""
    source_url: str = ""
    source_name: str = ""
    publish_date: datetime | None = None
    source_language: str = "en"
    existing_lat: float | None = None
    existing_lng: float | None = None
    media_urls: list[str] = Field(default_factory=list)


# --- Extraction ---


class PlaceMention(BaseModel):
    """A place name extracted from text."""

    raw_text: str = Field(min_length=1)
    normalized_text: str = ""
    start_char: int = 0
    end_char: int = 0
    context_before: str = ""
    context_after: str = ""
    suggested_type: str | None = None  # e.g. city, province, landmark


# --- Resolution ---


class CandidateLocation(BaseModel):
    """A candidate geolocation for a place mention."""

    name: str = ""
    latitude: float = Field(ge=-90, le=90)
    longitude: float = Field(ge=-180, le=180)
    admin0: str = ""
    admin1: str = ""
    admin2: str = ""
    gazetteer_source: str = ""
    gazetteer_id: str = ""
    population: int | None = None
    feature_class: str | None = None
    geometry_type: GeometryType = GeometryType.POINT
    precision_level: PrecisionLevel = PrecisionLevel.UNKNOWN
    score: float | None = None  # disambiguation score 0-1, set by scoring module


# --- Output ---


class ResolvedEvent(BaseModel):
    """Final resolved event/location for frontend."""

    id: str = ""
    raw_place_text: str = ""
    normalized_place_text: str = ""
    latitude: float = Field(ge=-90, le=90)
    longitude: float = Field(ge=-180, le=180)
    geometry_type: GeometryType = GeometryType.POINT
    admin0: str = ""
    admin1: str = ""
    admin2: str = ""
    gazetteer_source: str = ""
    source_url: str = ""
    extraction_method: ExtractionMethod = ExtractionMethod.GAZETTEER_MATCH
    candidate_count: int = 0
    confidence_score: float = Field(ge=0, le=1)
    precision_level: PrecisionLevel = PrecisionLevel.UNKNOWN
    evidence_summary: str = ""
    needs_human_review: bool = False
    alternatives: list[dict] = Field(default_factory=list)
