from pydantic import BaseModel, Field


class ConfidenceBreakdown(BaseModel):
    source_prior: float = Field(ge=0, le=1)
    spam_score: float = Field(ge=0, le=1)
    duplication_score: float = Field(ge=0, le=1)
    completeness_score: float = Field(ge=0, le=1)
    geospatial_consistency: float = Field(ge=0, le=1)
    temporal_consistency: float = Field(ge=0, le=1)
    cross_source_corroboration: float = Field(ge=0, le=1)
    weather_plausibility: float = Field(ge=0, le=1)
    satellite_corroboration: float = Field(ge=0, le=1)

    def compute_publishability(self) -> float:
        raw = (
            0.15 * self.source_prior
            + 0.20 * (1.0 - self.spam_score)
            + 0.10 * self.completeness_score
            + 0.15 * self.geospatial_consistency
            + 0.10 * self.temporal_consistency
            + 0.15 * self.cross_source_corroboration
            + 0.05 * self.weather_plausibility
            + 0.10 * self.satellite_corroboration
        )
        if self.duplication_score > 0.8:
            raw *= 0.5
        return round(min(max(raw, 0.0), 1.0), 4)


SOURCE_PRIORS: dict[str, float] = {
    "web_identified": 0.80,
    "web_anonymous": 0.55,
    "whatsapp_identified": 0.65,
    "whatsapp_anonymous": 0.40,
    "discord_anonymous": 0.35,
    "acled_historical": 0.95,
    "satellite": 0.85,
    "weather": 0.95,
}


def compute_access_difficulty(weather_risk: float, satellite_corroboration: float) -> float:
    weather = min(max(weather_risk, 0.0), 1.0)
    satellite = min(max(satellite_corroboration, 0.0), 1.0)
    return round(min(max((0.5 * weather) + (0.5 * satellite), 0.0), 1.0), 4)


class ConfidenceScore(BaseModel):
    report_id: str
    publishability: float = Field(ge=0, le=1)
    urgency: float = Field(ge=0, le=1)
    access_difficulty: float = Field(ge=0, le=1)
    breakdown: ConfidenceBreakdown
