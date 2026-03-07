from datetime import datetime
from enum import StrEnum

from pydantic import BaseModel, Field


class LocationPrecision(StrEnum):
    EXACT = "exact"
    APPROXIMATE = "approximate"
    ADMIN_CENTROID = "admin_centroid"


class Location(BaseModel):
    id: str | None = None
    name: str | None = None
    admin1: str | None = None
    admin2: str | None = None
    country: str = Field(min_length=1)
    country_iso: str = Field(min_length=3, max_length=3, pattern=r"^[A-Z]{3}$")
    latitude: float = Field(ge=-90, le=90)
    longitude: float = Field(ge=-180, le=180)
    precision: LocationPrecision = LocationPrecision.APPROXIMATE


class LocationCluster(BaseModel):
    id: str | None = None
    centroid_lat: float = Field(ge=-90, le=90)
    centroid_lng: float = Field(ge=-180, le=180)
    radius_km: float
    country: str = Field(min_length=1)
    admin1: str | None = None
    report_count: int = 0
    created_at: datetime | None = None
    updated_at: datetime | None = None
