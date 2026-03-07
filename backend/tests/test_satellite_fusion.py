from tribble.services.satellite_fusion import fuse_satellite_weather_report_signals


def test_fusion_boosts_alert_on_satellite_and_weather_agreement():
    fused = fuse_satellite_weather_report_signals(
        satellite={"flood_score": 0.82, "quality_score": 0.88},
        weather={"flood_risk": 0.76},
        reports={"cross_source_corroboration": 0.64},
    )
    assert fused["alert_score"] > 0.75
    assert fused["stage"] in {"watch", "detect", "deliver"}
