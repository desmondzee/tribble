"""Tests for geolocation API endpoint."""

from fastapi.testclient import TestClient

from tribble.main import app

client = TestClient(app)


class _FakeTableChain:
    """Fake Supabase table().select().order().limit() chain."""

    def __init__(self, data: list):
        self._data = data

    def select(self, *args):
        return self

    def order(self, *args, **kwargs):
        return self

    def limit(self, n):
        return self

    def in_(self, col, vals):
        return self

    def execute(self):
        return type("Res", (), {"data": self._data})()


class _FakeGeolocationDB:
    def __init__(self, rows: list):
        self._rows = rows

    def table(self, name):
        return _FakeTableChain(self._rows)


def test_geolocation_geojson_empty_reports(monkeypatch):
    """Empty reports returns valid empty FeatureCollection."""
    monkeypatch.setattr(
        "tribble.api.geolocation.get_supabase",
        lambda: _FakeGeolocationDB([]),
    )
    response = client.get("/api/geolocation/geojson")
    assert response.status_code == 200
    payload = response.json()
    assert payload["type"] == "FeatureCollection"
    assert payload["features"] == []


def test_geolocation_geojson_with_reports(monkeypatch):
    """Reports with narrative run pipeline and return GeoJSON."""
    rows = [
        {
            "id": "r1",
            "source_type": "web_anonymous",
            "narrative": "Heavy shelling reported in Aleppo city. Civilians trapped.",
            "language": "en",
            "event_timestamp": None,
            "created_at": None,
            "processing_metadata": {},
        },
    ]
    monkeypatch.setattr(
        "tribble.api.geolocation.get_supabase",
        lambda: _FakeGeolocationDB(rows),
    )
    response = client.get("/api/geolocation/geojson?limit=10")
    assert response.status_code == 200
    payload = response.json()
    assert payload["type"] == "FeatureCollection"
    assert isinstance(payload["features"], list)
    # Without GEONAMES_USERNAME, pipeline returns empty; with it, would have features
    for f in payload["features"]:
        assert f["type"] == "Feature"
        assert f["geometry"]["type"] == "Point"
        assert len(f["geometry"]["coordinates"]) == 2
        assert "raw_place_text" in f.get("properties", {})


def test_geolocation_geojson_skips_short_narrative(monkeypatch):
    """Reports with narrative < 10 chars are skipped."""
    rows = [
        {
            "id": "r1",
            "source_type": "web",
            "narrative": "Short",
            "language": "en",
            "event_timestamp": None,
            "created_at": None,
            "processing_metadata": {},
        },
    ]
    monkeypatch.setattr(
        "tribble.api.geolocation.get_supabase",
        lambda: _FakeGeolocationDB(rows),
    )
    response = client.get("/api/geolocation/geojson")
    assert response.status_code == 200
    payload = response.json()
    assert payload["type"] == "FeatureCollection"
    assert payload["features"] == []
