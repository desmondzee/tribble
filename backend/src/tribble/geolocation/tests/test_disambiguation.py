"""Tests for disambiguation scoring."""

from tribble.geolocation.scoring.disambiguation import score_candidates
from tribble.geolocation.types import CandidateLocation, PlaceMention, RawReport


def _candidate(
    lat: float,
    lng: float,
    admin0: str = "",
    admin1: str = "",
    admin2: str = "",
    name: str = "",
) -> CandidateLocation:
    return CandidateLocation(
        name=name,
        latitude=lat,
        longitude=lng,
        admin0=admin0,
        admin1=admin1,
        admin2=admin2,
        gazetteer_source="geonames",
    )


def _report(text: str = "", country_hint: str | None = None) -> RawReport:
    return RawReport(
        article_text=text or "Incident reported.",
        source_language="en",
    )


def test_returns_sorted_candidates() -> None:
    mention = PlaceMention(raw_text="Aleppo", normalized_text="Aleppo")
    candidates = [
        _candidate(36.2, 37.1, admin0="Syria", name="Aleppo"),
        _candidate(33.5, 36.3, admin0="USA", name="Aleppo"),
    ]
    report = _report("Fighting in Aleppo, Syria.")
    scored = score_candidates(mention, candidates, report)
    assert len(scored) == 2
    # Best score first
    assert scored[0].score is not None
    assert scored[0].score >= (scored[1].score or 0)


def test_preserves_candidate_fields() -> None:
    mention = PlaceMention(raw_text="Springfield")
    candidates = [
        _candidate(39.7, -89.6, admin0="USA", admin1="Illinois", name="Springfield"),
    ]
    scored = score_candidates(mention, candidates, _report())
    assert len(scored) == 1
    assert scored[0].admin0 == "USA"
    assert scored[0].admin1 == "Illinois"
    assert scored[0].latitude == 39.7


def test_empty_candidates_returns_empty() -> None:
    mention = PlaceMention(raw_text="Nowhere")
    scored = score_candidates(mention, [], _report())
    assert scored == []
