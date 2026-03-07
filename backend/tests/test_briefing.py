from tribble.services.briefing import generate_cluster_briefing


def test_briefing():
    briefing = generate_cluster_briefing(
        {
            "country": "Sudan",
            "admin1": "Khartoum",
            "report_count": 12,
            "weighted_severity": 0.88,
            "weighted_confidence": 0.75,
            "top_need_categories": ["violence_active_threat", "medical_need"],
            "access_blockers": ["route_blockage"],
            "infrastructure_hazards": ["hospital_damaged"],
            "evidence_summary": "12 reports, 4 sources.",
            "weather_risks": {"heat_risk": 0.7},
        }
    )
    assert "Sudan" in briefing
    assert "Khartoum" in briefing
    assert len(briefing) > 100
