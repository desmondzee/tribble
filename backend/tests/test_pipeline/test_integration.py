from types import SimpleNamespace

from fastapi.testclient import TestClient

from tribble.api.assistant import FlockProvider
from tribble.ingest.acled import acled_event_to_crisis_report
from tribble.ingest.seed import generate_dummy_reports
from tribble.pipeline.graph import build_pipeline
from tribble.pipeline.state import PipelineState, PipelineStatus
from tribble.services.satellite_fusion import fuse_satellite_weather_report_signals
from tribble.main import app

client = TestClient(app)


def _to_state(report) -> PipelineState:
    return {
        "report_id": report.id or "t",
        "raw_narrative": report.narrative,
        "source_type": str(report.source_type),
        "latitude": report.latitude,
        "longitude": report.longitude,
        "language": report.language,
        "timestamp": report.event_timestamp.isoformat(),
        "status": PipelineStatus.INGESTED,
        "node_trace": [],
        "error": None,
        "normalized": None,
        "translation": None,
        "classification": None,
        "geocoded_location": None,
        "duplicates_found": [],
        "corroboration_hits": [],
        "weather_data": None,
        "satellite_data": None,
        "satellite_eo_features": None,
        "satellite_quality": None,
        "satellite_alert": None,
        "confidence_breakdown": None,
        "confidence_scores": None,
        "cluster_id": None,
    }


def test_dummy_report_e2e():
    result = build_pipeline().invoke(_to_state(generate_dummy_reports(1)[0]))
    assert result["status"] == PipelineStatus.PUBLISHED
    assert len(result["node_trace"]) == 11


def test_acled_event_e2e():
    event = {
        "event_id_cnty": "SDN12345",
        "event_date": "2023-04-15",
        "event_type": "Battles",
        "sub_event_type": "Armed clash",
        "actor1": "SAF",
        "actor2": "RSF",
        "admin1": "Khartoum",
        "location": "Khartoum",
        "latitude": "15.5",
        "longitude": "32.56",
        "fatalities": "5",
        "notes": "Clashes near airport",
        "country": "Sudan",
        "iso3": "SDN",
    }
    result = build_pipeline().invoke(_to_state(acled_event_to_crisis_report(event)))
    assert result["status"] == PipelineStatus.PUBLISHED


def test_batch_20():
    reports = generate_dummy_reports(20)
    results = [build_pipeline().invoke(_to_state(r)) for r in reports]
    assert all(r["status"] in (PipelineStatus.PUBLISHED, PipelineStatus.REJECTED) for r in results)
    assert sum(1 for r in results if r["status"] == PipelineStatus.PUBLISHED) > 0


def test_stage2_smoke_assistant_deterministic_and_flock_fallback(monkeypatch):
    monkeypatch.setattr(
        "tribble.api.assistant.get_settings",
        lambda: SimpleNamespace(
            enable_openclaw=True,
            enable_flock=True,
            flock_api_key="demo-key",
            flock_api_base_url="https://flock.invalid/v1",
            flock_model="demo-model",
        ),
    )

    async def _failing_generate(self, prompt: str, stream: bool = False):
        raise RuntimeError("provider unavailable")

    monkeypatch.setattr(FlockProvider, "generate", _failing_generate)

    response = client.post(
        "/api/assistant/query",
        json={"prompt": "Summarize latest crisis needs"},
    )
    assert response.status_code == 200
    payload = response.json()
    assert payload["metadata"]["mode"] == "deterministic"
    assert payload["metadata"]["flock_enabled"] is True
    assert payload["metadata"]["flock_enhanced"] is False
    assert len(payload["blocks"]) >= 1


def test_stage2_smoke_satellite_fusion_path():
    fused = fuse_satellite_weather_report_signals(
        satellite={"flood_score": 0.82, "quality_score": 0.9},
        weather={"flood_risk": 0.74},
        reports={"cross_source_corroboration": 0.61},
    )
    assert fused["alert_score"] > 0.75
    assert fused["stage"] in {"watch", "detect", "deliver"}


def test_stage2_smoke_simulation_worker_and_streaming_endpoints():
    sim_status = client.get("/api/simulation/status")
    assert sim_status.status_code == 200
    assert "running" in sim_status.json()

    sim_start = client.post(
        "/api/simulation/start",
        json={"events_per_minute": 5, "source_profile": "mixed", "noise_ratio": 0.0},
    )
    assert sim_start.status_code == 200
    sim_stop = client.post("/api/simulation/stop")
    assert sim_stop.status_code == 200

    worker_status = client.get("/api/worker/status")
    assert worker_status.status_code == 200
    assert "running" in worker_status.json()

    worker_start = client.post("/api/worker/start")
    assert worker_start.status_code == 200
    worker_stop = client.post("/api/worker/stop")
    assert worker_stop.status_code == 200

    streaming_stats = client.get("/api/streaming/stats")
    assert streaming_stats.status_code == 200
    stats_payload = streaming_stats.json()
    assert "queue_depth" in stats_payload
    assert "outcome_histogram" in stats_payload

    streaming_health = client.get("/api/streaming/health")
    assert streaming_health.status_code == 200
    assert streaming_health.json()["status"] in {"ok", "degraded", "backpressured"}
