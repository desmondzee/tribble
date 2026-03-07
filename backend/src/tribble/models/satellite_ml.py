from datetime import datetime

from pydantic import BaseModel, Field


class SceneQuality(BaseModel):
    cloud_cover_pct: float = Field(ge=0, le=100)
    scl_clear_pct: float = Field(ge=0, le=100)
    quality_score: float = Field(ge=0, le=1)
    reason_codes: list[str] = Field(default_factory=list)


class SatelliteEOFeatures(BaseModel):
    scene_id_before: str
    scene_id_after: str
    ndvi_before: float = Field(ge=-1, le=1)
    ndvi_after: float = Field(ge=-1, le=1)
    ndwi_before: float = Field(ge=-1, le=1)
    ndwi_after: float = Field(ge=-1, le=1)
    mndwi_before: float = Field(ge=-1, le=1)
    mndwi_after: float = Field(ge=-1, le=1)
    flood_score: float = Field(ge=0, le=1)
    change_score: float = Field(ge=0, le=1)
    quality_score: float = Field(ge=0, le=1)


class SatelliteMLJob(BaseModel):
    id: str | None = None
    scene_id: str
    provider: str
    status: str = "pending"
    request_payload: dict = Field(default_factory=dict)
    created_at: datetime | None = None
    completed_at: datetime | None = None


class SatelliteMLResult(BaseModel):
    id: str | None = None
    scene_id: str
    change_probability: float = Field(ge=0, le=1)
    compression_ratio: float = Field(gt=0)
    change_type: str | None = None
    quality_score: float | None = Field(default=None, ge=0, le=1)
    metadata: dict = Field(default_factory=dict)
