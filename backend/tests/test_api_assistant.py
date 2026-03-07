from fastapi.testclient import TestClient

from tribble.main import app

client = TestClient(app)


def test_assistant_endpoint_validates_payload():
    r = client.post("/api/assistant/query", json={})
    assert r.status_code == 422
