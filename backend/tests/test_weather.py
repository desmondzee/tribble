"""Tests for weather module: validity_hint_from_risks, compute_weather_risks."""

import pytest

from tribble.ingest.weather import (
    WeatherConditions,
    WeatherRisks,
    compute_weather_risks,
    validity_hint_from_risks,
)


def test_validity_hint_high_flood():
    risks = WeatherRisks(flood_risk=0.8, storm_risk=0.2, heat_risk=0.0, route_disruption_risk=0.3)
    assert "flood" in validity_hint_from_risks(risks).lower()
    assert "displacement" in validity_hint_from_risks(risks).lower()


def test_validity_hint_storm():
    risks = WeatherRisks(flood_risk=0.2, storm_risk=0.7, heat_risk=0.0, route_disruption_risk=0.2)
    hint = validity_hint_from_risks(risks)
    assert "storm" in hint.lower() or "shelter" in hint.lower()


def test_validity_hint_dry_hot():
    risks = WeatherRisks(flood_risk=0.1, storm_risk=0.0, heat_risk=0.8, route_disruption_risk=0.1)
    hint = validity_hint_from_risks(risks)
    assert "water" in hint.lower() or "food" in hint.lower() or "dry" in hint.lower()


def test_validity_hint_neutral():
    risks = WeatherRisks(flood_risk=0.1, storm_risk=0.1, heat_risk=0.1, route_disruption_risk=0.1)
    hint = validity_hint_from_risks(risks)
    assert "neutral" in hint.lower() or "conflict" in hint.lower()


def test_compute_weather_risks_high_precip():
    c = WeatherConditions(25.0, 80.0, 5.0, "Rain", 50.0)
    r = compute_weather_risks(c)
    assert r.flood_risk > 0.5
    assert r.route_disruption_risk > 0


def test_compute_weather_risks_heat():
    c = WeatherConditions(40.0, 30.0, 2.0, "Clear", 0.0)
    r = compute_weather_risks(c)
    assert r.heat_risk > 0.3
