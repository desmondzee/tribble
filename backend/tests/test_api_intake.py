"""Tests for multi-channel intake API (Discord, WhatsApp)."""

from fastapi.testclient import TestClient

from tribble.main import app

client = TestClient(app)


def test_discord_intake_rejects_empty():
    """Missing or invalid payload returns 422."""
    assert client.post("/api/intake/discord", json={}).status_code == 422


def test_whatsapp_intake_rejects_empty():
    """Missing or invalid payload returns 422."""
    assert client.post("/api/intake/whatsapp", json={}).status_code == 422


def test_discord_intake_rejects_short_message():
    """Message below min length returns 422."""
    r = client.post(
        "/api/intake/discord",
        json={
            "message": "short",
            "latitude": 4.85,
            "longitude": 31.6,
        },
    )
    assert r.status_code == 422


class _FakeResponse:
    def __init__(self, data):
        self.data = data


class _FakeRpcCall:
    def __init__(self, data):
        self._data = data

    def execute(self):
        return _FakeResponse(self._data)


class _FakeDB:
    def __init__(self, captured):
        self._captured = captured

    def rpc(self, fn_name, params):
        self._captured["fn_name"] = fn_name
        self._captured["params"] = params
        return _FakeRpcCall(
            [
                {
                    "report_id": "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
                    "location_id": "22222222-2222-2222-2222-222222222222",
                    "job_id": "33333333-3333-3333-3333-333333333333",
                }
            ]
        )


def test_discord_intake_success(monkeypatch):
    """Valid Discord payload creates report with source_type=discord_anonymous."""
    captured = {}
    monkeypatch.setattr(
        "tribble.api.intake.get_supabase",
        lambda: _FakeDB(captured),
    )
    r = client.post(
        "/api/intake/discord",
        json={
            "message": "Flooding in Juba, roads impassable. Need water and shelter.",
            "latitude": 4.85,
            "longitude": 31.6,
            "country_iso": "SSD",
        },
    )
    assert r.status_code == 201
    data = r.json()
    assert data["report_id"] == "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee"
    assert data["status"] == "queued"
    assert captured["fn_name"] == "create_report_with_job"
    assert captured["params"]["p_source_type"] == "discord_anonymous"
    assert captured["params"]["p_narrative"] == "Flooding in Juba, roads impassable. Need water and shelter."
    assert captured["params"]["p_latitude"] == 4.85
    assert captured["params"]["p_longitude"] == 31.6
    assert captured["params"]["p_country_iso"] == "SSD"


def test_whatsapp_intake_rejects_short_message():
    """Message below min length returns 422."""
    r = client.post(
        "/api/intake/whatsapp",
        json={
            "message": "short",
            "latitude": 4.85,
            "longitude": 31.6,
        },
    )
    assert r.status_code == 422


def test_whatsapp_intake_success(monkeypatch):
    """Valid WhatsApp payload creates report with source_type=whatsapp_anonymous."""
    captured = {}
    monkeypatch.setattr(
        "tribble.api.intake.get_supabase",
        lambda: _FakeDB(captured),
    )
    r = client.post(
        "/api/intake/whatsapp",
        json={
            "message": "Flooding in Juba, roads impassable. Need water and shelter.",
            "latitude": 4.85,
            "longitude": 31.6,
            "country_iso": "SSD",
        },
    )
    assert r.status_code == 201
    data = r.json()
    assert data["report_id"] == "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee"
    assert data["status"] == "queued"
    assert captured["fn_name"] == "create_report_with_job"
    assert captured["params"]["p_source_type"] == "whatsapp_anonymous"
    assert captured["params"]["p_narrative"] == "Flooding in Juba, roads impassable. Need water and shelter."
    assert captured["params"]["p_latitude"] == 4.85
    assert captured["params"]["p_longitude"] == 31.6
    assert captured["params"]["p_country_iso"] == "SSD"
