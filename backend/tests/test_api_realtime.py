from fastapi.testclient import TestClient

from tribble.main import app

client = TestClient(app)


def test_realtime_health_endpoint_exists():
    response = client.get("/api/realtime/health")
    assert response.status_code in (200, 503)
