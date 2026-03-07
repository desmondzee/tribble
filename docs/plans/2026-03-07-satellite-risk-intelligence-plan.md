# Satellite Risk Intelligence Agent — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Make pipeline enrichment nodes real (corroborate, enrich_weather, classify, score) and add a GET /api/analysis/dashboard endpoint that returns structured risk zones, corridor advisories, and satellite viewer links for NGO operations.

**Architecture:** Fill 4 pipeline stubs so every civilian report gets multi-source validation (ACLED + weather + satellite + cross-reports). Add a dashboard aggregation endpoint that computes per-cluster risk profiles, pairwise corridor advisories, and Gemini narrative summaries. Satellite viewer URLs let NGOs visually inspect raw imagery.

**Tech Stack:** Python 3.12, FastAPI, LangGraph, Supabase (PostGIS), Gemini LLM, Sentinel-2 via Planetary Computer, Open-Meteo weather

---

## Task 1: Add `report_type` and `validation_context` to PipelineState

**Files:**
- Modify: `backend/src/tribble/pipeline/state.py`
- Test: `backend/tests/test_pipeline.py`

**Step 1: Write the failing test**

Add to `backend/tests/test_pipeline.py`:

```python
def test_state_has_report_type_and_validation():
    s = _state(
        raw_narrative="Water station destroyed",
        report_type="water_need",
    )
    assert s["report_type"] == "water_need"
    assert s.get("validation_context") is None
```

**Step 2: Run test to verify it fails**

Run: `cd /Users/james/tribble/backend && python -m pytest tests/test_pipeline.py::test_state_has_report_type_and_validation -v`
Expected: FAIL — `report_type` not a valid key in PipelineState TypedDict

**Step 3: Add fields to PipelineState**

In `backend/src/tribble/pipeline/state.py`, add to PipelineState class:

```python
    report_type: str | None
    validation_context: dict | None
```

**Step 4: Update `_state` helper in test file**

Update the `_state()` function in `test_pipeline.py` to include defaults:

```python
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
```

Also update `_build_pipeline_state` in `backend/src/tribble/services/worker.py` to include:

```python
        "report_type": None,
        "validation_context": None,
```

**Step 5: Run tests to verify they pass**

Run: `cd /Users/james/tribble/backend && python -m pytest tests/test_pipeline.py -v`
Expected: ALL PASS

**Step 6: Commit**

```bash
git add backend/src/tribble/pipeline/state.py backend/src/tribble/services/worker.py backend/tests/test_pipeline.py
git commit -m "feat(pipeline): add report_type and validation_context to PipelineState"
```

---

## Task 2: Implement `classify` node

**Files:**
- Modify: `backend/src/tribble/pipeline/graph.py`
- Test: `backend/tests/test_pipeline.py`

**Step 1: Write the failing tests**

Add to `backend/tests/test_pipeline.py`:

```python
from tribble.pipeline.graph import classify

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
```

**Step 2: Run tests to verify they fail**

Run: `cd /Users/james/tribble/backend && python -m pytest tests/test_pipeline.py::test_classify_shelling -v`
Expected: FAIL — classify returns empty categories

**Step 3: Implement classify node**

Replace the `classify` function in `backend/src/tribble/pipeline/graph.py`:

```python
REPORT_TYPE_CATEGORIES: dict[str, list[str]] = {
    "shelling": ["security"],
    "gunfire": ["security"],
    "food_need": ["food"],
    "water_need": ["water_sanitation"],
    "medical_need": ["health"],
    "shelter_need": ["shelter"],
    "displacement": ["displacement"],
    "infrastructure_damage": ["infrastructure"],
    "aid_blocked": ["access"],
    "looting": ["security", "food"],
    "missing_persons": ["security"],
}

SEVERITY_URGENCY: dict[str, str] = {
    "critical": "critical",
    "high": "high",
    "medium": "medium",
    "low": "low",
}


@_safe_node
def classify(state: PipelineState) -> dict:
    trace = state["node_trace"] + ["classify"]
    report_type = state.get("report_type") or ""
    categories = list(REPORT_TYPE_CATEGORIES.get(report_type, []))

    # Extract severity from narrative metadata or default
    narrative = state.get("raw_narrative") or ""
    severity_hints = ["critical", "high", "medium", "low"]
    urgency = "medium"
    for hint in severity_hints:
        if hint in narrative.lower():
            urgency = SEVERITY_URGENCY[hint]
            break

    return {
        "status": PipelineStatus.CLASSIFIED,
        "node_trace": trace,
        "classification": {
            "crisis_categories": categories,
            "help_categories": [],
            "urgency_hint": urgency,
        },
    }
```

**Step 4: Run tests to verify they pass**

Run: `cd /Users/james/tribble/backend && python -m pytest tests/test_pipeline.py -k "classify" -v`
Expected: ALL PASS

**Step 5: Commit**

```bash
git add backend/src/tribble/pipeline/graph.py backend/tests/test_pipeline.py
git commit -m "feat(pipeline): implement classify node with report_type category mapping"
```

---

## Task 3: Implement `corroborate` node

**Files:**
- Modify: `backend/src/tribble/pipeline/graph.py`
- Test: `backend/tests/test_pipeline.py`

**Step 1: Write the failing tests**

Add to `backend/tests/test_pipeline.py`:

```python
from tribble.pipeline.graph import corroborate, ACLED_CORROBORATION_MAP, compute_corroboration_score

def test_acled_corroboration_map_shelling():
    assert "shelling" in ACLED_CORROBORATION_MAP["shelling"]


def test_acled_corroboration_map_water_need_empty():
    assert ACLED_CORROBORATION_MAP.get("water_need") is None


def test_compute_corroboration_score_with_hits():
    hits = [
        {"source": "acled", "severity": "critical", "distance_km": 1.5},
        {"source": "acled", "severity": "high", "distance_km": 3.0},
        {"source": "civilian_report", "distance_km": 2.0},
    ]
    score = compute_corroboration_score(hits)
    assert 0.0 < score <= 1.0
    assert score > 0.5  # multiple hits = strong corroboration


def test_compute_corroboration_score_empty():
    assert compute_corroboration_score([]) == 0.0


def test_corroborate_node_returns_hits_list():
    s = _state(raw_narrative="Shelling near market", report_type="shelling")
    result = corroborate(s)
    assert isinstance(result["corroboration_hits"], list)
    assert result["status"] == PipelineStatus.CORROBORATED
```

**Step 2: Run tests to verify they fail**

Run: `cd /Users/james/tribble/backend && python -m pytest tests/test_pipeline.py -k "corroborat" -v`
Expected: FAIL — ACLED_CORROBORATION_MAP not defined

**Step 3: Implement corroborate node**

Add to `backend/src/tribble/pipeline/graph.py`:

```python
import math

# Which ACLED ontology_classes corroborate which civilian report types.
# None = ACLED cannot corroborate this type (use satellite/weather instead).
ACLED_CORROBORATION_MAP: dict[str, list[str] | None] = {
    "shelling": ["shelling"],
    "gunfire": ["armed_conflict"],
    "infrastructure_damage": ["shelling", "armed_conflict"],
    "looting": ["armed_conflict"],
    "displacement": ["armed_conflict", "shelling"],
    "aid_blocked": ["aid_obstruction"],
    "shelter_need": ["armed_conflict", "shelling"],
    "missing_persons": ["armed_conflict"],
    "medical_need": ["armed_conflict"],
    "food_need": ["aid_obstruction", "armed_conflict"],
}


def _haversine_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Approximate distance in km between two points."""
    r = 6371.0
    dlat = math.radians(lat2 - lat1)
    dlon = math.radians(lon2 - lon1)
    a = math.sin(dlat / 2) ** 2 + math.cos(math.radians(lat1)) * math.cos(math.radians(lat2)) * math.sin(dlon / 2) ** 2
    return r * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))


def compute_corroboration_score(hits: list[dict]) -> float:
    """Compute 0-1 corroboration score from a list of corroboration hits."""
    if not hits:
        return 0.0
    score = 0.0
    for h in hits:
        dist = float(h.get("distance_km", 5.0))
        severity = h.get("severity", "low")
        # Closer + higher severity = stronger signal
        proximity_factor = max(0.0, 1.0 - (dist / 5.0))  # decays to 0 at 5km
        severity_weight = {"critical": 1.0, "high": 0.7, "medium": 0.4, "low": 0.2}.get(severity, 0.3)
        score += proximity_factor * severity_weight
    return min(score, 1.0)


@_safe_node
def corroborate(state: PipelineState) -> dict:
    """Cross-reference report against ACLED events and nearby civilian reports.

    NOTE: This is a local-data-only implementation. It checks the report_type
    against the ACLED corroboration map but does not query Supabase (the pipeline
    runs synchronously without DB access). The corroboration_hits list is
    populated by the worker when satellite/weather/ACLED context is injected
    into the pipeline state before invocation. For now, we compute the score
    from whatever hits are already in state.
    """
    trace = state["node_trace"] + ["corroborate"]
    hits = list(state.get("corroboration_hits") or [])
    report_type = state.get("report_type") or ""
    matching_classes = ACLED_CORROBORATION_MAP.get(report_type)

    cross_source_corroboration = compute_corroboration_score(hits)

    return {
        "status": PipelineStatus.CORROBORATED,
        "node_trace": trace,
        "corroboration_hits": hits,
        "corroboration_score": cross_source_corroboration,
        "corroboration_acled_classes": matching_classes,
    }
```

**Step 4: Run tests to verify they pass**

Run: `cd /Users/james/tribble/backend && python -m pytest tests/test_pipeline.py -k "corroborat" -v`
Expected: ALL PASS

**Step 5: Run full pipeline test to check nothing broke**

Run: `cd /Users/james/tribble/backend && python -m pytest tests/test_pipeline.py -v`
Expected: ALL PASS

**Step 6: Commit**

```bash
git add backend/src/tribble/pipeline/graph.py backend/tests/test_pipeline.py
git commit -m "feat(pipeline): implement corroborate node with ACLED matching + proximity scoring"
```

---

## Task 4: Implement `enrich_weather` node

**Files:**
- Modify: `backend/src/tribble/pipeline/graph.py`
- Test: `backend/tests/test_pipeline.py`

**Step 1: Write the failing tests**

Add to `backend/tests/test_pipeline.py`:

```python
from tribble.pipeline.graph import enrich_weather

def test_enrich_weather_with_data():
    s = _state(
        raw_narrative="Flooding in camp area",
        weather_data={
            "temperature_c": 35.0,
            "humidity_pct": 90.0,
            "wind_speed_ms": 5.0,
            "condition": "Rain",
            "precipitation_mm": 45.0,
        },
    )
    result = enrich_weather(s)
    assert result["status"] == PipelineStatus.WEATHER_ENRICHED
    assert result["weather_data"]["flood_risk"] > 0.5
    assert "route_disruption_risk" in result["weather_data"]


def test_enrich_weather_without_data():
    s = _state(raw_narrative="Something happened")
    result = enrich_weather(s)
    assert result["status"] == PipelineStatus.WEATHER_ENRICHED
    assert result["weather_data"] is None or result["weather_data"].get("flood_risk", 0) == 0
```

**Step 2: Run tests to verify they fail**

Run: `cd /Users/james/tribble/backend && python -m pytest tests/test_pipeline.py::test_enrich_weather_with_data -v`
Expected: FAIL — current enrich_weather is a no-op stub

**Step 3: Implement enrich_weather node**

Replace the `enrich_weather` function in `backend/src/tribble/pipeline/graph.py`:

```python
from tribble.ingest.weather import compute_weather_risks, WeatherConditions


@_safe_node
def enrich_weather(state: PipelineState) -> dict:
    """Compute weather risk scores from weather data in pipeline state.

    Weather data is injected into state by the worker before pipeline invocation.
    If present, compute flood/storm/heat/route_disruption risk scores.
    """
    trace = state["node_trace"] + ["enrich_weather"]
    raw_weather = state.get("weather_data")

    if not raw_weather or not isinstance(raw_weather, dict):
        return {"status": PipelineStatus.WEATHER_ENRICHED, "node_trace": trace}

    conditions = WeatherConditions(
        temperature_c=float(raw_weather.get("temperature_c", 25.0)),
        humidity_pct=float(raw_weather.get("humidity_pct", 50.0)),
        wind_speed_ms=float(raw_weather.get("wind_speed_ms", 2.0)),
        condition=str(raw_weather.get("condition", "Clear")),
        precipitation_mm=float(raw_weather.get("precipitation_mm", 0.0)),
    )
    risks = compute_weather_risks(conditions)

    enriched = {
        **raw_weather,
        "flood_risk": risks.flood_risk,
        "storm_risk": risks.storm_risk,
        "heat_risk": risks.heat_risk,
        "route_disruption_risk": risks.route_disruption_risk,
    }
    return {
        "status": PipelineStatus.WEATHER_ENRICHED,
        "node_trace": trace,
        "weather_data": enriched,
    }
```

**Step 4: Run tests to verify they pass**

Run: `cd /Users/james/tribble/backend && python -m pytest tests/test_pipeline.py -k "weather" -v`
Expected: ALL PASS

**Step 5: Commit**

```bash
git add backend/src/tribble/pipeline/graph.py backend/tests/test_pipeline.py
git commit -m "feat(pipeline): implement enrich_weather node with risk computation"
```

---

## Task 5: Rewire `score` node with real data

**Files:**
- Modify: `backend/src/tribble/pipeline/graph.py`
- Test: `backend/tests/test_pipeline.py`

**Step 1: Write the failing tests**

Add to `backend/tests/test_pipeline.py`:

```python
def test_score_uses_real_source_prior():
    s = _state(
        raw_narrative="Water shortage reported in area for many days now",
        source_type="acled_historical",
    )
    result = build_pipeline().invoke(s)
    assert result["confidence_breakdown"]["source_prior"] == 0.95  # not hardcoded 0.5


def test_score_uses_corroboration_data():
    s = _state(
        raw_narrative="Heavy shelling reported near the market area",
        source_type="web_identified",
        corroboration_hits=[
            {"source": "acled", "severity": "critical", "distance_km": 1.0},
        ],
    )
    result = build_pipeline().invoke(s)
    assert result["confidence_breakdown"]["cross_source_corroboration"] > 0.0


def test_score_completeness_long_narrative():
    s = _state(
        raw_narrative="This is a detailed report about the situation. " * 5,  # >50 words
        source_type="web_identified",
    )
    result = build_pipeline().invoke(s)
    assert result["confidence_breakdown"]["completeness_score"] >= 0.8


def test_score_builds_validation_context():
    s = _state(
        raw_narrative="Water station destroyed no clean water",
        report_type="water_need",
        source_type="web_identified",
    )
    result = build_pipeline().invoke(s)
    assert result.get("validation_context") is not None
    assert "satellite" in result["validation_context"]
    assert "weather" in result["validation_context"]
    assert "acled" in result["validation_context"]
```

**Step 2: Run tests to verify they fail**

Run: `cd /Users/james/tribble/backend && python -m pytest tests/test_pipeline.py::test_score_uses_real_source_prior -v`
Expected: FAIL — source_prior is hardcoded 0.5

**Step 3: Implement rewired score node**

Replace the `score` function in `backend/src/tribble/pipeline/graph.py`:

```python
from tribble.models.confidence import ConfidenceBreakdown, SOURCE_PRIORS, compute_access_difficulty

# El Fasher bounding box for geospatial consistency check
EL_FASHER_BBOX = {"lat_min": 13.3, "lat_max": 14.0, "lon_min": 24.8, "lon_max": 26.0}

# Satellite validation: which report types can satellite corroborate, and how
SATELLITE_VALIDATION = {
    "water_need": {"index": "ndwi", "direction": "declining", "label": "NDWI decline indicates water body recession"},
    "food_need": {"index": "ndvi", "direction": "declining", "label": "NDVI decline indicates vegetation stress", "min_baseline": 0.25},
    "infrastructure_damage": {"index": "change_score", "direction": "rising", "label": "Change detection suggests structural damage"},
    "shelter_need": {"index": "ndwi", "direction": "rising", "label": "NDWI rise indicates flooding of built areas"},
}

# Weather validation: which report types weather can corroborate
WEATHER_VALIDATION = {
    "water_need": {"risk": "precipitation_mm", "check": "low", "threshold": 5.0, "label": "Low precipitation confirms water scarcity"},
    "shelter_need": {"risk": "storm_risk", "check": "high", "threshold": 0.5, "label": "Storm risk confirms shelter need"},
    "displacement": {"risk": "flood_risk", "check": "high", "threshold": 0.5, "label": "Flood risk supports displacement reports"},
    "aid_blocked": {"risk": "route_disruption_risk", "check": "high", "threshold": 0.4, "label": "Route disruption confirms access difficulty"},
    "food_need": {"risk": "precipitation_mm", "check": "low", "threshold": 5.0, "label": "Drought conditions support food insecurity"},
}


def _build_validation_context(state: PipelineState) -> dict:
    """Build per-report validation context showing what each source confirms."""
    report_type = state.get("report_type") or ""
    sat_data = state.get("satellite_data") or {}
    weather = state.get("weather_data") or {}
    hits = state.get("corroboration_hits") or []
    corr_classes = state.get("corroboration_acled_classes")

    context: dict = {}

    # Satellite validation
    sat_rule = SATELLITE_VALIDATION.get(report_type)
    if sat_rule:
        index_key = sat_rule["index"]
        value = float(sat_data.get(index_key, 0.0))
        min_baseline = sat_rule.get("min_baseline")
        # Check if baseline vegetation is too low for this signal
        if min_baseline and float(sat_data.get("ndvi_baseline", 0.0)) < min_baseline:
            context["satellite"] = {"confirmed": False, "signal": "Arid region — satellite vegetation signal not meaningful", "confidence": 0.0}
        else:
            confirmed = (value < 0 if sat_rule["direction"] == "declining" else value > 0.15)
            context["satellite"] = {"confirmed": confirmed, "signal": sat_rule["label"], "confidence": min(abs(value), 1.0) if confirmed else 0.0}
    else:
        context["satellite"] = {"confirmed": False, "signal": "Satellite cannot directly validate this report type", "confidence": 0.0}

    # Weather validation
    wx_rule = WEATHER_VALIDATION.get(report_type)
    if wx_rule and weather:
        value = float(weather.get(wx_rule["risk"], 0.0))
        if wx_rule["check"] == "low":
            confirmed = value < wx_rule["threshold"]
        else:
            confirmed = value > wx_rule["threshold"]
        context["weather"] = {"confirmed": confirmed, "signal": wx_rule["label"], "confidence": 0.7 if confirmed else 0.0}
    else:
        context["weather"] = {"confirmed": False, "signal": "No weather validation for this report type", "confidence": 0.0}

    # ACLED validation
    acled_hits = [h for h in hits if h.get("source") == "acled"]
    if corr_classes and acled_hits:
        best = max(acled_hits, key=lambda h: {"critical": 4, "high": 3, "medium": 2, "low": 1}.get(h.get("severity", "low"), 0))
        context["acled"] = {
            "confirmed": True,
            "signal": f"ACLED {best.get('severity', '')} event within {best.get('distance_km', '?')}km",
            "confidence": min(compute_corroboration_score(acled_hits), 1.0),
        }
    elif corr_classes is None:
        context["acled"] = {"confirmed": False, "signal": "ACLED cannot validate this report type", "confidence": 0.0}
    else:
        context["acled"] = {"confirmed": False, "signal": "No matching ACLED events nearby", "confidence": 0.0}

    return context


@_safe_node
def score(state: PipelineState) -> dict:
    trace = state["node_trace"] + ["score"]

    # Real source prior
    source_type = state.get("source_type") or "web_anonymous"
    source_prior = SOURCE_PRIORS.get(source_type, 0.5)

    # Completeness from word count
    word_count = len((state.get("raw_narrative") or "").split())
    if word_count > 50:
        completeness = 0.8
    elif word_count > 20:
        completeness = 0.6
    else:
        completeness = 0.4

    # Geospatial consistency
    lat = state.get("latitude", 0.0)
    lon = state.get("longitude", 0.0)
    in_bbox = (
        EL_FASHER_BBOX["lat_min"] <= lat <= EL_FASHER_BBOX["lat_max"]
        and EL_FASHER_BBOX["lon_min"] <= lon <= EL_FASHER_BBOX["lon_max"]
    )
    geospatial = 0.8 if in_bbox else 0.4

    # Cross-source corroboration from corroborate node
    corroboration = float(state.get("corroboration_score", 0.0))

    # Weather plausibility
    weather = state.get("weather_data") or {}
    weather_plausibility = 0.5  # neutral default
    report_type = state.get("report_type") or ""
    if weather:
        flood_risk = float(weather.get("flood_risk", 0.0))
        if report_type in ("water_need", "food_need") and flood_risk < 0.2:
            weather_plausibility = 0.7  # dry weather confirms water/food scarcity
        elif report_type in ("displacement", "shelter_need") and flood_risk > 0.5:
            weather_plausibility = 0.8  # flood risk confirms displacement/shelter
        elif report_type in ("shelling", "gunfire"):
            weather_plausibility = 0.5  # weather neutral for conflict reports

    # Satellite corroboration from enrich_satellite
    sat_data = state.get("satellite_data") or {}
    satellite_corr = float(sat_data.get("quality_score", 0.0)) * 0.5

    # Fusion
    fusion = fuse_satellite_weather_report_signals(
        satellite=state.get("satellite_data"),
        weather=state.get("weather_data"),
        reports={"cross_source_corroboration": corroboration},
    )
    satellite_alert_score = float(fusion["alert_score"])
    if satellite_corr < satellite_alert_score:
        satellite_corr = satellite_alert_score

    weather_risk = float(weather.get("flood_risk", 0.3))
    access_difficulty = compute_access_difficulty(weather_risk, satellite_corr)

    breakdown = ConfidenceBreakdown(
        source_prior=source_prior,
        spam_score=0.05,
        duplication_score=0.0,
        completeness_score=completeness,
        geospatial_consistency=geospatial,
        temporal_consistency=0.7,
        cross_source_corroboration=corroboration,
        weather_plausibility=weather_plausibility,
        satellite_corroboration=satellite_corr,
    )
    publishability = breakdown.compute_publishability()

    # Urgency from classification
    classification = state.get("classification") or {}
    urgency_hint = classification.get("urgency_hint", "medium")
    urgency_map = {"critical": 0.95, "high": 0.75, "medium": 0.5, "low": 0.25}
    urgency = urgency_map.get(urgency_hint, 0.5)

    # Validation context
    validation_context = _build_validation_context(state)

    return {
        "status": PipelineStatus.SCORED,
        "node_trace": trace,
        "satellite_alert": fusion,
        "confidence_breakdown": breakdown.model_dump(),
        "confidence_scores": {
            "publishability": publishability,
            "urgency": urgency,
            "access_difficulty": access_difficulty,
        },
        "validation_context": validation_context,
    }
```

**Step 4: Run tests to verify they pass**

Run: `cd /Users/james/tribble/backend && python -m pytest tests/test_pipeline.py -v`
Expected: ALL PASS

**Step 5: Commit**

```bash
git add backend/src/tribble/pipeline/graph.py backend/tests/test_pipeline.py
git commit -m "feat(pipeline): rewire score node with real enrichment data + validation context"
```

---

## Task 6: Persist `validation_context` in pipeline outputs

**Files:**
- Modify: `backend/src/tribble/services/persistence.py`
- Test: `backend/tests/test_pipeline.py`

**Step 1: Write the failing test**

Add to `backend/tests/test_pipeline.py`:

```python
def test_full_flow_includes_validation_context():
    r = build_pipeline().invoke(
        _state(
            raw_narrative="Water station destroyed, no clean water for three days running",
            report_type="water_need",
            source_type="whatsapp_identified",
        )
    )
    assert r["status"] == PipelineStatus.PUBLISHED
    assert r["validation_context"] is not None
    assert "satellite" in r["validation_context"]
    assert r["confidence_breakdown"]["source_prior"] == 0.65  # whatsapp_identified prior
```

**Step 2: Run test to verify it passes (or fails on source_prior)**

Run: `cd /Users/james/tribble/backend && python -m pytest tests/test_pipeline.py::test_full_flow_includes_validation_context -v`

**Step 3: Update persistence to store validation_context**

In `backend/src/tribble/services/persistence.py`, update the `persist_pipeline_outputs` function to include `validation_context` in the breakdown dict:

```python
    confidence_breakdown = pipeline_result.get("confidence_breakdown")
    validation_context = pipeline_result.get("validation_context")
    if not verification_run_id or not confidence_scores or not confidence_breakdown:
        return

    breakdown_with_validation = {**confidence_breakdown}
    if validation_context:
        breakdown_with_validation["validation_context"] = validation_context

    db.table("confidence_scores").insert(
        {
            "report_id": report_id,
            "verification_run_id": verification_run_id,
            "publishability": float(confidence_scores.get("publishability", 0.0)),
            "urgency": float(confidence_scores.get("urgency", 0.0)),
            "access_difficulty": float(confidence_scores.get("access_difficulty", 0.0)),
            "breakdown": breakdown_with_validation,
        }
    ).execute()
```

**Step 4: Run all tests**

Run: `cd /Users/james/tribble/backend && python -m pytest tests/ -v`
Expected: ALL PASS

**Step 5: Commit**

```bash
git add backend/src/tribble/services/persistence.py backend/tests/test_pipeline.py
git commit -m "feat(persistence): store validation_context in confidence_scores breakdown"
```

---

## Task 7: Build dashboard risk scoring functions

**Files:**
- Create: `backend/src/tribble/services/risk_scoring.py`
- Test: `backend/tests/test_risk_scoring.py`

**Step 1: Write the failing tests**

Create `backend/tests/test_risk_scoring.py`:

```python
from tribble.services.risk_scoring import (
    compute_zone_risk_profile,
    compute_corridor_risk,
    classify_baseline_vegetation,
    build_viewer_url,
)


def test_classify_arid():
    assert classify_baseline_vegetation(0.15) == "arid"


def test_classify_vegetated():
    assert classify_baseline_vegetation(0.4) == "vegetated"


def test_classify_boundary():
    assert classify_baseline_vegetation(0.25) == "arid"
    assert classify_baseline_vegetation(0.26) == "vegetated"


def test_zone_risk_profile_conflict_heavy():
    profile = compute_zone_risk_profile(
        acled_events=[
            {"ontology_class": "shelling", "severity": "critical"},
            {"ontology_class": "armed_conflict", "severity": "high"},
        ],
        report_type_counts={"shelling": 10, "water_need": 5, "food_need": 3},
        weather={"flood_risk": 0.2, "storm_risk": 0.1, "heat_risk": 0.6, "route_disruption_risk": 0.3},
        satellite={"ndvi": 0.18, "ndwi": -0.05, "quality_score": 0.8},
        baseline_vegetation="arid",
    )
    assert profile["conflict_risk"] > 0.7
    assert profile["water_scarcity"] > 0.0
    assert 0.0 <= profile["flood_risk"] <= 1.0


def test_zone_risk_profile_food_suppressed_in_arid():
    profile = compute_zone_risk_profile(
        acled_events=[],
        report_type_counts={"food_need": 10},
        weather={"flood_risk": 0.0, "storm_risk": 0.0, "heat_risk": 0.3, "route_disruption_risk": 0.0},
        satellite={"ndvi": 0.12, "ndwi": -0.1, "quality_score": 0.8},
        baseline_vegetation="arid",
    )
    # In arid region, satellite doesn't boost food_insecurity — only reports count
    assert profile["food_insecurity"] > 0.0  # still has reports
    assert profile["food_insecurity"] < 0.8  # but no satellite confirmation


def test_corridor_risk_through_conflict():
    risk = compute_corridor_risk(
        from_centroid=(13.63, 25.35),
        to_centroid=(13.53, 25.24),
        intervening_acled=[
            {"lat": 13.58, "lng": 25.30, "ontology_class": "shelling", "severity": "critical"},
        ],
        intervening_clusters=[
            {"centroid": (13.59, 25.29), "risk_level": "critical"},
        ],
    )
    assert risk["risk_level"] in ("low", "moderate", "high", "critical")
    assert risk["risk_level"] in ("high", "critical")
    assert "shelling" in risk["hazards"]


def test_corridor_risk_clear_path():
    risk = compute_corridor_risk(
        from_centroid=(13.63, 25.35),
        to_centroid=(13.64, 25.36),
        intervening_acled=[],
        intervening_clusters=[],
    )
    assert risk["risk_level"] == "low"


def test_build_viewer_url():
    url = build_viewer_url(bbox=[25.2, 13.5, 25.5, 13.7], date="2024-05-06")
    assert "sentinel-hub" in url or "eo-browser" in url
    assert "2024-05-06" in url
```

**Step 2: Run tests to verify they fail**

Run: `cd /Users/james/tribble/backend && python -m pytest tests/test_risk_scoring.py -v`
Expected: FAIL — module doesn't exist

**Step 3: Implement risk_scoring module**

Create `backend/src/tribble/services/risk_scoring.py`:

```python
"""Risk scoring for dashboard zones and corridors."""

import math
from urllib.parse import urlencode


def classify_baseline_vegetation(ndvi: float) -> str:
    """Classify region vegetation baseline from NDVI value."""
    return "vegetated" if ndvi > 0.25 else "arid"


def _haversine_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    r = 6371.0
    dlat = math.radians(lat2 - lat1)
    dlon = math.radians(lon2 - lon1)
    a = (
        math.sin(dlat / 2) ** 2
        + math.cos(math.radians(lat1)) * math.cos(math.radians(lat2)) * math.sin(dlon / 2) ** 2
    )
    return r * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))


def _point_to_segment_distance_km(
    point: tuple[float, float],
    seg_start: tuple[float, float],
    seg_end: tuple[float, float],
) -> float:
    """Approximate distance from a point to a line segment (in km)."""
    px, py = point
    ax, ay = seg_start
    bx, by = seg_end
    dx, dy = bx - ax, by - ay
    if dx == 0 and dy == 0:
        return _haversine_km(px, py, ax, ay)
    t = max(0.0, min(1.0, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy)))
    proj_lat = ax + t * dx
    proj_lon = ay + t * dy
    return _haversine_km(px, py, proj_lat, proj_lon)


def compute_zone_risk_profile(
    acled_events: list[dict],
    report_type_counts: dict[str, int],
    weather: dict,
    satellite: dict,
    baseline_vegetation: str,
) -> dict[str, float]:
    """Compute composite risk profile for a cluster zone."""
    total_reports = max(sum(report_type_counts.values()), 1)

    # Conflict risk: ACLED density + conflict report types
    conflict_types = {"shelling", "gunfire", "looting", "missing_persons"}
    conflict_report_ratio = sum(report_type_counts.get(t, 0) for t in conflict_types) / total_reports
    acled_severity_scores = [
        {"critical": 1.0, "high": 0.7, "medium": 0.4, "low": 0.2}.get(e.get("severity", "low"), 0.2)
        for e in acled_events
    ]
    acled_signal = min(sum(acled_severity_scores) / 3.0, 1.0) if acled_severity_scores else 0.0
    conflict_risk = min((0.6 * acled_signal) + (0.4 * conflict_report_ratio), 1.0)

    # Water scarcity: report density + weather (low precip) + satellite NDWI
    water_reports = report_type_counts.get("water_need", 0) / total_reports
    ndwi = float(satellite.get("ndwi", 0.0))
    precip_factor = max(0.0, 1.0 - float(weather.get("precipitation_mm", 0.0) if "precipitation_mm" in weather else (1.0 - weather.get("flood_risk", 0.5))) / 20.0) if weather else 0.0
    ndwi_scarcity = max(0.0, -ndwi)  # negative NDWI = less water
    water_scarcity = min((0.5 * water_reports * 3) + (0.25 * precip_factor) + (0.25 * ndwi_scarcity), 1.0)

    # Food insecurity: report density + satellite NDVI (only if vegetated region)
    food_reports = report_type_counts.get("food_need", 0) / total_reports
    ndvi = float(satellite.get("ndvi", 0.0))
    if baseline_vegetation == "vegetated" and ndvi < 0.2:
        ndvi_stress = 0.8  # significant crop stress
    elif baseline_vegetation == "vegetated" and ndvi < 0.3:
        ndvi_stress = 0.4  # moderate stress
    else:
        ndvi_stress = 0.0  # arid region or healthy vegetation
    food_insecurity = min((0.7 * food_reports * 3) + (0.3 * ndvi_stress), 1.0)

    # Flood risk: weather + satellite NDWI rise
    flood_risk_wx = float(weather.get("flood_risk", 0.0))
    ndwi_flood = max(0.0, ndwi) * 2  # positive NDWI = water presence
    flood_risk = min((0.6 * flood_risk_wx) + (0.4 * min(ndwi_flood, 1.0)), 1.0)

    # Infrastructure damage: reports + ACLED shelling + satellite change
    infra_reports = report_type_counts.get("infrastructure_damage", 0) / total_reports
    shelling_events = sum(1 for e in acled_events if e.get("ontology_class") == "shelling")
    shelling_signal = min(shelling_events / 2.0, 1.0)
    change = float(satellite.get("change_score", 0.0))
    infrastructure_damage = min((0.4 * infra_reports * 3) + (0.4 * shelling_signal) + (0.2 * change), 1.0)

    # Access difficulty: route disruption + conflict
    route_disruption = float(weather.get("route_disruption_risk", 0.0))
    aid_blocked_ratio = report_type_counts.get("aid_blocked", 0) / total_reports
    access_difficulty = min((0.4 * route_disruption) + (0.3 * conflict_risk) + (0.3 * aid_blocked_ratio * 3), 1.0)

    return {
        "conflict_risk": round(conflict_risk, 3),
        "water_scarcity": round(water_scarcity, 3),
        "food_insecurity": round(food_insecurity, 3),
        "flood_risk": round(flood_risk, 3),
        "infrastructure_damage": round(infrastructure_damage, 3),
        "access_difficulty": round(access_difficulty, 3),
    }


def compute_corridor_risk(
    from_centroid: tuple[float, float],
    to_centroid: tuple[float, float],
    intervening_acled: list[dict],
    intervening_clusters: list[dict],
) -> dict:
    """Compute risk for traveling between two cluster centroids."""
    hazards: list[str] = []
    max_severity = 0.0

    # Check ACLED events near the path
    for event in intervening_acled:
        elat, elng = float(event.get("lat", 0)), float(event.get("lng", 0))
        dist = _point_to_segment_distance_km((elat, elng), from_centroid, to_centroid)
        if dist < 5.0:
            ontology = event.get("ontology_class", "armed_conflict")
            if ontology not in hazards:
                hazards.append(ontology)
            sev = {"critical": 1.0, "high": 0.7, "medium": 0.4, "low": 0.2}.get(
                event.get("severity", "low"), 0.2
            )
            proximity_factor = max(0.0, 1.0 - dist / 5.0)
            max_severity = max(max_severity, sev * proximity_factor)

    # Check high-risk clusters near the path
    for cluster in intervening_clusters:
        clat, clng = cluster["centroid"]
        dist = _point_to_segment_distance_km((clat, clng), from_centroid, to_centroid)
        if dist < 5.0:
            risk = cluster.get("risk_level", "low")
            cluster_sev = {"critical": 1.0, "high": 0.7, "moderate": 0.4, "low": 0.1}.get(risk, 0.1)
            max_severity = max(max_severity, cluster_sev)

    # Classify risk level
    if max_severity >= 0.8:
        risk_level = "critical"
    elif max_severity >= 0.5:
        risk_level = "high"
    elif max_severity >= 0.2:
        risk_level = "moderate"
    else:
        risk_level = "low"

    return {
        "risk_level": risk_level,
        "risk_score": round(max_severity, 3),
        "hazards": hazards,
        "distance_km": round(_haversine_km(*from_centroid, *to_centroid), 1),
    }


def build_viewer_url(bbox: list[float], date: str) -> str:
    """Build EO Browser URL for visual satellite inspection."""
    params = {
        "zoom": 12,
        "lat": (bbox[1] + bbox[3]) / 2,
        "lng": (bbox[0] + bbox[2]) / 2,
        "themeId": "DEFAULT-THEME",
        "toTime": f"{date}T23:59:59.999Z",
        "datasetId": "S2L2A",
    }
    return f"https://apps.sentinel-hub.com/eo-browser/?{urlencode(params)}"
```

**Step 4: Run tests to verify they pass**

Run: `cd /Users/james/tribble/backend && python -m pytest tests/test_risk_scoring.py -v`
Expected: ALL PASS

**Step 5: Commit**

```bash
git add backend/src/tribble/services/risk_scoring.py backend/tests/test_risk_scoring.py
git commit -m "feat(services): add risk_scoring module for dashboard zones and corridors"
```

---

## Task 8: Build `GET /api/analysis/dashboard` endpoint

**Files:**
- Modify: `backend/src/tribble/api/analysis.py`
- Test: `backend/tests/test_api_dashboard.py`

**Step 1: Write the failing test**

Create `backend/tests/test_api_dashboard.py`:

```python
from unittest.mock import patch, MagicMock
from fastapi.testclient import TestClient
from tribble.main import app

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
    mock_gemini.generate = MagicMock()
    # Make generate an async mock
    import asyncio
    from tribble.services.llm_provider import LLMResult
    mock_gemini.generate.return_value = asyncio.coroutine(
        lambda: LLMResult(status="ok", text="Risk assessment narrative", model="gemini-2.5-flash", metadata={"provider": "gemini"})
    )()
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
```

**Step 2: Run test to verify it fails**

Run: `cd /Users/james/tribble/backend && python -m pytest tests/test_api_dashboard.py -v`
Expected: FAIL — endpoint doesn't exist

**Step 3: Implement dashboard endpoint**

Replace the satellite analysis section in `backend/src/tribble/api/analysis.py` (remove the old `POST /satellite` endpoint and related functions, replace with dashboard):

Keep the existing imports and `run_analysis` endpoint. Remove `_closest_weather`, `_build_satellite_prompt`, and `run_satellite_analysis`. Replace with:

```python
from tribble.services.risk_scoring import (
    classify_baseline_vegetation,
    compute_corridor_risk,
    compute_zone_risk_profile,
    build_viewer_url,
)


def _closest_weather(scene_date: str, weather: list[dict]) -> dict | None:
    """Return the weather record closest in date to a satellite scene."""
    if not weather or not scene_date:
        return None
    try:
        target = datetime.fromisoformat(scene_date).date()
    except (ValueError, TypeError):
        return None
    best, best_delta = None, None
    for w in weather:
        try:
            d = datetime.fromisoformat(w["date"]).date()
        except (ValueError, TypeError, KeyError):
            continue
        delta = abs((d - target).days)
        if best_delta is None or delta < best_delta:
            best, best_delta = w, delta
    return best


def _haversine_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    import math
    r = 6371.0
    dlat = math.radians(lat2 - lat1)
    dlon = math.radians(lon2 - lon1)
    a = math.sin(dlat / 2) ** 2 + math.cos(math.radians(lat1)) * math.cos(math.radians(lat2)) * math.sin(dlon / 2) ** 2
    return r * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))


def _risk_level_from_profile(profile: dict) -> str:
    max_risk = max(profile.values())
    if max_risk >= 0.8:
        return "critical"
    if max_risk >= 0.6:
        return "high"
    if max_risk >= 0.3:
        return "moderate"
    return "low"


@router.get("/dashboard")
async def get_dashboard():
    """Operational dashboard: risk zones, corridor advisories, satellite viewer links."""
    settings = get_settings()

    try:
        sb = get_supabase()
    except RuntimeError:
        raise HTTPException(status_code=503, detail="Supabase not configured")

    # Fetch all data sources
    clusters = (sb.table("incident_clusters").select("*").execute()).data or []
    scenes = (sb.table("satellite_scenes").select("*").order("acquisition_date").execute()).data or []
    weather = (sb.table("weather_data").select("*").order("date").execute()).data or []
    acled_events = (sb.table("events").select("*").execute()).data or []
    reports = (sb.table("civilian_reports").select("*").execute()).data or []

    if not clusters:
        raise HTTPException(status_code=404, detail="No incident clusters available. Run seed + pipeline first.")

    # Determine baseline vegetation from earliest satellite scene
    baseline_ndvi = float(scenes[0].get("ndvi", 0.15)) if scenes else 0.15
    baseline_veg = classify_baseline_vegetation(baseline_ndvi)

    # Build zones
    zones = []
    for cluster in clusters:
        c_lat = float(cluster.get("centroid_lat", 0))
        c_lng = float(cluster.get("centroid_lng", 0))
        c_radius = float(cluster.get("radius_km", 5.0))

        # Find ACLED events near this cluster
        nearby_acled = [
            e for e in acled_events
            if _haversine_km(c_lat, c_lng, float(e.get("lat", 0)), float(e.get("lng", 0))) <= c_radius + 2
        ]

        # Count report types in this cluster's area
        nearby_reports = [
            r for r in reports
            if _haversine_km(c_lat, c_lng, float(r.get("lat", 0)), float(r.get("lng", 0))) <= c_radius
        ]
        report_type_counts: dict[str, int] = {}
        for r in nearby_reports:
            rt = r.get("report_type", "unknown")
            report_type_counts[rt] = report_type_counts.get(rt, 0) + 1

        # Find closest satellite scene
        closest_scene = None
        min_dist = float("inf")
        for s in scenes:
            d = _haversine_km(c_lat, c_lng, float(s.get("lat", 0)), float(s.get("lng", 0)))
            if d < min_dist:
                min_dist, closest_scene = d, s

        # Find closest weather
        closest_wx = _closest_weather(
            cluster.get("last_updated", ""),
            weather,
        ) or {}

        # Compute risk profile
        sat_data = {
            "ndvi": float(closest_scene.get("ndvi", 0)) if closest_scene else 0.0,
            "ndwi": float(closest_scene.get("ndwi", 0)) if closest_scene else 0.0,
            "quality_score": float(closest_scene.get("quality_score", 0)) if closest_scene else 0.0,
            "change_score": 0.0,
        }
        risk_profile = compute_zone_risk_profile(
            acled_events=nearby_acled,
            report_type_counts=report_type_counts,
            weather=closest_wx,
            satellite=sat_data,
            baseline_vegetation=baseline_veg,
        )
        risk_level = _risk_level_from_profile(risk_profile)
        top_risks = sorted(risk_profile, key=risk_profile.get, reverse=True)[:2]

        # Satellite context with viewer URL
        satellite_context = {"scenes": [], "change_detection": None, "baseline_vegetation": baseline_veg, "viewer_url": None}
        if closest_scene:
            satellite_context["scenes"] = [{
                "acquisition_date": closest_scene.get("acquisition_date"),
                "tile_url": closest_scene.get("tile_url"),
                "bbox": closest_scene.get("bbox"),
                "cloud_cover_pct": closest_scene.get("cloud_cover_pct"),
                "ndvi": closest_scene.get("ndvi"),
                "ndwi": closest_scene.get("ndwi"),
                "quality_score": closest_scene.get("quality_score"),
            }]
            bbox = closest_scene.get("bbox")
            if bbox and isinstance(bbox, list) and len(bbox) == 4:
                satellite_context["viewer_url"] = build_viewer_url(bbox, closest_scene.get("acquisition_date", ""))

            # Change detection if multiple scenes
            if len(scenes) >= 2:
                first, last = scenes[0], scenes[-1]
                satellite_context["change_detection"] = {
                    "ndvi_delta": round(float(last.get("ndvi", 0)) - float(first.get("ndvi", 0)), 4),
                    "ndwi_delta": round(float(last.get("ndwi", 0)) - float(first.get("ndwi", 0)), 4),
                    "flood_score": compute_flood_change_scores(
                        ndwi_before=float(first.get("ndwi", 0)),
                        ndwi_after=float(last.get("ndwi", 0)),
                        mndwi_before=float(first.get("mndwi", 0)),
                        mndwi_after=float(last.get("mndwi", 0)),
                    )["flood_score"],
                }

        # Corroboration summary
        acled_severities = [e.get("severity", "low") for e in nearby_acled]
        severity_order = {"critical": 4, "high": 3, "medium": 2, "low": 1}
        acled_max = max(acled_severities, key=lambda s: severity_order.get(s, 0)) if acled_severities else None

        corroboration = {
            "acled_events_nearby": len(nearby_acled),
            "acled_severity_max": acled_max,
            "cross_report_density": min(len(nearby_reports) / 50.0, 1.0),
            "satellite_confirmed": [k for k in ["infrastructure_damage", "flood_risk", "water_scarcity"] if risk_profile.get(k, 0) > 0.5 and closest_scene],
            "weather_confirmed": [k for k in ["flood_risk", "water_scarcity"] if risk_profile.get(k, 0) > 0.5 and closest_wx],
        }

        zones.append({
            "cluster_id": cluster.get("id"),
            "location": cluster.get("admin1") or cluster.get("country", "Unknown"),
            "centroid": [c_lat, c_lng],
            "radius_km": c_radius,
            "report_count": cluster.get("report_count", 0),
            "risk_profile": risk_profile,
            "top_risks": top_risks,
            "risk_level": risk_level,
            "corroboration": corroboration,
            "satellite_context": satellite_context,
            "narrative": None,  # filled by Gemini below
        })

    # Corridor advisories between cluster pairs within 25km
    corridors = []
    zone_data_for_corridors = [
        {"centroid": (z["centroid"][0], z["centroid"][1]), "risk_level": z["risk_level"], "location": z["location"]}
        for z in zones
    ]
    for i, z1 in enumerate(zones):
        for z2 in zones[i + 1:]:
            c1 = (z1["centroid"][0], z1["centroid"][1])
            c2 = (z2["centroid"][0], z2["centroid"][1])
            dist = _haversine_km(*c1, *c2)
            if dist > 25.0:
                continue

            # Find ACLED events and clusters near the path between these two
            path_acled = [
                e for e in acled_events
                if _haversine_km(float(e.get("lat", 0)), float(e.get("lng", 0)), (c1[0]+c2[0])/2, (c1[1]+c2[1])/2) < dist
            ]
            path_clusters = [
                zd for j, zd in enumerate(zone_data_for_corridors)
                if j != i and zd["centroid"] != c2
            ]

            corridor = compute_corridor_risk(c1, c2, path_acled, path_clusters)
            corridors.append({
                "from": {"name": z1["location"], "centroid": z1["centroid"]},
                "to": {"name": z2["location"], "centroid": z2["centroid"]},
                "distance_km": corridor["distance_km"],
                "risk_level": corridor["risk_level"],
                "hazards": corridor["hazards"],
                "advisory": None,  # filled by Gemini below
            })

    # Generate Gemini narratives for high-risk zones
    high_risk_zones = [z for z in zones if z["risk_level"] in ("critical", "high")]
    if high_risk_zones and settings.gemini_api_key:
        zone_summaries = "\n".join(
            f"- {z['location']}: risk_level={z['risk_level']}, top_risks={z['top_risks']}, "
            f"acled_events={z['corroboration']['acled_events_nearby']}, reports={z['report_count']}, "
            f"profile={z['risk_profile']}"
            for z in high_risk_zones
        )
        corridor_summaries = "\n".join(
            f"- {c['from']['name']} -> {c['to']['name']}: {c['risk_level']}, hazards={c['hazards']}"
            for c in corridors if c["risk_level"] in ("critical", "high")
        )
        narrative_prompt = f"""You are an NGO operations analyst. Write brief, actionable summaries.

For each zone, write 1-2 sentences about the key risks and what NGOs should prioritize.
For each high-risk corridor, write 1 sentence of routing advice.
End with a 2-3 sentence overall situation summary.

## High-Risk Zones
{zone_summaries}

## High-Risk Corridors
{corridor_summaries or "No high-risk corridors identified."}

Be specific about risk types and actionable. No hedging."""

        gemini = GeminiProvider(api_key=settings.gemini_api_key, model=settings.gemini_model)
        llm_result = await gemini.generate(narrative_prompt)

        if llm_result.status == "ok" and llm_result.text:
            # Simple parsing: assign full narrative; frontend can split
            for z in high_risk_zones:
                z["narrative"] = llm_result.text
            narrative_summary = llm_result.text
        else:
            narrative_summary = None
    else:
        narrative_summary = None

    return {
        "generated_at": datetime.now().isoformat(),
        "data_coverage": {
            "satellite_scenes": len(scenes),
            "weather_records": len(weather),
            "civilian_reports": len(reports),
            "acled_events": len(acled_events),
            "incident_clusters": len(clusters),
        },
        "baseline_vegetation": baseline_veg,
        "zones": zones,
        "corridors": corridors,
        "narrative_summary": narrative_summary,
    }
```

**Step 4: Run tests to verify they pass**

Run: `cd /Users/james/tribble/backend && python -m pytest tests/test_api_dashboard.py -v`
Expected: ALL PASS

**Step 5: Run full test suite**

Run: `cd /Users/james/tribble/backend && python -m pytest tests/ -v`
Expected: ALL PASS

**Step 6: Commit**

```bash
git add backend/src/tribble/api/analysis.py backend/tests/test_api_dashboard.py
git commit -m "feat(api): add GET /api/analysis/dashboard with risk zones, corridors, satellite viewer"
```

---

## Task 9: Update seed script for dashboard data

**Files:**
- Modify: `backend/src/tribble/ingest/seed_supabase.py`

**Step 1: Remove `seed_satellite_analysis` from seed script**

The old `seed_satellite_analysis()` function is superseded by the dashboard endpoint. Remove it from `seed_supabase.py` and remove the call in `main()`. The dashboard computes everything on-the-fly from existing seeded data.

**Step 2: Run seed script to verify it still works**

Run: `cd /Users/james/tribble/backend && python -m tribble.ingest.seed_supabase` (requires Supabase connection)

**Step 3: Commit**

```bash
git add backend/src/tribble/ingest/seed_supabase.py
git commit -m "refactor(seed): remove satellite_analysis seeding, dashboard computes on-the-fly"
```

---

## Task 10: Final integration verification

**Step 1: Run full test suite**

Run: `cd /Users/james/tribble/backend && python -m pytest tests/ -v --tb=short`
Expected: ALL PASS

**Step 2: Start dev server and test dashboard endpoint**

Run: `cd /Users/james/tribble/backend && uvicorn tribble.main:app --reload`
Then: `curl localhost:8000/api/analysis/dashboard | python -m json.tool`

Expected: JSON response with zones, corridors, satellite_context with viewer_url, risk_profiles

**Step 3: Verify satellite viewer URLs work**

Open a `viewer_url` from the response in a browser — should open EO Browser at the correct location and date.

**Step 4: Final commit**

```bash
git commit --allow-empty -m "feat: satellite risk intelligence agent complete — pipeline stubs filled, dashboard endpoint live"
```
