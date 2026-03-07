from tribble.ingest.seed import generate_dummy_reports


def test_generates_correct_count():
    reports = generate_dummy_reports(count=10)
    assert len(reports) == 10
    for report in reports:
        assert report.latitude != 0
        assert len(report.narrative) > 20
        assert len(report.crisis_categories) > 0
