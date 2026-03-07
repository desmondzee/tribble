from datetime import datetime, timezone

from tribble.models.report import CrisisReport, ReportMode, SourceType, AnonymityLevel


def test_incident_creation():
    r = CrisisReport(
        source_type=SourceType.WEB_IDENTIFIED,
        mode=ReportMode.INCIDENT_CREATION,
        anonymity=AnonymityLevel.IDENTIFIED,
        event_timestamp=datetime(2024, 6, 15, 12, 0, tzinfo=timezone.utc),
        latitude=15.5007,
        longitude=32.5599,
        narrative="Heavy shelling near the market",
        language="ar",
        crisis_categories=["violence_active_threat", "infrastructure_damage"],
    )
    assert r.mode == ReportMode.INCIDENT_CREATION
    assert len(r.crisis_categories) == 2


def test_enrichment_links_to_parent():
    r = CrisisReport(
        source_type=SourceType.WHATSAPP_ANONYMOUS,
        mode=ReportMode.INCIDENT_ENRICHMENT,
        anonymity=AnonymityLevel.ANONYMOUS,
        event_timestamp=datetime(2024, 6, 15, 14, 0, tzinfo=timezone.utc),
        latitude=15.5007,
        longitude=32.5599,
        narrative="Market destroyed, people trapped under rubble",
        language="ar",
        crisis_categories=["infrastructure_damage"],
        parent_report_id="rpt_abc123",
    )
    assert r.parent_report_id == "rpt_abc123"
