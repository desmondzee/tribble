from fastapi.testclient import TestClient

from tribble.main import app

client = TestClient(app)


def test_rejects_invalid():
    assert client.post("/api/reports", json={}).status_code == 422


def test_accepts_valid():
    r = client.post(
        "/api/reports",
        json={
            "latitude": 15.5,
            "longitude": 32.56,
            "narrative": "Heavy fighting near the market, several buildings damaged",
            "crisis_categories": ["violence_active_threat"],
        },
    )
    assert r.status_code in (201, 503)
