import pytest

from tribble.pipeline.state import PipelineStatus
from tribble.services.worker import process_one_job


@pytest.mark.asyncio
async def test_process_one_job_moves_status_to_completed(monkeypatch):
    captured: dict[str, object] = {}

    async def fake_claim(worker_id: str):
        captured["worker_id"] = worker_id
        return {"id": "job-1", "report_id": "report-1"}

    async def fake_load(report_id: str):
        assert report_id == "report-1"
        return {
            "id": "report-1",
            "source_type": "web_anonymous",
            "narrative": "Bridge damaged and aid routes are blocked after flooding.",
            "language": "en",
            "latitude": 15.5,
            "longitude": 32.56,
            "event_timestamp": "2026-03-07T12:00:00Z",
        }

    class _Pipeline:
        def invoke(self, state):
            captured["state"] = state
            return {
                "status": PipelineStatus.PUBLISHED,
                "node_trace": ["prefilter", "normalize", "cluster"],
                "confidence_scores": {"publishability": 0.5, "urgency": 0.5, "access_difficulty": 0.5},
                "confidence_breakdown": {"source_prior": 0.5},
            }

    async def fake_persist(report_id: str, result: dict, started_at=None):
        captured["persist"] = (report_id, result["status"])

    async def fake_update(job_id: str, status: str, node_trace: list[str], error: str | None = None):
        captured["update"] = (job_id, status, node_trace, error)

    monkeypatch.setattr("tribble.services.worker.claim_next_job", fake_claim)
    monkeypatch.setattr("tribble.services.worker.load_report_data", fake_load)
    monkeypatch.setattr("tribble.services.worker.build_pipeline", lambda: _Pipeline())
    monkeypatch.setattr("tribble.services.worker.persist_pipeline_outputs", fake_persist)
    monkeypatch.setattr("tribble.services.worker.update_job_status", fake_update)

    result = await process_one_job(worker_id="w1")

    assert result.status in {"completed", "skipped", "failed"}
    assert result.status == "completed"
    assert captured["worker_id"] == "w1"
    assert captured["persist"] == ("report-1", PipelineStatus.PUBLISHED)
    assert captured["update"] == ("job-1", "completed", ["prefilter", "normalize", "cluster"], None)


@pytest.mark.asyncio
async def test_process_one_job_returns_skipped_when_queue_empty(monkeypatch):
    async def fake_claim(worker_id: str):
        assert worker_id == "w1"
        return None

    monkeypatch.setattr("tribble.services.worker.claim_next_job", fake_claim)
    result = await process_one_job(worker_id="w1")
    assert result.status == "skipped"
