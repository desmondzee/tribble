from datetime import datetime

from pydantic import BaseModel, Field


class WeatherSnapshot(BaseModel):
    id: str | None = None
    location_id: str
    timestamp: datetime
    temperature_c: float | None = None
    humidity_pct: float | None = None
    wind_speed_ms: float | None = None
    condition: str | None = None
    precipitation_mm: float | None = None
    flood_risk: float = Field(default=0.0, ge=0, le=1)
    storm_risk: float = Field(default=0.0, ge=0, le=1)
    heat_risk: float = Field(default=0.0, ge=0, le=1)
    route_disruption_risk: float = Field(default=0.0, ge=0, le=1)
    raw_response: dict | None = None


class SatelliteObservation(BaseModel):
    id: str | None = None
    location_id: str
    scene_id: str
    acquisition_date: datetime
    cloud_cover_pct: float = Field(ge=0, le=100)
    resolution_m: float = 10.0
    change_detected: bool = False
    change_type: str | None = None
    change_confidence: float = Field(default=0.0, ge=0, le=1)
    tile_url: str | None = None
    metadata: dict = Field(default_factory=dict)
