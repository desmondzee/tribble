from tribble.models.confidence import ConfidenceScore, ConfidenceBreakdown


def test_publishability_is_bounded():
    b = ConfidenceBreakdown(
        source_prior=0.7,
        spam_score=0.05,
        duplication_score=0.0,
        completeness_score=0.8,
        geospatial_consistency=0.9,
        temporal_consistency=0.85,
        cross_source_corroboration=0.6,
        weather_plausibility=0.75,
        satellite_corroboration=0.0,
    )
    assert 0.0 <= b.compute_publishability() <= 1.0


def test_axes_are_independent():
    s = ConfidenceScore(
        report_id="r1",
        publishability=0.85,
        urgency=0.95,
        access_difficulty=0.7,
        breakdown=ConfidenceBreakdown(
            source_prior=0.8,
            spam_score=0.02,
            duplication_score=0.0,
            completeness_score=0.9,
            geospatial_consistency=0.85,
            temporal_consistency=0.9,
            cross_source_corroboration=0.7,
            weather_plausibility=0.8,
            satellite_corroboration=0.3,
        ),
    )
    assert s.urgency != s.publishability  # independent, not derived


def test_duplication_penalty():
    b = ConfidenceBreakdown(
        source_prior=0.9,
        spam_score=0.0,
        duplication_score=0.9,  # above 0.8 threshold
        completeness_score=0.9,
        geospatial_consistency=0.9,
        temporal_consistency=0.9,
        cross_source_corroboration=0.9,
        weather_plausibility=0.9,
        satellite_corroboration=0.9,
    )
    normal = ConfidenceBreakdown(**{**b.model_dump(), "duplication_score": 0.0})
    assert b.compute_publishability() < normal.compute_publishability() * 0.6
