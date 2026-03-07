import asyncio
from unittest.mock import patch, MagicMock

from fastapi.testclient import TestClient
from tribble.main import app
from tribble.services.llm_provider import LLMResult

client = TestClient(app)


def _mock_supabase():
    """Build a mock supabase client with chained .table().select()... pattern."""
    sb = MagicMock()

    def make_table(data):
        table = MagicMock()
        table.select.return_value = table
        table.order.return_value = table
        table.limit.return_value = table
        table.eq.return_value = table
        table.execute.return_value = MagicMock(data=data)
        return table

    clusters = [
        {
            "id": "c1",
            "centroid_lat": 13.685,
            "centroid_lng": 25.355,
            "radius_km": 5.0,
            "country": "Sudan",
            "admin1": "North Darfur",
            "report_count": 45,
            "weighted_severity": 0.7,
            "weighted_confidence": 0.6,
            "top_need_categories": ["water_need", "food_need"],
            "access_blockers": ["armed_conflict"],
            "infrastructure_hazards": ["shelling"],
            "evidence_summary": "Active conflict zone",
            "last_updated": "2024-05-10T12:00:00Z",
        }
    ]
    scenes = [
        {
            "scene_id": "S2_20240506",
            "acquisition_date": "2024-05-06",
            "cloud_cover_pct": 12.0,
            "tile_url": "https://example.com/tile",
            "bbox": [25.2, 13.5, 25.5, 13.7],
            "ndvi": 0.18,
            "ndwi": -0.05,
            "mndwi": -0.08,
            "quality_score": 0.82,
            "lat": 13.63,
            "lng": 25.35,
        }
    ]
    weather = [
        {"date": "2024-05-06", "temperature_c": 38.0, "humidity_pct": 25.0, "wind_speed_ms": 4.0, "precipitation_mm": 0.0}
    ]
    events = [
        {"ontology_class": "shelling", "severity": "critical", "lat": 13.68, "lng": 25.36, "timestamp": "2024-05-06T00:00:00Z", "location_name": "Abu Shouk"}
    ]
    reports = [
        {"report_type": "water_need", "timestamp": "2024-05-06T10:00:00Z", "lat": 13.69, "lng": 25.36, "severity": "high", "narrative": "No water", "location_name": "Abu Shouk"},
    ] * 20

    table_data = {
        "incident_clusters": clusters,
        "satellite_scenes": scenes,
        "weather_data": weather,
        "events": events,
        "civilian_reports": reports,
    }
    sb.table.side_effect = lambda name: make_table(table_data.get(name, []))
    return sb


@patch("tribble.api.analysis.get_supabase")
@patch("tribble.api.analysis.GeminiProvider")
def test_dashboard_returns_zones(mock_gemini_cls, mock_get_sb):
    mock_get_sb.return_value = _mock_supabase()

    mock_gemini = MagicMock()

    async def fake_generate(prompt):
        return LLMResult(status="ok", text="Risk assessment narrative", model="gemini-2.5-flash", metadata={"provider": "gemini"})

    mock_gemini.generate = fake_generate
    mock_gemini_cls.return_value = mock_gemini

    response = client.get("/api/analysis/dashboard")
    assert response.status_code == 200
    data = response.json()
    assert "zones" in data
    assert "corridors" in data
    assert "data_coverage" in data
    assert len(data["zones"]) == 1
    zone = data["zones"][0]
    assert "risk_profile" in zone
    assert "satellite_context" in zone
    assert "viewer_url" in zone["satellite_context"]


@patch("tribble.api.satellite.get_supabase")
def test_satellite_scenes_intervals_empty(mock_get_sb):
    sb = MagicMock()
    table = MagicMock()
    table.select.return_value = table
    table.order.return_value = table
    table.execute.return_value = MagicMock(data=[])
    sb.table.return_value = table
    mock_get_sb.return_value = sb

    response = client.get("/api/satellite/scenes/intervals")
    assert response.status_code == 200
    data = response.json()
    assert data["min_date"] is None
    assert data["max_date"] is None
    assert data["intervals"] == []


@patch("tribble.api.satellite.get_supabase")
def test_satellite_scenes_intervals_from_data(mock_get_sb):
    sb = MagicMock()
    table = MagicMock()
    table.select.return_value = table
    table.order.return_value = table
    table.execute.return_value = MagicMock(
        data=[
            {"acquisition_date": "2024-05-03T10:00:00Z"},
            {"acquisition_date": "2024-05-08T10:00:00Z"},
            {"acquisition_date": "2024-05-15T10:00:00Z"},
        ]
    )
    sb.table.return_value = table
    mock_get_sb.return_value = sb

    response = client.get("/api/satellite/scenes/intervals")
    assert response.status_code == 200
    data = response.json()
    assert data["min_date"] == "2024-05-03"
    assert data["max_date"] == "2024-05-15"
    assert len(data["intervals"]) >= 1
    assert all("label" in i and "date_from" in i and "date_to" in i for i in data["intervals"])
