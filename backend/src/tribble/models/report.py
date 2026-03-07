from datetime import datetime
from enum import StrEnum

from pydantic import BaseModel, Field


class SourceType(StrEnum):
    WEB_IDENTIFIED = "web_identified"
    WEB_ANONYMOUS = "web_anonymous"
    WHATSAPP_IDENTIFIED = "whatsapp_identified"
    WHATSAPP_ANONYMOUS = "whatsapp_anonymous"
    ACLED_HISTORICAL = "acled_historical"
    SATELLITE = "satellite"
    WEATHER = "weather"


class ReportMode(StrEnum):
    INCIDENT_CREATION = "incident_creation"
    INCIDENT_ENRICHMENT = "incident_enrichment"


class AnonymityLevel(StrEnum):
    IDENTIFIED = "identified"
    PSEUDONYMOUS = "pseudonymous"
    ANONYMOUS = "anonymous"


class CrisisReport(BaseModel):
    id: str | None = None
    source_type: SourceType
    mode: ReportMode
    anonymity: AnonymityLevel
    event_timestamp: datetime
    latitude: float = Field(ge=-90, le=90)
    longitude: float = Field(ge=-180, le=180)
    narrative: str = Field(min_length=1, max_length=50_000)
    language: str = "en"
    crisis_categories: list[str] = Field(default_factory=list)
    help_categories: list[str] = Field(default_factory=list)
    media_urls: list[str] = Field(default_factory=list)
    infrastructure_refs: list[str] = Field(default_factory=list)
    parent_report_id: str | None = None
    extracted_facts: dict | None = None
    translation: str | None = None
    processing_metadata: dict = Field(default_factory=dict)
