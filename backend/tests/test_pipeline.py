from tribble.pipeline.state import PipelineState, PipelineStatus
from tribble.pipeline.graph import build_pipeline, classify


def _state(**kw) -> PipelineState:
    base: PipelineState = {
        "report_id": "t1",
        "raw_narrative": "",
        "source_type": "web_anonymous",
        "latitude": 0.0,
        "longitude": 0.0,
        "language": "en",
        "timestamp": "2024-06-15T12:00:00Z",
        "status": PipelineStatus.INGESTED,
        "node_trace": [],
        "error": None,
        "normalized": None,
        "translation": None,
        "classification": None,
        "geocoded_location": None,
        "duplicates_found": [],
        "corroboration_hits": [],
        "weather_data": None,
        "satellite_data": None,
        "satellite_eo_features": None,
        "satellite_quality": None,
        "satellite_alert": None,
        "confidence_breakdown": None,
        "confidence_scores": None,
        "cluster_id": None,
        "report_type": None,
        "validation_context": None,
    }
    base.update(kw)
    return base


def test_compiles():
    assert build_pipeline() is not None


def test_rejects_empty():
    r = build_pipeline().invoke(_state())
    assert r["status"] == PipelineStatus.REJECTED


def test_full_flow():
    r = build_pipeline().invoke(
        _state(raw_narrative="Heavy fighting near the airport, families sheltering")
    )
    assert r["status"] == PipelineStatus.PUBLISHED
    assert len(r["node_trace"]) == 11
    assert r["confidence_scores"] is not None


def test_state_has_report_type_and_validation():
    s = _state(
        raw_narrative="Water station destroyed",
        report_type="water_need",
    )
    assert s["report_type"] == "water_need"
    assert s.get("validation_context") is None


def test_classify_shelling():
    s = _state(raw_narrative="Heavy shelling near airport", report_type="shelling")
    result = classify(s)
    assert result["classification"]["crisis_categories"] == ["security"]
    assert result["classification"]["urgency_hint"] == "medium"


def test_classify_water_need():
    s = _state(raw_narrative="Water station destroyed", report_type="water_need")
    result = classify(s)
    assert result["classification"]["crisis_categories"] == ["water_sanitation"]


def test_classify_looting_maps_dual():
    s = _state(raw_narrative="Market looted", report_type="looting")
    result = classify(s)
    assert "security" in result["classification"]["crisis_categories"]
    assert "food" in result["classification"]["crisis_categories"]


def test_classify_no_report_type_falls_back():
    s = _state(raw_narrative="Something happened")
    result = classify(s)
    assert result["classification"]["crisis_categories"] == []
