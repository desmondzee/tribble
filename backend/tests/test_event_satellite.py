"""Tests for event-driven satellite analysis (event_satellite service)."""

import json
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from tribble.ingest.satellite import bbox_preview_url
from tribble.services.event_satellite import (
    _parse_json_from_response,
    _time_window_to_date_range,
    parse_event_for_satellite,
    synthesize_aid_impact,
    get_snapshots_for_event,
    run_event_satellite_analysis,
)


def test_bbox_preview_url_includes_bbox():
    url = bbox_preview_url("sentinel-2-l2a", "S2A_xyz", [25.0, 13.0, 25.1, 13.1])
    assert "bbox=" in url
    assert "25" in url
    assert "sentinel-2-l2a" in url


def test_parse_json_from_response_raw_json():
    out = _parse_json_from_response('{"a": 1, "b": "x"}')
    assert out == {"a": 1, "b": "x"}


def test_parse_json_from_response_embedded():
    out = _parse_json_from_response('Text before\n{"x": true}\nText after')
    assert out == {"x": True}


def test_parse_json_from_response_invalid_returns_none():
    assert _parse_json_from_response("not json") is None
    assert _parse_json_from_response("") is None


def test_time_window_to_date_range():
    start, end = _time_window_to_date_range("2024-05-15", 0, 7)
    assert start <= "2024-05-15"
    assert end >= "2024-05-15"
    assert "2024-05" in start
    assert "2024-05" in end


@pytest.mark.asyncio
async def test_parse_event_for_satellite_no_api_key_returns_defaults():
    with patch("tribble.services.event_satellite.get_settings") as m:
        m.return_value.anthropic_api_key = ""
        m.return_value.llm_model = "claude-3-5-haiku-20241022"
        out = await parse_event_for_satellite("Missile strike on hospital in X.")
    assert out["event_category"] == "other"
    assert "what_to_check" in out
    assert "infrastructure_damage" in out["what_to_check"]
    assert "location_summary" in out


@pytest.mark.asyncio
async def test_parse_event_for_satellite_mocked_claude():
    with patch("tribble.services.event_satellite.get_settings") as m:
        m.return_value.anthropic_api_key = "key"
        m.return_value.llm_model = "claude-3-5-haiku-20241022"
        with patch("tribble.services.event_satellite.AnthropicProvider") as MockProvider:
            mock_instance = MagicMock()
            mock_instance.generate = AsyncMock(
                return_value=MagicMock(
                    status="ok",
                    text=json.dumps({
                        "event_category": "missile_strike",
                        "location_summary": "Hospital X",
                        "what_to_check": ["infrastructure_damage", "hospital_school"],
                    }),
                )
            )
            MockProvider.return_value = mock_instance
            out = await parse_event_for_satellite("Missile strike on hospital.", ontology_class="Explosions")
    assert out["event_category"] == "missile_strike"
    assert out["location_summary"] == "Hospital X"
    assert "infrastructure_damage" in out["what_to_check"]
    assert "hospital_school" in out["what_to_check"]


@pytest.mark.asyncio
async def test_synthesize_aid_impact_no_snapshots_returns_uncertain():
    out = await synthesize_aid_impact(
        {"event_category": "other", "location_summary": "", "what_to_check": []},
        [],
        "2024-05-15",
    )
    assert out["affects_aid_response"] == "uncertain"
    assert "infrastructure_note" in out
    assert "snapshot_notes" in out
    assert "problems" in out
    assert "realistic_solutions" in out


@pytest.mark.asyncio
async def test_synthesize_aid_impact_no_api_key():
    with patch("tribble.services.event_satellite.get_settings") as m:
        m.return_value.anthropic_api_key = ""
        m.return_value.llm_model = "claude-3-5-haiku-20241022"
        out = await synthesize_aid_impact(
            {"event_category": "other", "location_summary": "", "what_to_check": []},
            [{"period_label": "at_event", "acquisition_date": "2024-05-15", "satellite_analysis": {"flood_score_ai": 0.1, "infrastructure_damage_score_ai": 0.2, "labels": []}}],
            "2024-05-15",
        )
    assert out["affects_aid_response"] == "uncertain"
    assert "No satellite analysis" in out.get("infrastructure_note", "")


@pytest.mark.asyncio
async def test_synthesize_aid_impact_mocked_claude():
    with patch("tribble.services.event_satellite.get_settings") as m:
        m.return_value.anthropic_api_key = "key"
        m.return_value.llm_model = "claude-3-5-haiku-20241022"
        with patch("tribble.services.event_satellite.AnthropicProvider") as MockProvider:
            mock_instance = MagicMock()
            mock_instance.generate = AsyncMock(
                return_value=MagicMock(
                    status="ok",
                    text=json.dumps({
                        "affects_aid_response": "yes",
                        "infrastructure_note": "Damage visible in post-event snapshot.",
                        "summary": "Event likely affects aid delivery.",
                        "problems": "Road damage; access restricted.",
                        "realistic_solutions": "Use alternate route; coordinate with local actors.",
                        "snapshot_notes": {"before": "Intact.", "after": "Damage visible."},
                    }),
                )
            )
            MockProvider.return_value = mock_instance
            out = await synthesize_aid_impact(
                {"event_category": "missile_strike", "location_summary": "X", "what_to_check": ["infrastructure_damage"]},
                [
                    {"period_label": "before", "acquisition_date": "2024-05-01", "satellite_analysis": {"flood_score_ai": 0, "infrastructure_damage_score_ai": 0, "labels": []}},
                    {"period_label": "after", "acquisition_date": "2024-05-20", "satellite_analysis": {"flood_score_ai": 0, "infrastructure_damage_score_ai": 0.8, "labels": ["possible_infrastructure_damage"]}},
                ],
                "2024-05-15",
            )
    assert out["affects_aid_response"] == "yes"
    assert "Damage visible" in out["infrastructure_note"]
    assert out["problems"] == "Road damage; access restricted."
    assert "alternate route" in out["realistic_solutions"]
    assert out["snapshot_notes"].get("before") == "Intact."
    assert out["snapshot_notes"].get("after") == "Damage visible."


@pytest.mark.asyncio
async def test_get_snapshots_for_event_no_coords_returns_empty():
    with patch("tribble.services.event_satellite.get_settings") as m:
        m.return_value.satellite_event_snapshot_km = 5.0
        m.return_value.satellite_event_time_windows = [{"label": "at_event", "offset_days": 0, "tolerance_days": 7}]
        out = await get_snapshots_for_event(MagicMock(), {"lat": None, "lng": 25.0})
    assert out == []


@pytest.mark.asyncio
async def test_get_snapshots_for_event_mocked_stac():
    with patch("tribble.services.event_satellite.get_settings") as m:
        m.return_value.satellite_event_snapshot_km = 5.0
        m.return_value.satellite_event_time_windows = [{"label": "at_event", "offset_days": 0, "tolerance_days": 7}]
        m.return_value.enable_satellite_ai_analysis = True
        m.return_value.anthropic_api_key = "key"
        m.return_value.llm_model = "claude-3-5-haiku-20241022"
    with patch("tribble.services.event_satellite.search_sentinel2_scenes", new_callable=AsyncMock) as mock_search:
        mock_search.return_value = [{
            "scene_id": "S2A_xyz",
            "acquisition_date": "2024-05-15T00:00:00Z",
            "tile_url": "https://example.com/preview.png",
            "bbox": [25.0, 13.0, 26.0, 14.0],
        }]
        with patch("tribble.services.event_satellite.get_or_create_ai_analysis_async", new_callable=AsyncMock) as mock_cache:
            from tribble.models.satellite_ai import SatelliteAIAnalysis
            mock_cache.return_value = SatelliteAIAnalysis(
                flood_score_ai=0.1,
                infrastructure_damage_score_ai=0.2,
                labels=[],
                model="claude-3-5-haiku-20241022",
            )
            out = await get_snapshots_for_event(
                MagicMock(),
                {"lat": 13.63, "lng": 25.35, "timestamp": "2024-05-15T12:00:00Z"},
                time_windows=[{"label": "at_event", "offset_days": 0, "tolerance_days": 7}],
            )
    assert len(out) >= 1
    assert out[0]["period_label"] == "at_event"
    assert out[0]["scene_id"] == "S2A_xyz"
    assert "satellite_analysis" in out[0]
    assert out[0]["satellite_analysis"]["flood_score_ai"] == 0.1


@pytest.mark.asyncio
async def test_run_event_satellite_analysis_full_flow_mocked():
    event = {
        "id": "evt-1",
        "lat": 13.63,
        "lng": 25.35,
        "description": "Missile strike on hospital.",
        "timestamp": "2024-05-15T12:00:00Z",
        "ontology_class": "Explosions",
    }
    with patch("tribble.services.event_satellite.parse_event_for_satellite", new_callable=AsyncMock) as m_parse:
        m_parse.return_value = {"event_category": "missile_strike", "location_summary": "X", "what_to_check": ["infrastructure_damage"]}
        with patch("tribble.services.event_satellite.get_snapshots_for_event", new_callable=AsyncMock) as m_snap:
            m_snap.return_value = [
                {"period_label": "at_event", "acquisition_date": "2024-05-15", "image_url": "https://x", "scene_id": "S2", "satellite_analysis": {"flood_score_ai": 0, "infrastructure_damage_score_ai": 0.5, "labels": []}},
            ]
            with patch("tribble.services.event_satellite.synthesize_aid_impact", new_callable=AsyncMock) as m_synth:
                m_synth.return_value = {"affects_aid_response": "yes", "infrastructure_note": "Damage possible.", "summary": "Summary.", "snapshot_notes": {}}
                out = await run_event_satellite_analysis(MagicMock(), event)
    assert out["event_id"] == "evt-1"
    assert out["parsed_event"]["event_category"] == "missile_strike"
    assert len(out["snapshots"]) == 1
    assert out["aid_impact"]["affects_aid_response"] == "yes"
