from fastapi.testclient import TestClient

from tribble.main import app

client = TestClient(app)


def test_simulation_status_endpoint_exists():
    response = client.get("/api/simulation/status")
    assert response.status_code == 200


def test_simulation_start_and_stop():
    start = client.post(
        "/api/simulation/start",
        json={"events_per_minute": 10, "source_profile": "mixed", "noise_ratio": 0.1},
    )
    assert start.status_code == 200

    stop = client.post("/api/simulation/stop")
    assert stop.status_code == 200
