"""Tests for satellite vision analysis (area-level AI)."""

import json
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from tribble.models.satellite_ai import SatelliteAIAnalysis
from tribble.services.satellite_vision import (
    SATELLITE_VISION_PROMPT,
    _parse_ai_response,
    analyze_satellite_image,
    get_or_create_ai_analysis,
    get_or_create_ai_analysis_async,
)


def test_vision_prompt_requires_area_level_only():
    assert "AREA level" in SATELLITE_VISION_PROMPT
    assert "building-level" in SATELLITE_VISION_PROMPT
    assert "flood_score_ai" in SATELLITE_VISION_PROMPT
    assert "infrastructure_damage_score_ai" in SATELLITE_VISION_PROMPT


def test_parse_ai_response_valid_json():
    text = json.dumps({
        "flood_score_ai": 0.7,
        "infrastructure_damage_score_ai": 0.4,
        "labels": ["flood_extent"],
    })
    out = _parse_ai_response(text, model="gemini-2.5-flash")
    assert out.flood_score_ai == 0.7
    assert out.infrastructure_damage_score_ai == 0.4
    assert out.labels == ["flood_extent"]
    assert out.model == "gemini-2.5-flash"


def test_parse_ai_response_json_in_markdown():
    text = 'Here is the result:\n```json\n{"flood_score_ai": 0.2, "infrastructure_damage_score_ai": 0.8, "labels": ["possible_infrastructure_damage"]}\n```'
    out = _parse_ai_response(text, model=None)
    assert out.flood_score_ai == 0.2
    assert out.infrastructure_damage_score_ai == 0.8
    assert "possible_infrastructure_damage" in out.labels


def test_parse_ai_response_clamps_scores():
    text = json.dumps({
        "flood_score_ai": 1.5,
        "infrastructure_damage_score_ai": -0.1,
        "labels": [],
    })
    out = _parse_ai_response(text, model=None)
    assert out.flood_score_ai == 1.0
    assert out.infrastructure_damage_score_ai == 0.0


def test_parse_ai_response_empty_returns_no_signal():
    out = _parse_ai_response("", model=None)
    assert out.flood_score_ai == 0.0
    assert out.infrastructure_damage_score_ai == 0.0
    assert out.labels == []


def test_parse_ai_response_invalid_json_returns_no_signal():
    out = _parse_ai_response("not json at all", model=None)
    assert out.flood_score_ai == 0.0
    assert out.infrastructure_damage_score_ai == 0.0


@pytest.mark.asyncio
async def test_analyze_satellite_image_disabled_returns_no_signal():
    with patch("tribble.services.satellite_vision.get_settings") as m:
        m.return_value.enable_satellite_ai_analysis = False
        m.return_value.gemini_api_key = "key"
        result = await analyze_satellite_image(
            image_url="https://example.com/tile.png",
            bbox=[0, 0, 1, 1],
            acquisition_date="2024-05-15",
        )
    assert result.flood_score_ai == 0.0
    assert result.infrastructure_damage_score_ai == 0.0


@pytest.mark.asyncio
async def test_analyze_satellite_image_no_api_key_returns_no_signal():
    with patch("tribble.services.satellite_vision.get_settings") as m:
        m.return_value.enable_satellite_ai_analysis = True
        m.return_value.gemini_api_key = ""
        m.return_value.gemini_model = "gemini-2.5-flash"
        result = await analyze_satellite_image(
            image_url="https://example.com/tile.png",
            bbox=[],
            acquisition_date="2024-05-15",
        )
    assert result.flood_score_ai == 0.0


@pytest.mark.asyncio
async def test_analyze_satellite_image_fetch_failure_returns_no_signal():
    with patch("tribble.services.satellite_vision.get_settings") as m:
        m.return_value.enable_satellite_ai_analysis = True
        m.return_value.gemini_api_key = "key"
        m.return_value.gemini_model = "gemini-2.5-flash"
    with patch("tribble.services.satellite_vision.httpx.AsyncClient") as mock_client:
        mock_client.return_value.__aenter__.return_value.get = AsyncMock(
            side_effect=Exception("network error"),
        )
        result = await analyze_satellite_image(
            image_url="https://example.com/tile.png",
            bbox=[],
            acquisition_date="2024-05-15",
        )
    assert result.flood_score_ai == 0.0
    assert result.infrastructure_damage_score_ai == 0.0


@pytest.mark.asyncio
async def test_analyze_satellite_image_success_parses_response():
    from tribble.config import get_settings
    get_settings.cache_clear()

    llm_response = type("R", (), {
        "status": "ok",
        "text": json.dumps({
            "flood_score_ai": 0.6,
            "infrastructure_damage_score_ai": 0.3,
            "labels": ["flood_extent"],
        }),
        "model": "gemini-2.5-flash",
    })()

    get_obj = MagicMock()
    get_obj.get = AsyncMock(return_value=MagicMock(content=b"fake_png_bytes", raise_for_status=MagicMock()))
    with patch("tribble.config.get_settings") as m:
        m.return_value.enable_satellite_ai_analysis = True
        m.return_value.gemini_api_key = "key"
        m.return_value.gemini_model = "gemini-2.5-flash"
        with patch("tribble.services.satellite_vision.get_settings", m):
            with patch("tribble.services.satellite_vision.httpx.AsyncClient") as mock_client:
                mock_client.return_value.__aenter__ = AsyncMock(return_value=get_obj)
                mock_client.return_value.__aexit__ = AsyncMock(return_value=None)
                with patch("tribble.services.satellite_vision.GeminiProvider") as MockProvider:
                    mock_instance = MagicMock()
                    mock_instance.generate_with_image = AsyncMock(return_value=llm_response)
                    MockProvider.return_value = mock_instance
                    result = await analyze_satellite_image(
                        image_url="https://example.com/tile.png",
                        bbox=[24.8, 13.3, 26.0, 14.0],
                        acquisition_date="2024-05-15",
                    )
    assert result.flood_score_ai == 0.6
    assert result.infrastructure_damage_score_ai == 0.3
    assert result.labels == ["flood_extent"]


def test_satellite_ai_analysis_to_dict_for_fusion():
    a = SatelliteAIAnalysis(
        flood_score_ai=0.7,
        infrastructure_damage_score_ai=0.4,
        labels=["flood_extent"],
        model="gemini-2.5-flash",
    )
    d = a.to_dict_for_fusion()
    assert d["flood_score_ai"] == 0.7
    assert d["infrastructure_damage_score_ai"] == 0.4
    assert d["labels"] == ["flood_extent"]


@pytest.mark.asyncio
async def test_get_or_create_ai_analysis_async_returns_cached():
    class MockChain:
        def __init__(self, data):
            self._data = data
        def table(self, _): return self
        def select(self, *_a, **_k): return self
        def eq(self, _k, _v): return self
        def execute(self): return type("R", (), {"data": self._data})()

    mock_sb = MockChain([{"flood_score_ai": 0.5, "infrastructure_damage_score_ai": 0.6, "labels": ["infra"], "model": "g"}])
    result = await get_or_create_ai_analysis_async(mock_sb, "S2_abc", {"tile_url": "http://x"})
    assert result.flood_score_ai == 0.5
    assert result.infrastructure_damage_score_ai == 0.6


@pytest.mark.asyncio
async def test_get_or_create_ai_analysis_async_no_cache_flag_off():
    class MockChain:
        def __init__(self, data=None):
            self._data = data if data is not None else []
        def table(self, _): return self
        def select(self, *_a, **_k): return self
        def eq(self, _k, _v): return self
        def execute(self): return type("R", (), {"data": self._data})()

    with patch("tribble.services.satellite_vision.get_settings") as m:
        m.return_value.enable_satellite_ai_analysis = False
        result = await get_or_create_ai_analysis_async(MockChain(), "S2_abc", {"tile_url": "http://x"})
    assert result.flood_score_ai == 0.0
