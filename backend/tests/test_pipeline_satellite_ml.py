from tribble.pipeline.graph import build_pipeline
from tribble.pipeline.state import PipelineState, PipelineStatus


def _state(**kw) -> PipelineState:
    base: PipelineState = {
        "report_id": "sat-1",
        "raw_narrative": "Road access disrupted after heavy flooding near the bridge",
        "source_type": "web_identified",
        "latitude": 15.5,
        "longitude": 32.56,
        "language": "en",
        "timestamp": "2026-03-07T12:00:00Z",
        "status": PipelineStatus.INGESTED,
        "node_trace": [],
        "error": None,
        "normalized": None,
        "translation": None,
        "classification": None,
        "geocoded_location": None,
        "duplicates_found": [],
        "corroboration_hits": [],
        "weather_data": {"flood_risk": 0.76},
        "satellite_data": None,
        "satellite_eo_features": {"flood_score": 0.82, "change_score": 0.71},
        "satellite_quality": {"quality_score": 0.88},
        "satellite_alert": None,
        "confidence_breakdown": None,
        "confidence_scores": None,
        "cluster_id": None,
    }
    base.update(kw)
    return base


def test_pipeline_populates_satellite_alert_and_confidence():
    result = build_pipeline().invoke(_state())
    assert result["status"] == PipelineStatus.PUBLISHED
    assert result["satellite_alert"] is not None
    assert result["confidence_breakdown"]["satellite_corroboration"] > 0
