"""Tests for POST and GET /api/analysis/event-satellite endpoints."""

from unittest.mock import AsyncMock, MagicMock, patch

from fastapi.testclient import TestClient

from tribble.main import app

client = TestClient(app)


def test_event_satellite_post_no_events_returns_404():
    with patch("tribble.api.analysis.get_supabase") as m_sb:
        mock_db = MagicMock()
        mock_table = MagicMock()
        mock_table.select.return_value = mock_table
        mock_table.order.return_value = mock_table
        mock_table.limit.return_value = mock_table
        mock_table.not_.is_.return_value = mock_table
        mock_table.execute.return_value = MagicMock(data=[])
        mock_db.table.return_value = mock_table
        m_sb.return_value = mock_db

        response = client.post("/api/analysis/event-satellite", json={})

    assert response.status_code == 404
    assert "No events" in response.json().get("detail", "")


def test_event_satellite_post_with_event_ids_mocked_flow():
    with patch("tribble.api.analysis.get_supabase") as m_sb:
        mock_db = MagicMock()
        # First call: fetch by event id
        fetch_one = MagicMock()
        fetch_one.select.return_value = fetch_one
        fetch_one.eq.return_value = fetch_one
        fetch_one.execute.return_value = MagicMock(
            data=[{
                "id": "evt-123",
                "lat": 13.63,
                "lng": 25.35,
                "description": "Missile strike.",
                "timestamp": "2024-05-15T12:00:00Z",
                "ontology_class": "Explosions",
            }]
        )
        mock_db.table.return_value = fetch_one

        with patch("tribble.api.analysis.run_event_satellite_analysis", new_callable=AsyncMock) as m_run:
            m_run.return_value = {
                "event_id": "evt-123",
                "parsed_event": {"event_category": "missile_strike", "location_summary": "X", "what_to_check": ["infrastructure_damage"]},
                "snapshots": [
                    {"period_label": "at_event", "acquisition_date": "2024-05-15", "image_url": "https://x", "scene_id": "S2", "satellite_analysis": {"flood_score_ai": 0, "infrastructure_damage_score_ai": 0.5, "labels": []}},
                ],
                "aid_impact": {"affects_aid_response": "yes", "infrastructure_note": "Damage possible.", "summary": "Summary.", "snapshot_notes": {}},
            }
            insert_mock = MagicMock()
            mock_db.table.return_value = insert_mock
            insert_mock.insert.return_value = insert_mock
            insert_mock.execute.return_value = None

            def table_side_effect(name):
                if name == "events":
                    return fetch_one
                return insert_mock

            mock_db.table.side_effect = table_side_effect
            m_sb.return_value = mock_db

            response = client.post(
                "/api/analysis/event-satellite",
                json={"event_ids": ["evt-123"], "persist": True},
            )

    assert response.status_code == 200
    data = response.json()
    assert "results" in data
    assert len(data["results"]) == 1
    assert data["results"][0]["event_id"] == "evt-123"
    assert data["results"][0]["parsed_event"]["event_category"] == "missile_strike"
    assert len(data["results"][0]["snapshots"]) == 1
    assert data["results"][0]["aid_impact"]["affects_aid_response"] == "yes"


def test_event_satellite_post_db_unavailable_returns_503():
    with patch("tribble.api.analysis.get_supabase", side_effect=RuntimeError("not configured")):
        response = client.post("/api/analysis/event-satellite", json={})
    assert response.status_code == 503


def test_event_satellite_post_with_events_with_coords():
    """POST with events_with_coords (feed items) runs analysis and stores by id."""
    with patch("tribble.api.analysis.get_supabase") as m_sb:
        mock_db = MagicMock()
        insert_mock = MagicMock()
        insert_mock.insert.return_value = insert_mock
        insert_mock.execute.return_value = None
        mock_db.table.return_value = insert_mock
        m_sb.return_value = mock_db

        with patch("tribble.api.analysis.run_event_satellite_analysis", new_callable=AsyncMock) as m_run:
            m_run.return_value = {
                "event_id": "report-abc",
                "parsed_event": {"event_category": "battle", "location_summary": "Juba", "what_to_check": ["infrastructure_damage"]},
                "snapshots": [{"period_label": "at_event", "acquisition_date": "2024-05-15", "image_url": "https://x", "scene_id": "S2", "satellite_analysis": {}}],
                "aid_impact": {"affects_aid_response": "yes", "summary": "Summary.", "infrastructure_note": "", "snapshot_notes": {}},
            }
            response = client.post(
                "/api/analysis/event-satellite",
                json={
                    "events_with_coords": [
                        {"id": "report-abc", "lat": 4.85, "lng": 31.58, "narrative": "Violence in Juba.", "event_timestamp": "2024-05-15T12:00:00Z"},
                    ],
                    "persist": True,
                },
            )

    assert response.status_code == 200
    data = response.json()
    assert len(data["results"]) == 1
    assert data["results"][0]["event_id"] == "report-abc"
    assert data["results"][0]["snapshots"][0]["period_label"] == "at_event"


def test_event_satellite_get_returns_stored_results():
    with patch("tribble.api.analysis.get_supabase") as m_sb:
        mock_db = MagicMock()
        mock_table = MagicMock()
        mock_table.select.return_value = mock_table
        mock_table.eq.return_value = mock_table
        mock_table.order.return_value = mock_table
        mock_table.limit.return_value = mock_table
        mock_table.execute.return_value = MagicMock(
            data=[
                {
                    "id": "ar-1",
                    "summary": "Summary.",
                    "details": {
                        "event_id": "evt-1",
                        "parsed_event": {"event_category": "shelling", "what_to_check": ["infrastructure_damage"]},
                        "snapshots": [
                            {"period_label": "before", "acquisition_date": "2024-05-01", "image_url": "https://a"},
                            {"period_label": "after", "acquisition_date": "2024-05-20", "image_url": "https://b"},
                        ],
                        "synthesis": {"affects_aid_response": "yes", "summary": "Summary.", "infrastructure_note": "", "snapshot_notes": {}},
                    },
                    "created_at": "2024-05-21T00:00:00Z",
                },
            ]
        )
        mock_db.table.return_value = mock_table
        m_sb.return_value = mock_db

        response = client.get("/api/analysis/event-satellite?event_ids=evt-1")

    assert response.status_code == 200
    data = response.json()
    assert "results" in data
    assert len(data["results"]) == 1
    assert data["results"][0]["event_id"] == "evt-1"
    assert len(data["results"][0]["snapshots"]) == 2
    assert data["results"][0]["snapshots"][0]["image_url"] == "https://a"
    assert data["results"][0]["aid_impact"]["affects_aid_response"] == "yes"


def test_event_satellite_get_db_unavailable_returns_503():
    with patch("tribble.api.analysis.get_supabase", side_effect=RuntimeError("not configured")):
        response = client.get("/api/analysis/event-satellite")
    assert response.status_code == 503
