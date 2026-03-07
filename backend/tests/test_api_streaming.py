from fastapi.testclient import TestClient

from tribble.main import app

client = TestClient(app)


def test_streaming_stats_endpoint_exists():
    response = client.get("/api/streaming/stats")
    assert response.status_code == 200
    payload = response.json()
    assert "queue_depth" in payload


def test_streaming_health_endpoint_exists():
    response = client.get("/api/streaming/health")
    assert response.status_code == 200
    payload = response.json()
    assert payload["status"] in {"ok", "degraded", "backpressured"}


def test_streaming_reseed_endpoint_exists():
    response = client.post("/api/streaming/reseed")
    assert response.status_code == 200
    assert response.json()["status"] == "ok"
