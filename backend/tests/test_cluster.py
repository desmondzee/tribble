from datetime import datetime, timezone

from tribble.models.cluster import IncidentCluster


def test_cluster():
    c = IncidentCluster(
        centroid_lat=15.5,
        centroid_lng=32.56,
        radius_km=3.2,
        country="Sudan",
        country_iso="SDN",
        report_count=7,
        top_need_categories=["violence_active_threat", "medical_need", "displacement"],
        weighted_severity=0.88,
        weighted_confidence=0.72,
        access_blockers=["route_blockage"],
        infrastructure_hazards=["hospital_damaged"],
        evidence_summary="7 reports, 3 sources, 48h.",
        last_updated=datetime(2024, 6, 16, 18, 0, tzinfo=timezone.utc),
    )
    assert c.weighted_severity > 0.5 and c.report_count == 7
