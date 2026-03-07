import asyncio
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


def validity_hint_from_risks(risks: WeatherRisks) -> str:
    """Return a short validity hint for report input based on weather risks."""
    if risks.flood_risk > 0.5:
        return "High flood risk — supports flood or displacement reports"
    if risks.storm_risk > 0.5:
        return "Storm risk — supports shelter or access disruption reports"
    if risks.heat_risk > 0.5 and risks.flood_risk < 0.2:
        return "Dry, hot conditions — supports water or food scarcity reports"
    if risks.route_disruption_risk > 0.4:
        return "Route disruption risk — supports aid obstruction reports"
    return "Neutral for conflict and most other report types"


def _weather_code_to_condition(weather_code: int) -> str:
    """Map WMO weather code to simple condition string."""
    if weather_code is None:
        return "Unknown"
    code = int(weather_code)
    if code == 0:
        return "Clear"
    if 1 <= code <= 3:
        return "Partly cloudy"
    if 45 <= code <= 48:
        return "Fog"
    if 51 <= code <= 67:
        return "Rain"
    if 71 <= code <= 77:
        return "Snow"
    if 80 <= code <= 82:
        return "Rain"
    if 85 <= code <= 86:
        return "Snow"
    if 95 <= code <= 99:
        return "Thunderstorm"
    return "Clear"


async def fetch_current_weather(lat: float, lon: float) -> dict | None:
    """Fetch current conditions from Open-Meteo Forecast API (free, no key).

    Returns one row dict compatible with pipeline: temperature_c, humidity_pct,
    wind_speed_ms, condition, precipitation_mm; or None on error.
    """
    settings = get_settings()
    url = settings.open_meteo_forecast_url
    params = {
        "latitude": lat,
        "longitude": lon,
        "current": "temperature_2m,relative_humidity_2m,wind_speed_10m,weather_code,precipitation",
        "timezone": "UTC",
    }
    async with httpx.AsyncClient(timeout=10.0) as client:
        r = await client.get(url, params=params)
        r.raise_for_status()
        data = r.json()
    current = data.get("current") or {}
    temp = current.get("temperature_2m")
    humidity = current.get("relative_humidity_2m")
    wind_kmh = current.get("wind_speed_10m")
    wind_ms = (float(wind_kmh) / 3.6) if wind_kmh is not None else 0.0
    precip = current.get("precipitation")
    precip_mm = float(precip) if precip is not None else 0.0
    weather_code = current.get("weather_code")
    condition = _weather_code_to_condition(weather_code)
    if temp is None and humidity is None:
        return None
    return {
        "temperature_c": float(temp) if temp is not None else 20.0,
        "humidity_pct": float(humidity) if humidity is not None else 50.0,
        "wind_speed_ms": wind_ms,
        "condition": condition,
        "precipitation_mm": precip_mm,
    }


async def fetch_historical_weather(
    lat: float = 13.63,
    lon: float = 25.35,
    start_date: str = "2024-05-01",
    end_date: str = "2024-05-11",
) -> list[dict]:
    """Fetch historical daily weather from Open-Meteo Archive API (free, no key)."""
    settings = get_settings()
    base_url = settings.open_meteo_base_url
    params = {
        "latitude": lat,
        "longitude": lon,
        "start_date": start_date,
        "end_date": end_date,
        "daily": "temperature_2m_mean,relative_humidity_2m_mean,wind_speed_10m_max,precipitation_sum",
        "timezone": "UTC",
    }
    async with httpx.AsyncClient(timeout=15.0) as client:
        r = await client.get(base_url, params=params)
        r.raise_for_status()
        data = r.json()

    daily = data.get("daily", {})
    dates = daily.get("time", [])
    temps = daily.get("temperature_2m_mean", [])
    humidities = daily.get("relative_humidity_2m_mean", [])
    winds = daily.get("wind_speed_10m_max", [])
    precips = daily.get("precipitation_sum", [])

    rows: list[dict] = []
    for i, date in enumerate(dates):
        rows.append({
            "date": date,
            "lat": lat,
            "lng": lon,
            "temperature_c": temps[i] if i < len(temps) else None,
            "humidity_pct": humidities[i] if i < len(humidities) else None,
            "wind_speed_ms": (winds[i] / 3.6) if i < len(winds) and winds[i] is not None else None,
            "precipitation_mm": precips[i] if i < len(precips) else None,
        })
    return rows


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


def fetch_weather_for_pipeline(
    lat: float,
    lon: float,
    date_str: str | None = None,
) -> dict | None:
    """Sync helper for pipeline: fetch one day of weather for report location.

    Uses Open-Meteo Archive (no API key). Returns a dict compatible with
    enrich_weather (temperature_c, humidity_pct, wind_speed_ms, condition,
    precipitation_mm) or None on error or missing data.
    """
    from datetime import datetime, timezone

    if date_str is None:
        date_str = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    try:
        rows = asyncio.run(
            fetch_historical_weather(lat=lat, lon=lon, start_date=date_str, end_date=date_str)
        )
    except Exception:
        return None
    if not rows:
        return None
    row = rows[0]
    temp = row.get("temperature_c")
    humidity = row.get("humidity_pct")
    wind_ms = row.get("wind_speed_ms")
    precip = row.get("precipitation_mm")
    if temp is None and humidity is None and wind_ms is None:
        return None
    condition = "Rain" if (precip and float(precip) > 0) else "Clear"
    return {
        "temperature_c": float(temp) if temp is not None else 25.0,
        "humidity_pct": float(humidity) if humidity is not None else 50.0,
        "wind_speed_ms": float(wind_ms) if wind_ms is not None else 2.0,
        "condition": condition,
        "precipitation_mm": float(precip) if precip is not None else 0.0,
    }
