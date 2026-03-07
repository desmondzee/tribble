from datetime import datetime, timezone

from tribble.models.enrichment import WeatherSnapshot, SatelliteObservation


def test_weather():
    s = WeatherSnapshot(
        location_id="loc_001",
        timestamp=datetime(2024, 6, 15, 12, 0, tzinfo=timezone.utc),
        temperature_c=42.5,
        humidity_pct=15.0,
        wind_speed_ms=8.2,
        condition="clear",
        flood_risk=0.1,
        heat_risk=0.9,
        route_disruption_risk=0.15,
    )
    assert s.heat_risk == 0.9


def test_satellite():
    o = SatelliteObservation(
        location_id="loc_001",
        scene_id="S2B_20240615",
        acquisition_date=datetime(2024, 6, 15, 8, 26, tzinfo=timezone.utc),
        cloud_cover_pct=12.5,
        change_detected=True,
        change_type="infrastructure_damage",
        change_confidence=0.72,
    )
    assert o.change_detected and o.change_type == "infrastructure_damage"
