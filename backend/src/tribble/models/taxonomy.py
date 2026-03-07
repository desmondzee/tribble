from enum import StrEnum

from pydantic import BaseModel


class CrisisCategory(StrEnum):
    SECURITY = "security"
    DISPLACEMENT = "displacement"
    HEALTH = "health"
    FOOD = "food"
    WATER_SANITATION = "water_sanitation"
    SHELTER = "shelter"
    INFRASTRUCTURE = "infrastructure"
    ACCESS = "access"
    COMMUNICATIONS = "communications"
    WEATHER = "weather"
    AID = "aid"
    PUBLIC_SERVICE = "public_service"


class TaxonomyTerm(BaseModel):
    id: str
    label: str
    category: CrisisCategory
    description: str
    parent_id: str | None = None
