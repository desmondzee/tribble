from tribble.services.risk_scoring import (
    classify_baseline_vegetation,
    compute_corridor_risk,
    compute_zone_risk_profile,
    build_viewer_url,
)


def test_classify_arid():
    assert classify_baseline_vegetation(0.15) == "arid"


def test_classify_vegetated():
    assert classify_baseline_vegetation(0.4) == "vegetated"


def test_classify_boundary():
    assert classify_baseline_vegetation(0.25) == "arid"
    assert classify_baseline_vegetation(0.26) == "vegetated"


def test_zone_risk_profile_conflict_heavy():
    profile = compute_zone_risk_profile(
        acled_events=[
            {"ontology_class": "shelling", "severity": "critical"},
            {"ontology_class": "armed_conflict", "severity": "high"},
        ],
        report_type_counts={"shelling": 10, "water_need": 5, "food_need": 3},
        weather={"flood_risk": 0.2, "storm_risk": 0.1, "heat_risk": 0.6, "route_disruption_risk": 0.3},
        satellite={"ndvi": 0.18, "ndwi": -0.05, "quality_score": 0.8},
        baseline_vegetation="arid",
    )
    assert profile["conflict_risk"] > 0.5
    assert profile["water_scarcity"] > 0.0
    assert 0.0 <= profile["flood_risk"] <= 1.0


def test_zone_risk_profile_satellite_ai_boosts_infrastructure_damage():
    base = compute_zone_risk_profile(
        acled_events=[],
        report_type_counts={"water_need": 5},
        weather={"flood_risk": 0.0},
        satellite={"ndvi": 0.2, "ndwi": 0.0, "quality_score": 0.8, "change_score": 0.0},
        baseline_vegetation="arid",
        satellite_ai=None,
    )
    with_ai = compute_zone_risk_profile(
        acled_events=[],
        report_type_counts={"water_need": 5},
        weather={"flood_risk": 0.0},
        satellite={"ndvi": 0.2, "ndwi": 0.0, "quality_score": 0.8, "change_score": 0.0},
        baseline_vegetation="arid",
        satellite_ai={"infrastructure_damage_score_ai": 0.9},
    )
    assert with_ai["infrastructure_damage"] > base["infrastructure_damage"]


def test_corridor_risk_through_conflict():
    risk = compute_corridor_risk(
        from_centroid=(13.63, 25.35),
        to_centroid=(13.53, 25.24),
        intervening_acled=[
            {"lat": 13.58, "lng": 25.30, "ontology_class": "shelling", "severity": "critical"},
        ],
        intervening_clusters=[
            {"centroid": (13.59, 25.29), "risk_level": "critical"},
        ],
    )
    assert risk["risk_level"] in ("low", "moderate", "high", "critical")
    assert "shelling" in risk["hazards"]


def test_corridor_risk_clear_path():
    risk = compute_corridor_risk(
        from_centroid=(13.63, 25.35),
        to_centroid=(13.64, 25.36),
        intervening_acled=[],
        intervening_clusters=[],
    )
    assert risk["risk_level"] == "low"


def test_build_viewer_url():
    url = build_viewer_url(bbox=[25.2, 13.5, 25.5, 13.7], date="2024-05-06")
    assert "sentinel-hub" in url or "eo-browser" in url
    assert "2024-05-06" in url
