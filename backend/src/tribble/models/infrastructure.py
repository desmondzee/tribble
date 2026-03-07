from datetime import datetime

from pydantic import BaseModel, Field


class InfrastructureObject(BaseModel):
    id: str | None = None
    name: str | None = None
    object_type: str
    latitude: float = Field(ge=-90, le=90)
    longitude: float = Field(ge=-180, le=180)
    country: str = Field(min_length=1)
    admin1: str | None = None
    status: str = "operational"
    source: str = "manual"


class DamageAssessment(BaseModel):
    id: str | None = None
    infrastructure_id: str
    assessment_date: datetime
    damage_level: str
    confidence: float = Field(ge=0, le=1)
    source: str
    evidence_ids: list[str] = Field(default_factory=list)
    notes: str | None = None
