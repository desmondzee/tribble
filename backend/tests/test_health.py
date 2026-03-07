from fastapi.testclient import TestClient
from tribble.main import app

client = TestClient(app)


def test_health():
    r = client.get("/health")
    assert r.status_code == 200
    data = r.json()
    assert data["status"] == "ok"
    assert "db" in data
    assert data["db"] in ("ok", "unconfigured", "error")
