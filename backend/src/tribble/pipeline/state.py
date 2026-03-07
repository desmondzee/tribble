from enum import StrEnum
from typing import TypedDict


class PipelineStatus(StrEnum):
    INGESTED = "ingested"
    PREFILTERED = "prefiltered"
    NORMALIZED = "normalized"
    TRANSLATED = "translated"
    CLASSIFIED = "classified"
    GEOCODED = "geocoded"
    DEDUPLICATED = "deduplicated"
    CORROBORATED = "corroborated"
    WEATHER_ENRICHED = "weather_enriched"
    SATELLITE_ENRICHED = "satellite_enriched"
    SCORED = "scored"
    PUBLISHED = "published"
    REJECTED = "rejected"
    ERROR = "error"


class PipelineState(TypedDict):
    report_id: str
    raw_narrative: str
    source_type: str
    latitude: float
    longitude: float
    language: str
    timestamp: str
    status: PipelineStatus
    node_trace: list[str]
    error: str | None
    normalized: dict | None
    translation: str | None
    classification: dict | None
    geocoded_location: dict | None
    duplicates_found: list[str]
    corroboration_hits: list[dict]
    weather_data: dict | None
    satellite_data: dict | None
    satellite_eo_features: dict | None
    satellite_quality: dict | None
    satellite_alert: dict | None
    satellite_scene: dict | None
    satellite_ai: dict | None
    confidence_breakdown: dict | None
    confidence_scores: dict | None
    cluster_id: str | None
    report_type: str | None
    validation_context: dict | None
    corroboration_score: float | None
    corroboration_acled_classes: list[str] | None
    llm_verification: dict | None
