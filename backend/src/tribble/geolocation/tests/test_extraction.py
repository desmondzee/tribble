"""Tests for place extraction from text."""

import pytest

from tribble.geolocation.extraction import extract_place_mentions
from tribble.geolocation.types import RawReport


def _report(text: str) -> RawReport:
    return RawReport(article_text=text)


def test_extract_simple_city() -> None:
    text = "Fighting broke out in Aleppo yesterday."
    mentions = extract_place_mentions(_report(text))
    assert len(mentions) >= 1
    assert any("Aleppo" in m.raw_text for m in mentions)


def test_extract_admin_level() -> None:
    text = "The incident occurred in Aleppo province."
    mentions = extract_place_mentions(_report(text))
    assert len(mentions) >= 1
    assert any("Aleppo" in m.raw_text for m in mentions)


def test_extract_near_phrasing() -> None:
    text = "Shelling was reported near Mariupol."
    mentions = extract_place_mentions(_report(text))
    assert len(mentions) >= 1
    assert any("Mariupol" in m.raw_text for m in mentions)
    # Context should capture "near" for downstream scoring
    mariupol = next(m for m in mentions if "Mariupol" in m.raw_text)
    assert "near" in mariupol.context_before.lower() or "near" in mariupol.context_after.lower()


def test_extract_same_name_different_countries() -> None:
    text = "Springfield, Illinois and Springfield, Massachusetts both reported incidents."
    mentions = extract_place_mentions(_report(text))
    # Dedup by (text, position) keeps both Springfields with admin context
    springfields = [m for m in mentions if "Springfield" in m.raw_text]
    admin_places = [m for m in mentions if m.raw_text in ("Illinois", "Massachusetts")]
    assert len(springfields) >= 2
    assert len(admin_places) >= 2


def test_extract_transliterated_name() -> None:
    text = "The attack happened in Kharkiv (also spelled Kharkov)."
    mentions = extract_place_mentions(_report(text))
    assert len(mentions) >= 1
    texts = [m.raw_text for m in mentions]
    assert any("Kharkiv" in t or "Kharkov" in t for t in texts)


def test_extract_no_capitalized_places() -> None:
    text = "the quick brown fox jumps over the lazy dog."
    mentions = extract_place_mentions(_report(text))
    assert mentions == []
