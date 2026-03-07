"""Tests for geo helpers."""

import pytest

from tribble.utils.geo import bbox_centred_on_point, haversine_km


def test_bbox_centred_on_point():
    b = bbox_centred_on_point(13.63, 25.35, 5.0)
    assert len(b) == 4
    assert b[0] < b[2]
    assert b[1] < b[3]
    # Centre should be roughly 13.63, 25.35
    mid_lat = (b[1] + b[3]) / 2
    mid_lon = (b[0] + b[2]) / 2
    assert abs(mid_lat - 13.63) < 0.01
    assert abs(mid_lon - 25.35) < 0.01
    # ~5km each side -> ~0.045 deg
    assert 0.02 < (b[2] - b[0]) < 0.06
    assert 0.02 < (b[3] - b[1]) < 0.06


def test_bbox_centred_on_point_small_km():
    b = bbox_centred_on_point(0.0, 0.0, 1.0)
    assert b[0] < b[2]
    assert b[1] < b[3]
    half = (1.0 / 2.0) / 111.32
    assert abs((b[2] - b[0]) / 2 - half) < 1e-6


def test_haversine_km_same_point():
    assert haversine_km(13.63, 25.35, 13.63, 25.35) == 0.0
