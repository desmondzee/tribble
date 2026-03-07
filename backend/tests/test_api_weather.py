"""Tests for weather API: GET /api/weather/at-point."""

from unittest.mock import AsyncMock

import pytest
from fastapi.testclient import TestClient

from tribble.main import app

client = TestClient(app)


@pytest.fixture
def mock_current_weather():
    """High precipitation so flood_risk > 0.5 and validity_hint mentions flood/displacement."""
    return {
        "temperature_c": 22.0,
        "humidity_pct": 65.0,
        "wind_speed_ms": 3.0,
        "condition": "Rain",
        "precipitation_mm": 40.0,
    }


def test_weather_at_point_requires_lat_lon():
    r = client.get("/api/weather/at-point")
    assert r.status_code == 422
    r = client.get("/api/weather/at-point?lat=13")
    assert r.status_code == 422
    r = client.get("/api/weather/at-point?lon=25")
    assert r.status_code == 422


def test_weather_at_point_returns_shape_and_validity_hint(monkeypatch, mock_current_weather):
    async def fake_fetch(lat, lon):
        return mock_current_weather

    monkeypatch.setattr(
        "tribble.api.weather.fetch_current_weather",
        fake_fetch,
    )
    r = client.get("/api/weather/at-point?lat=13.63&lon=25.35")
    assert r.status_code == 200
    data = r.json()
    assert data["temperature_c"] == 22.0
    assert data["humidity_pct"] == 65.0
    assert data["condition"] == "Rain"
    assert data["precipitation_mm"] == 40.0
    assert "risks" in data
    assert "flood_risk" in data["risks"]
    assert "storm_risk" in data["risks"]
    assert "heat_risk" in data["risks"]
    assert "route_disruption_risk" in data["risks"]
    assert "validity_hint" in data
    assert len(data["validity_hint"]) > 0
    # High precip -> flood risk -> hint should mention flood or displacement
    assert "flood" in data["validity_hint"].lower() or "displacement" in data["validity_hint"].lower()


def test_weather_at_point_502_when_fetch_fails(monkeypatch):
    async def fake_fail(lat, lon):
        raise Exception("network error")

    monkeypatch.setattr(
        "tribble.api.weather.fetch_current_weather",
        fake_fail,
    )
    r = client.get("/api/weather/at-point?lat=13.63&lon=25.35")
    assert r.status_code == 502


def test_weather_at_point_404_when_no_data(monkeypatch):
    async def fake_none(lat, lon):
        return None

    monkeypatch.setattr(
        "tribble.api.weather.fetch_current_weather",
        fake_none,
    )
    r = client.get("/api/weather/at-point?lat=13.63&lon=25.35")
    assert r.status_code == 404
