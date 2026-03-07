from fastapi.testclient import TestClient

from tribble.main import app

client = TestClient(app)


class _FakeResponse:
    def __init__(self, data):
        self.data = data


class _FakeRpcCall:
    def __init__(self, data):
        self._data = data

    def execute(self):
        return _FakeResponse(self._data)


class _FakeDB:
    def __init__(self, data, captured):
        self._data = data
        self._captured = captured

    def rpc(self, fn_name, params):
        self._captured["fn_name"] = fn_name
        self._captured["params"] = params
        return _FakeRpcCall(self._data)


def test_geojson_feature_collection_shape_and_coordinates(monkeypatch):
    """Verify GeoJSON FeatureCollection shape and coordinates are correctly serialized."""
    captured = {}
    rows = [
        {
            "id": "c1",
            "centroid_lng": 32.56,
            "centroid_lat": 15.5,
            "report_count": 5,
            "weighted_severity": 0.72,
            "weighted_confidence": 0.66,
            "top_need_categories": ["medical_need"],
            "access_blockers": ["route_blockage"],
            "infrastructure_hazards": ["hospital_damaged"],
            "evidence_summary": "5 reports",
            "radius_km": 3.0,
            "country": "Sudan",
            "last_updated": "2026-03-07T00:00:00Z",
        }
    ]
    monkeypatch.setattr(
        "tribble.api.clusters.get_supabase",
        lambda: _FakeDB(rows, captured),
    )

    response = client.get("/api/clusters")
    assert response.status_code == 200
    payload = response.json()

    # FeatureCollection shape
    assert payload["type"] == "FeatureCollection"
    assert isinstance(payload["features"], list)
    assert len(payload["features"]) == 1

    feature = payload["features"][0]
    assert feature["type"] == "Feature"
    assert feature["geometry"]["type"] == "Point"
    assert feature["geometry"]["coordinates"] == [32.56, 15.5]

    props = feature["properties"]
    assert props["id"] == "c1"
    assert props["report_count"] == 5
    assert props["weighted_severity"] == 0.72
    assert props["weighted_confidence"] == 0.66
    assert props["radius_km"] == 3.0
    assert props["country"] == "Sudan"

    assert captured["fn_name"] == "get_incident_clusters_geojson"
    assert captured["params"]["p_limit"] == 200


def test_bbox_params_passed_through_to_rpc(monkeypatch):
    """Verify bbox query params are parsed and passed to the spatial query."""
    captured = {}
    monkeypatch.setattr(
        "tribble.api.clusters.get_supabase",
        lambda: _FakeDB([], captured),
    )

    response = client.get("/api/clusters?bbox=30,14,35,17")
    assert response.status_code == 200
    assert captured["params"]["p_min_lon"] == 30.0
    assert captured["params"]["p_min_lat"] == 14.0
    assert captured["params"]["p_max_lon"] == 35.0
    assert captured["params"]["p_max_lat"] == 17.0


def test_rejects_bbox_min_not_less_than_max():
    """Invalid bbox (min >= max) must return 422."""
    response = client.get("/api/clusters?bbox=35,14,30,17")
    assert response.status_code == 422


def test_rejects_bbox_non_numeric():
    """bbox with non-numeric values must return 422."""
    response = client.get("/api/clusters?bbox=a,b,c,d")
    assert response.status_code == 422


def test_rejects_bbox_wrong_number_of_parts():
    """bbox with wrong number of components must return 422."""
    response = client.get("/api/clusters?bbox=30,14,35")
    assert response.status_code == 422


def test_omits_clusters_with_missing_centroid_no_default_zero(monkeypatch):
    """Rows with null centroid must be omitted; must not default to [0,0]."""
    captured = {}
    rows = [
        {
            "id": "c1",
            "centroid_lng": None,
            "centroid_lat": 15.5,
            "report_count": 1,
            "weighted_severity": 0.5,
            "weighted_confidence": 0.5,
            "top_need_categories": [],
            "access_blockers": [],
            "infrastructure_hazards": [],
            "evidence_summary": "",
            "radius_km": 1.0,
            "country": "SD",
            "last_updated": "2026-03-07T00:00:00Z",
        },
        {
            "id": "c2",
            "centroid_lng": 32.0,
            "centroid_lat": 16.0,
            "report_count": 2,
            "weighted_severity": 0.6,
            "weighted_confidence": 0.6,
            "top_need_categories": [],
            "access_blockers": [],
            "infrastructure_hazards": [],
            "evidence_summary": "",
            "radius_km": 1.0,
            "country": "SD",
            "last_updated": "2026-03-07T00:00:00Z",
        },
    ]
    monkeypatch.setattr(
        "tribble.api.clusters.get_supabase",
        lambda: _FakeDB(rows, captured),
    )

    response = client.get("/api/clusters")
    assert response.status_code == 200
    payload = response.json()
    assert payload["type"] == "FeatureCollection"
    assert len(payload["features"]) == 1
    assert payload["features"][0]["geometry"]["coordinates"] == [32.0, 16.0]
    assert [0, 0] not in [f["geometry"]["coordinates"] for f in payload["features"]]
