import pytest

from tribble.models.satellite_ml import SatelliteMLResult


def test_change_probability_is_bounded():
    with pytest.raises(Exception):
        SatelliteMLResult(
            scene_id="s1",
            change_probability=1.2,
            compression_ratio=4.0,
        )
