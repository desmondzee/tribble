"""Tests for route suggestion API (GET/POST /api/routes/suggest) and recency filtering."""

from datetime import datetime, timezone, timedelta
from unittest.mock import MagicMock, patch, AsyncMock

from fastapi.testclient import TestClient
from tribble.main import app
from tribble.services.llm_provider import LLMResult

client = TestClient(app)


def _mock_supabase_with_events_and_clusters(
    events: list[dict],
    clusters: list[dict],
):
    sb = MagicMock()

    def make_table(name: str):
        table = MagicMock()
        table.select.return_value = table
        table.order.return_value = table
        table.limit.return_value = table
        table.eq.return_value = table
        if name == "events":
            table.execute.return_value = MagicMock(data=events)
        elif name == "incident_clusters":
            table.execute.return_value = MagicMock(data=clusters)
        else:
            table.execute.return_value = MagicMock(data=[])
        return table

    sb.table.side_effect = make_table
    sb.rpc.return_value.select.return_value = sb.rpc.return_value
    sb.rpc.return_value.execute.return_value = MagicMock(
        data=[{**c, "centroid_lat": c.get("centroid_lat"), "centroid_lng": c.get("centroid_lng")} for c in clusters]
    )
    return sb


def test_suggest_get_returns_structure():
    """GET /api/routes/suggest returns recent_events_nearby, suggested_routes, narrative."""
    now = datetime.now(timezone.utc)
    recent_ts = (now - timedelta(hours=2)).isoformat()
    events = [
        {
            "id": "e1",
            "lat": 13.63,
            "lng": 25.35,
            "ontology_class": "shelling",
            "severity": "high",
            "timestamp": recent_ts,
            "description": "Shelling near town",
            "location_name": "Abu Shouk",
        }
    ]
    clusters = [
        {
            "id": "c1",
            "centroid_lat": 13.68,
            "centroid_lng": 25.36,
            "weighted_severity": 0.3,
            "admin1": "North Darfur",
            "country": "Sudan",
            "last_updated": recent_ts,
        }
    ]
    mock_sb = _mock_supabase_with_events_and_clusters(events, clusters)

    with patch("tribble.api.routes.get_supabase", return_value=mock_sb):
        with patch("tribble.api.routes.GeminiProvider") as mock_gemini_cls:
            mock_gemini_cls.return_value.generate = AsyncMock(
                return_value=LLMResult(status="ok", text="Avoid the area due to recent shelling.", model="gemini", metadata={})
            )
            response = client.get(
                "/api/routes/suggest",
                params={
                    "from_lat": 13.5,
                    "from_lng": 25.2,
                    "to_lat": 13.7,
                    "to_lng": 25.5,
                    "avoid_recent_hours": 24,
                },
            )
    assert response.status_code == 200
    data = response.json()
    assert "recent_events_nearby" in data
    assert "suggested_routes" in data
    assert "narrative" in data
    assert isinstance(data["suggested_routes"], list)
    assert len(data["suggested_routes"]) >= 1
    primary = next((r for r in data["suggested_routes"] if r["type"] == "primary"), None)
    assert primary is not None
    assert primary["type"] == "primary"
    assert "risk_level" in primary
    assert "waypoints_or_corridor" in primary
    assert "advisory" in primary
    assert "recommended" in primary


def test_suggest_post_accepts_body():
    """POST /api/routes/suggest accepts JSON body and returns same shape."""
    now = datetime.now(timezone.utc)
    recent_ts = (now - timedelta(hours=1)).isoformat()
    events: list[dict] = []
    clusters = [
        {
            "id": "c1",
            "centroid_lat": 13.0,
            "centroid_lng": 25.0,
            "weighted_severity": 0.1,
            "admin1": "Test",
            "country": "Sudan",
            "last_updated": recent_ts,
        }
    ]
    mock_sb = _mock_supabase_with_events_and_clusters(events, clusters)

    with patch("tribble.api.routes.get_supabase", return_value=mock_sb):
        response = client.post(
            "/api/routes/suggest",
            json={
                "origin": {"lat": 13.0, "lng": 25.0},
                "destination": {"lat": 13.1, "lng": 25.1},
                "avoid_recent_hours": 48,
            },
        )
    assert response.status_code == 200
    data = response.json()
    assert "suggested_routes" in data
    assert data["suggested_routes"][0]["type"] == "primary"
    assert data["suggested_routes"][0].get("recommended") is True  # low risk, no events


def test_recency_filter_excludes_old_events():
    """Events older than avoid_recent_hours are excluded from recent_events_nearby."""
    now = datetime.now(timezone.utc)
    old_ts = (now - timedelta(hours=100)).isoformat()
    recent_ts = (now - timedelta(hours=2)).isoformat()
    events = [
        {
            "id": "old",
            "lat": 13.62,
            "lng": 25.34,
            "ontology_class": "armed_conflict",
            "severity": "low",
            "timestamp": old_ts,
            "description": "Old event",
            "location_name": "Far",
        },
        {
            "id": "new",
            "lat": 13.64,
            "lng": 25.36,
            "ontology_class": "shelling",
            "severity": "high",
            "timestamp": recent_ts,
            "description": "Recent shelling",
            "location_name": "Near path",
        },
    ]
    clusters = [
        {
            "id": "c1",
            "centroid_lat": 13.65,
            "centroid_lng": 25.35,
            "weighted_severity": 0.5,
            "admin1": "North Darfur",
            "country": "Sudan",
            "last_updated": recent_ts,
        }
    ]
    mock_sb = _mock_supabase_with_events_and_clusters(events, clusters)

    with patch("tribble.api.routes.get_supabase", return_value=mock_sb):
        response = client.get(
            "/api/routes/suggest",
            params={
                "from_lat": 13.5,
                "from_lng": 25.2,
                "to_lat": 13.8,
                "to_lng": 25.6,
                "avoid_recent_hours": 24,
            },
        )
    assert response.status_code == 200
    data = response.json()
    ids_nearby = [e["id"] for e in data["recent_events_nearby"]]
    assert "new" in ids_nearby
    assert "old" not in ids_nearby


def test_alternative_route_when_primary_high_risk_and_event_near():
    """When direct route has high/critical risk and an event is near segment, an alternative route is suggested."""
    now = datetime.now(timezone.utc)
    recent_ts = (now - timedelta(hours=1)).isoformat()
    events = [
        {
            "id": "hot",
            "lat": 13.63,
            "lng": 25.35,
            "ontology_class": "shelling",
            "severity": "critical",
            "timestamp": recent_ts,
            "description": "Heavy shelling",
            "location_name": "Mid path",
        }
    ]
    clusters = [
        {
            "id": "c1",
            "centroid_lat": 13.63,
            "centroid_lng": 25.35,
            "weighted_severity": 0.9,
            "admin1": "North Darfur",
            "country": "Sudan",
            "last_updated": recent_ts,
        }
    ]
    mock_sb = _mock_supabase_with_events_and_clusters(events, clusters)

    with patch("tribble.api.routes.get_supabase", return_value=mock_sb):
        response = client.get(
            "/api/routes/suggest",
            params={
                "from_lat": 13.5,
                "from_lng": 25.2,
                "to_lat": 13.8,
                "to_lng": 25.5,
                "avoid_recent_hours": 24,
            },
        )
    assert response.status_code == 200
    data = response.json()
    routes = data["suggested_routes"]
    primary = next((r for r in routes if r["type"] == "primary"), None)
    alternative = next((r for r in routes if r["type"] == "alternative"), None)
    assert primary is not None
    if primary["risk_level"] in ("high", "critical") and data["recent_events_nearby"]:
        assert alternative is not None
        assert alternative["type"] == "alternative"
        assert len(alternative["waypoints_or_corridor"]) == 3
        assert primary["recommended"] is False
        assert alternative["recommended"] is True
        assert "suggest" in primary["advisory"].lower() or "do not recommend" in primary["advisory"].lower()


def test_suggest_requires_origin_destination():
    """GET without required params returns 422."""
    response = client.get("/api/routes/suggest", params={"from_lat": 13.0})
    assert response.status_code == 422


def test_primary_not_recommended_when_multiple_events_on_path():
    """When two or more events are near the direct path, primary has recommended=false and suggestion wording."""
    now = datetime.now(timezone.utc)
    recent_ts = (now - timedelta(hours=1)).isoformat()
    events = [
        {
            "id": "e1",
            "lat": 13.62,
            "lng": 25.34,
            "ontology_class": "armed_conflict",
            "severity": "medium",
            "timestamp": recent_ts,
            "description": "Incident A",
            "location_name": "Point A",
        },
        {
            "id": "e2",
            "lat": 13.65,
            "lng": 25.38,
            "ontology_class": "shelling",
            "severity": "medium",
            "timestamp": recent_ts,
            "description": "Incident B",
            "location_name": "Point B",
        },
    ]
    clusters = [
        {
            "id": "c1",
            "centroid_lat": 13.6,
            "centroid_lng": 25.35,
            "weighted_severity": 0.2,
            "admin1": "North Darfur",
            "country": "Sudan",
            "last_updated": recent_ts,
        }
    ]
    mock_sb = _mock_supabase_with_events_and_clusters(events, clusters)

    with patch("tribble.api.routes.get_supabase", return_value=mock_sb):
        response = client.get(
            "/api/routes/suggest",
            params={
                "from_lat": 13.5,
                "from_lng": 25.2,
                "to_lat": 13.8,
                "to_lng": 25.5,
                "avoid_recent_hours": 24,
            },
        )
    assert response.status_code == 200
    data = response.json()
    primary = next((r for r in data["suggested_routes"] if r["type"] == "primary"), None)
    assert primary is not None
    assert primary["recommended"] is False
    assert "suggest" in primary["advisory"].lower() or "do not" in primary["advisory"].lower()
