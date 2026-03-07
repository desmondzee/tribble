"""
Stage 1: Location extraction from text.

Extracts place mentions (toponyms) from raw text. Keeps raw span and context.
"""

import re

from tribble.geolocation.types import PlaceMention, RawReport


def extract_place_mentions(report: RawReport) -> list[PlaceMention]:
    """
    Extract all place mentions from article text.

    Current implementation: regex-based placeholder for common patterns.
    Production: integrate mordecai3 or spaCy NER for neural extraction.

    Returns list of PlaceMention with raw_text, span, and context.
    """
    text = report.article_text
    mentions: list[PlaceMention] = []

    # Pattern: capitalized multi-word sequences (simple heuristic)
    # Matches "Khartoum", "El Fasher", "North Darfur", "Port Sudan"
    pattern = r"\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\b"
    for match in re.finditer(pattern, text):
        raw = match.group(1)
        # Filter: at least 2 chars, exclude common non-places
        if len(raw) < 2:
            continue
        skip = {"The", "This", "That", "These", "Those", "According", "However", "Fighting", "Shelling"}
        if raw in skip or raw.split()[0] in skip:
            continue

        start, end = match.span()
        context_before = text[max(0, start - 50) : start]
        context_after = text[end : min(len(text), end + 50)]

        mentions.append(
            PlaceMention(
                raw_text=raw,
                normalized_text=raw.strip(),
                start_char=start,
                end_char=end,
                context_before=context_before,
                context_after=context_after,
            )
        )

    # Deduplicate by (normalized_text, position) so same name in different contexts is kept
    seen: set[tuple[str, int]] = set()
    unique: list[PlaceMention] = []
    for m in mentions:
        key = (m.normalized_text.lower(), m.start_char)
        if key not in seen:
            seen.add(key)
            unique.append(m)

    return unique
