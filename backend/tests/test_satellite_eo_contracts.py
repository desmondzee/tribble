import pytest

from tribble.models.satellite_ml import SatelliteEOFeatures, SceneQuality


def test_scene_quality_bounds():
    with pytest.raises(Exception):
        SceneQuality(cloud_cover_pct=105.0, scl_clear_pct=80.0, quality_score=0.8)


def test_eo_features_require_indices_and_scores():
    features = SatelliteEOFeatures(
        scene_id_before="S2_before",
        scene_id_after="S2_after",
        ndvi_before=0.41,
        ndvi_after=0.33,
        ndwi_before=0.10,
        ndwi_after=0.44,
        mndwi_before=0.02,
        mndwi_after=0.31,
        flood_score=0.79,
        change_score=0.66,
        quality_score=0.84,
    )
    assert features.flood_score > 0.7
