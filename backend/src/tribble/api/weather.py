from fastapi import APIRouter, HTTPException, Query

from tribble.ingest.weather import (
    WeatherConditions,
    compute_weather_risks,
    fetch_current_weather,
    fetch_historical_weather,
    validity_hint_from_risks,
)

router = APIRouter(prefix="/api/weather", tags=["weather"])


@router.get("/at-point")
async def weather_at_point(
    lat: float = Query(..., ge=-90, le=90),
    lon: float = Query(..., ge=-180, le=180),
    date: str | None = Query(None, description="YYYY-MM-DD for historical; omit for current"),
):
    """Return weather at a point plus risk scores and a validity hint for report input.

    Uses Open-Meteo: forecast API for current, archive for historical. No API key required.
    """
    if date:
        try:
            rows = await fetch_historical_weather(
                lat=lat, lon=lon, start_date=date, end_date=date
            )
        except Exception:
            raise HTTPException(502, "Weather service unavailable")
        if not rows:
            raise HTTPException(404, "No weather data for this date")
        row = rows[0]
        temp = row.get("temperature_c")
        humidity = row.get("humidity_pct")
        wind_ms = row.get("wind_speed_ms")
        precip = row.get("precipitation_mm")
        if temp is None and humidity is None and wind_ms is None:
            raise HTTPException(404, "No weather data for this date")
        condition = "Rain" if (precip is not None and float(precip) > 0) else "Clear"
        raw = {
            "temperature_c": float(temp) if temp is not None else 20.0,
            "humidity_pct": float(humidity) if humidity is not None else 50.0,
            "wind_speed_ms": float(wind_ms) if wind_ms is not None else 2.0,
            "condition": condition,
            "precipitation_mm": float(precip) if precip is not None else 0.0,
        }
    else:
        try:
            raw = await fetch_current_weather(lat, lon)
        except Exception:
            raise HTTPException(502, "Weather service unavailable")
        if not raw:
            raise HTTPException(404, "No weather data at this location")
    conditions = WeatherConditions(
        temperature_c=raw["temperature_c"],
        humidity_pct=raw["humidity_pct"],
        wind_speed_ms=raw["wind_speed_ms"],
        condition=raw["condition"],
        precipitation_mm=raw["precipitation_mm"],
    )
    risks = compute_weather_risks(conditions)
    return {
        "temperature_c": conditions.temperature_c,
        "humidity_pct": conditions.humidity_pct,
        "wind_speed_ms": conditions.wind_speed_ms,
        "condition": conditions.condition,
        "precipitation_mm": conditions.precipitation_mm,
        "risks": {
            "flood_risk": risks.flood_risk,
            "storm_risk": risks.storm_risk,
            "heat_risk": risks.heat_risk,
            "route_disruption_risk": risks.route_disruption_risk,
        },
        "validity_hint": validity_hint_from_risks(risks),
    }
