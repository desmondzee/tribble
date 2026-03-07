from datetime import datetime

from pydantic import BaseModel, Field


class IncidentCluster(BaseModel):
    id: str | None = None
    centroid_lat: float = Field(ge=-90, le=90)
    centroid_lng: float = Field(ge=-180, le=180)
    radius_km: float = Field(gt=0)
    country: str = Field(min_length=1)
    country_iso: str = Field(min_length=3, max_length=3, pattern=r"^[A-Z]{3}$")
    admin1: str | None = None
    report_count: int = Field(ge=0)
    report_ids: list[str] = Field(default_factory=list)
    top_need_categories: list[str] = Field(default_factory=list)
    weighted_severity: float = Field(ge=0, le=1)
    weighted_confidence: float = Field(ge=0, le=1)
    access_blockers: list[str] = Field(default_factory=list)
    infrastructure_hazards: list[str] = Field(default_factory=list)
    evidence_summary: str = ""
    last_updated: datetime | None = None
