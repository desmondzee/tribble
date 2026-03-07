from datetime import datetime

from pydantic import BaseModel, Field


class Location(BaseModel):
    id: str | None = None
    name: str | None = None
    admin1: str | None = None
    admin2: str | None = None
    country: str
    country_iso: str = Field(max_length=3)
    latitude: float = Field(ge=-90, le=90)
    longitude: float = Field(ge=-180, le=180)
    precision: str = "approximate"


class LocationCluster(BaseModel):
    id: str | None = None
    centroid_lat: float
    centroid_lng: float
    radius_km: float
    country: str
    admin1: str | None = None
    report_count: int = 0
    created_at: datetime | None = None
    updated_at: datetime | None = None
