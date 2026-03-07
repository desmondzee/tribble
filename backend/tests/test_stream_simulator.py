from tribble.services.stream_simulator import make_synthetic_submission


def test_synthetic_submission_is_valid_report_payload():
    payload = make_synthetic_submission(seed=1, source_profile="mixed")
    assert "latitude" in payload and "longitude" in payload
    assert len(payload["narrative"]) >= 10
