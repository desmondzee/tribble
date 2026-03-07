from pathlib import Path

from tribble.ingest.acled_csv import load_acled_csv

FIXTURE = Path(__file__).parent / "fixtures" / "acled_sample.csv"


def test_load_csv_row_count():
    rows = load_acled_csv(str(FIXTURE))
    assert len(rows) == 3


def test_load_csv_iso3_mapping():
    rows = load_acled_csv(str(FIXTURE))
    assert all(r["iso3"] == "SSD" for r in rows)


def test_load_csv_preserves_fields():
    rows = load_acled_csv(str(FIXTURE))
    first = rows[0]
    assert first["event_id_cnty"] == "SSD9871"
    assert first["country"] == "South Sudan"
    assert first["admin1"] == "Lakes"
    assert first["admin2"] == "Cueibet"
    assert first["location"] == "Abiriu"
    assert first["latitude"] == "6.9374"
    assert first["civilian_targeting"] == "Civilian targeting"


def test_load_csv_handles_bom():
    """The fixture starts with a UTF-8 BOM; verify first column parses correctly."""
    rows = load_acled_csv(str(FIXTURE))
    assert "event_id_cnty" in rows[0]


def test_crisis_report_conversion():
    """Each CSV row should convert to a valid CrisisReport via the shared function."""
    from tribble.ingest.acled import acled_event_to_crisis_report

    rows = load_acled_csv(str(FIXTURE))
    for row in rows:
        report = acled_event_to_crisis_report(row)
        assert report.source_type == "acled_historical"
        assert report.processing_metadata["acled_event_id"] == row["event_id_cnty"]
        assert report.processing_metadata["acled_country_iso"] == "SSD"
        assert report.processing_metadata["acled_admin1"] == row["admin1"]
        assert report.processing_metadata["acled_location_name"] == row["location"]
