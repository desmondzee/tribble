"""Disambiguation scoring for place candidates.

Scores candidates using:
- country consistency with article context
- admin-region consistency
- mention specificity (e.g. "Aleppo province" vs "Aleppo city")
- text cues like "near", "north of", "outside", "in district of"
- gazetteer order (first results often best)
"""

import re

from tribble.geolocation.types import (
    CandidateLocation,
    PlaceMention,
    PrecisionLevel,
    RawReport,
)


def _country_in_text(admin0: str, text: str) -> bool:
    """True if candidate's country appears in article text."""
    if not admin0:
        return False
    return admin0.lower() in text.lower()


def _admin1_in_context(admin1: str, mention: PlaceMention) -> bool:
    """True if candidate's admin1 appears in mention context."""
    if not admin1:
        return False
    ctx = (mention.context_before + " " + mention.context_after).lower()
    # Normalize: "Aleppo Governorate" vs "Aleppo governorate"
    return admin1.lower() in ctx


def _has_spatial_cue(mention: PlaceMention) -> bool:
    """True if context has 'near', 'north of', 'outside', 'in district of', etc."""
    ctx = (mention.context_before + " " + mention.context_after).lower()
    cues = ["near", "north of", "south of", "east of", "west of", "outside", "in district of", "outside of"]
    return any(c in ctx for c in cues)


def _wants_admin_level(mention: PlaceMention) -> bool:
    """True if raw text suggests admin-level (province, governorate, oblast, region)."""
    raw = mention.raw_text.lower()
    return any(
        t in raw
        for t in ["province", "governorate", "oblast", "region", "district", "prefecture"]
    )


def _wants_locality(mention: PlaceMention) -> bool:
    """True if raw text suggests city/town/village."""
    raw = mention.raw_text.lower()
    return any(t in raw for t in ["city", "town", "village", "city of", "town of"])


def score_candidates(
    mention: PlaceMention,
    candidates: list[CandidateLocation],
    report: RawReport,
) -> list[CandidateLocation]:
    """Score and sort candidates by disambiguation confidence.

    Returns candidates sorted by score descending (best first).
    """
    text = report.article_text
    scored: list[CandidateLocation] = []

    for i, c in enumerate(candidates):
        c_copy = c.model_copy(deep=True)
        score = 0.5  # Base

        # Gazetteer order: first results often better
        score += 0.15 * max(0, 1 - i * 0.2)

        # Country consistency: boost if candidate's country appears in article
        if _country_in_text(c.admin0, text):
            score += 0.2

        # Admin1 consistency: boost if admin1 appears in mention context
        if _admin1_in_context(c.admin1, mention):
            score += 0.15

        # Specificity: prefer admin-level when "province"/"oblast" in mention
        if _wants_admin_level(mention):
            if c.precision_level in (PrecisionLevel.PROVINCE, PrecisionLevel.DISTRICT):
                score += 0.1
        elif _wants_locality(mention):
            if c.precision_level == PrecisionLevel.LOCALITY:
                score += 0.1

        # Spatial cue ("near X"): slightly prefer locality (more specific referent)
        if _has_spatial_cue(mention) and c.precision_level == PrecisionLevel.LOCALITY:
            score += 0.05

        c_copy.score = min(1.0, max(0.0, score))
        scored.append(c_copy)

    return sorted(scored, key=lambda x: (x.score or 0), reverse=True)
