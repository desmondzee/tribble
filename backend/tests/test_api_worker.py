from fastapi.testclient import TestClient

from tribble.main import app

client = TestClient(app)


def test_worker_status_endpoint_exists():
    response = client.get("/api/worker/status")
    assert response.status_code == 200
    payload = response.json()
    assert "running" in payload


def test_worker_start_and_stop(monkeypatch):
    class _FakeWorker:
        async def start(self, worker_id: str = "worker-1", poll_interval_s: float = 0.5):
            return {"running": True, "worker_id": worker_id, "poll_interval_s": poll_interval_s}

        async def stop(self):
            return {"running": False, "worker_id": "worker-1", "poll_interval_s": 0.5}

        def status(self):
            return {"running": False, "worker_id": "worker-1", "poll_interval_s": 0.5}

    monkeypatch.setattr("tribble.api.worker.get_pipeline_worker", lambda: _FakeWorker())

    start = client.post("/api/worker/start", json={"worker_id": "w1", "poll_interval_s": 0.1})
    assert start.status_code == 200
    assert start.json()["running"] is True

    stop = client.post("/api/worker/stop")
    assert stop.status_code == 200
    assert stop.json()["running"] is False
