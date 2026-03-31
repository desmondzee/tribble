"""Pydantic model for AI-derived satellite image analysis (area-level only)."""

from pydantic import BaseModel, Field


class SatelliteAIAnalysis(BaseModel):
    """Area-level analysis of satellite imagery from a vision model.

    All outputs are area-level hypotheses for corroboration only.
    Do not use for building-level or per-structure damage claims.
    """

    flood_score_ai: float = Field(ge=0, le=1, description="Area-level flood/water extent likelihood 0-1")
    infrastructure_damage_score_ai: float = Field(
        ge=0, le=1,
        description="Area-level infrastructure damage likelihood 0-1 (no building IDs)",
    )
    labels: list[str] = Field(
        default_factory=list,
        description="Optional labels e.g. flood_extent, possible_infrastructure_damage",
    )
    raw_summary: str | None = Field(default=None, description="Optional short model summary")
    model: str | None = Field(default=None, description="Model name used for analysis")

    @classmethod
    def no_signal(cls) -> "SatelliteAIAnalysis":
        """Return a zero-signal default when AI is disabled or fails."""
        return cls(
            flood_score_ai=0.0,
            infrastructure_damage_score_ai=0.0,
            labels=[],
            raw_summary=None,
            model=None,
        )

    def to_dict_for_fusion(self) -> dict:
        """Dict suitable for fusion and pipeline state."""
        return {
            "flood_score_ai": round(self.flood_score_ai, 4),
            "infrastructure_damage_score_ai": round(self.infrastructure_damage_score_ai, 4),
            "labels": list(self.labels),
        }
