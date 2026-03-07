from tribble.ingest.weather import compute_weather_risks, WeatherConditions


def test_flood():
    r = compute_weather_risks(WeatherConditions(25.0, 95.0, 3.0, "Rain", 50.0))
    assert r.flood_risk > 0.5


def test_heat():
    r = compute_weather_risks(WeatherConditions(48.0, 10.0, 2.0, "Clear", 0.0))
    assert r.heat_risk > 0.8 and r.flood_risk < 0.1


def test_storm():
    r = compute_weather_risks(WeatherConditions(20.0, 80.0, 25.0, "Thunderstorm", 30.0))
    assert r.storm_risk > 0.5
