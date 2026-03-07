def _clamp(value: float) -> float:
    return max(0.0, min(1.0, value))


def _stage_for_score(alert_score: float) -> str:
    if alert_score >= 0.8:
        return "deliver"
    if alert_score >= 0.5:
        return "detect"
    return "watch"


def fuse_satellite_weather_report_signals(
    satellite: dict | None,
    weather: dict | None,
    reports: dict | None,
) -> dict:
    sat = satellite or {}
    wx = weather or {}
    rpt = reports or {}

    flood_score = float(sat.get("flood_score", 0.0))
    quality_score = float(sat.get("quality_score", 0.0))
    weather_risk = float(wx.get("flood_risk", 0.0))
    corroboration = float(rpt.get("cross_source_corroboration", 0.0))

    # Weighted blend designed for conservative but responsive crisis escalation.
    satellite_support = _clamp((flood_score + quality_score) / 2.0)
    alert_score = _clamp((0.6 * satellite_support) + (0.25 * weather_risk) + (0.15 * corroboration))
    stage = _stage_for_score(alert_score)

    reason_codes = []
    if quality_score < 0.5:
        reason_codes.append("low_scene_quality")
    if flood_score > 0.6:
        reason_codes.append("satellite_flood_signal")
    if weather_risk > 0.6:
        reason_codes.append("weather_flood_signal")
    if corroboration > 0.5:
        reason_codes.append("cross_source_support")
    if not reason_codes:
        reason_codes.append("limited_signal")

    return {
        "alert_score": round(alert_score, 4),
        "stage": stage,
        "reason_codes": reason_codes,
    }
