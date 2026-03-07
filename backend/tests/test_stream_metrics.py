from tribble.services.stream_metrics import compute_stream_health, compute_stream_stats


def test_stream_health_reports_queue_depth_and_lag():
    h = compute_stream_health(
        queue_depth=25,
        ingress_per_min=60.0,
        processed_per_min=55.0,
        oldest_pending_age_s=42,
    )
    assert h["queue_depth"] == 25
    assert "backpressure" in h


def test_stream_stats_include_outcome_histogram():
    stats = compute_stream_stats(
        jobs=[
            {"status": "completed", "created_at": "2026-03-07T12:00:00Z", "started_at": "2026-03-07T12:00:05Z", "completed_at": "2026-03-07T12:00:10Z"},
            {"status": "failed", "created_at": "2026-03-07T12:00:00Z", "started_at": "2026-03-07T12:00:06Z", "completed_at": "2026-03-07T12:00:11Z"},
            {"status": "pending", "created_at": "2026-03-07T12:00:00Z", "started_at": None, "completed_at": None},
        ],
        window_minutes=10,
    )
    assert set(stats["outcome_histogram"].keys()) == {"published", "rejected", "error"}
