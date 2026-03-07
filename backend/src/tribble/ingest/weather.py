from dataclasses import dataclass

import httpx

from tribble.config import get_settings


@dataclass
class WeatherConditions:
    temperature_c: float
    humidity_pct: float
    wind_speed_ms: float
    condition: str
    precipitation_mm: float = 0.0


@dataclass
class WeatherRisks:
    flood_risk: float
    storm_risk: float
    heat_risk: float
    route_disruption_risk: float


def compute_weather_risks(c: WeatherConditions) -> WeatherRisks:
    flood = min(c.precipitation_mm / 60.0, 1.0)
    wind = min(c.wind_speed_ms / 30.0, 1.0)
    storm = min(
        wind * 0.6 + (1.0 if "thunderstorm" in c.condition.lower() else 0.0) * 0.4, 1.0
    )
    heat = (
        1.0
        if c.temperature_c >= 45
        else max((c.temperature_c - 35) / 10.0, 0.0) if c.temperature_c >= 35 else 0.0
    )
    route = min(flood * 0.5 + storm * 0.3 + heat * 0.2, 1.0)
    return WeatherRisks(round(flood, 3), round(storm, 3), round(heat, 3), round(route, 3))


async def fetch_weather(lat: float, lon: float) -> WeatherConditions:
    settings = get_settings()
    async with httpx.AsyncClient(timeout=10.0) as client:
        r = await client.get(
            "https://api.openweathermap.org/data/2.5/weather",
            params={
                "lat": lat,
                "lon": lon,
                "appid": settings.openweathermap_api_key,
                "units": "metric",
            },
        )
        r.raise_for_status()
        d = r.json()
    return WeatherConditions(
        d.get("main", {}).get("temp", 0),
        d.get("main", {}).get("humidity", 0),
        d.get("wind", {}).get("speed", 0),
        d.get("weather", [{}])[0].get("main", "Unknown"),
        d.get("rain", {}).get("1h", 0),
    )
