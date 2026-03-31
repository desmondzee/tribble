from fastapi.testclient import TestClient

from tribble.main import app

client = TestClient(app)


def test_rejects_invalid():
    assert client.post("/api/reports", json={}).status_code == 422


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
                    "report_id": "11111111-1111-1111-1111-111111111111",
                    "location_id": "22222222-2222-2222-2222-222222222222",
                    "job_id": "33333333-3333-3333-3333-333333333333",
                }
            ]
        )


def test_accepts_valid(monkeypatch):
    captured = {}
    monkeypatch.setattr(
        "tribble.api.reports.get_supabase",
        lambda: _FakeDB(captured),
    )

    r = client.post(
        "/api/reports",
        json={
            "latitude": 15.5,
            "longitude": 32.56,
            "narrative": "Heavy fighting near the market, several buildings damaged",
            "crisis_categories": ["violence_active_threat"],
        },
    )
    assert r.status_code == 201
    assert r.json()["status"] == "queued"
    assert captured["fn_name"] == "create_report_with_job"
    assert captured["params"]["p_crisis_categories"] == ["violence_active_threat"]


def test_rejects_invalid_parent_report_id():
    """Invalid parent_report_id (not a UUID) must return 422, not 500."""
    r = client.post(
        "/api/reports",
        json={
            "latitude": 15.5,
            "longitude": 32.56,
            "narrative": "Heavy fighting near the market, several buildings damaged",
            "crisis_categories": ["violence_active_threat"],
            "parent_report_id": "not-a-uuid",
        },
    )
    assert r.status_code == 422


def test_passes_valid_parent_report_id_to_rpc(monkeypatch):
    """Valid parent_report_id UUID is passed through to create_report_with_job."""
    captured = {}
    monkeypatch.setattr(
        "tribble.api.reports.get_supabase",
        lambda: _FakeDB(captured),
    )
    parent_id = "a1b2c3d4-e5f6-7890-abcd-ef1234567890"
    r = client.post(
        "/api/reports",
        json={
            "latitude": 15.5,
            "longitude": 32.56,
            "narrative": "Heavy fighting near the market, several buildings damaged",
            "crisis_categories": ["violence_active_threat"],
            "parent_report_id": parent_id,
        },
    )
    assert r.status_code == 201
    assert captured["params"]["p_parent_report_id"] == parent_id


class _FakeTableSelect:
    def __init__(self, data):
        self._data = data

    def select(self, *args):
        return self

    def eq(self, col, val):
        return self

    def order(self, col, desc=True):
        return self

    def limit(self, n):
        return self

    def execute(self):
        return type("Res", (), {"data": self._data})()


def test_get_report_validation_404_when_no_scores(monkeypatch):
    """GET /api/reports/:id/validation returns 404 when no confidence_scores."""
    class FakeDB:
        def table(self, name):
            return _FakeTableSelect([])

    monkeypatch.setattr("tribble.api.reports.get_supabase", lambda: FakeDB())
    r = client.get("/api/reports/11111111-1111-1111-1111-111111111111/validation")
    assert r.status_code == 404


def test_get_report_validation_200_with_validation_context(monkeypatch):
    """GET /api/reports/:id/validation returns validation_context and scores."""
    report_id = "11111111-1111-1111-1111-111111111111"
    validation_context = {
        "weather": {"confirmed": True, "signal": "Flood risk supports displacement", "confidence": 0.7},
        "satellite": {"confirmed": False, "signal": "No meaningful signal", "confidence": 0.0},
        "acled": {"confirmed": False, "signal": "No matching ACLED events nearby", "confidence": 0.0},
    }
    rows = [
        {
            "publishability": 0.72,
            "urgency": 0.6,
            "access_difficulty": 0.4,
            "breakdown": {"validation_context": validation_context, "source_prior": 0.5},
        }
    ]

    class FakeDB:
        def table(self, name):
            return _FakeTableSelect(rows)

    monkeypatch.setattr("tribble.api.reports.get_supabase", lambda: FakeDB())
    r = client.get(f"/api/reports/{report_id}/validation")
    assert r.status_code == 200
    data = r.json()
    assert data["validation_context"] == validation_context
    assert data["validation_context"]["weather"]["confirmed"] is True
    assert data["validation_context"]["satellite"]["signal"] == "No meaningful signal"
    assert data["confidence_scores"]["publishability"] == 0.72
    assert data["confidence_scores"]["urgency"] == 0.6
    assert data["breakdown"]["validation_context"] == validation_context
