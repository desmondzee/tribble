# Satellite Risk Intelligence Agent — Design

## Problem

The existing pipeline processes civilian reports through a LangGraph pipeline with satellite/weather/ACLED enrichment — but most enrichment nodes are stubs returning hardcoded values. The satellite analysis endpoint (`POST /api/analysis/satellite`) generates a generic EO report that doesn't serve operational needs.

NGOs need: structured risk zones they can render on a map, corridor advisories for logistics routing, and satellite imagery links for manual damage assessment. Civilians need: validation feedback on their reports showing whether satellite/weather/ACLED data confirms what they reported.

## Design

### Architecture

Replace the standalone satellite analysis endpoint with two things:

1. **Fill pipeline stubs** — make `corroborate`, `enrich_weather`, `classify`, and `score` nodes real so every report gets multi-source validation
2. **Dashboard endpoint** (`GET /api/analysis/dashboard`) — aggregates cluster-level risk profiles, corridor advisories, and satellite viewer links into structured JSON for the frontend

```
Civilian submits report
        |
        v
+----------------------------------------------+
|         LangGraph Pipeline (existing)         |
|                                               |
|  prefilter -> normalize -> translate          |
|  -> classify     <-- map report_type to       |
|                      crisis/help categories   |
|  -> geocode -> deduplicate                    |
|  -> corroborate  <-- match ACLED events +     |
|                      nearby reports by         |
|                      location + time           |
|  -> enrich_weather <-- fetch closest weather,  |
|                        compute risks           |
|  -> enrich_satellite (already works)           |
|  -> score        <-- use real enrichment data  |
|                      instead of hardcoded 0.5  |
|  -> cluster_node                               |
+-------------------+---------------------------+
                    |
                    v  per-report confidence_scores stored
                    |
          +---------v----------+
          |  GET /api/analysis |
          |     /dashboard     |
          +---------+----------+
                    |
                    v
          +---------------------+
          | 1. Fetch clusters   |
          | 2. Enrich with sat  |
          |    + weather + ACLED|
          | 3. Corridor risk    |
          | 4. Claude narrative |
          | 5. Structured JSON  |
          +---------------------+
```

### Two audiences

- **Civilians**: each report gets a `validation_context` showing what satellite/weather/ACLED data confirms or doesn't confirm about their report
- **NGOs**: dashboard shows risk zones (cluster-level), corridor advisories between zones, and links to raw satellite imagery for manual assessment

---

## Pipeline Stub Implementations

### `classify` node

Maps the report's `report_type` field to structured categories. No LLM needed — deterministic mapping:

```
report_type -> crisis_categories:
  shelling, gunfire      -> ["security"]
  food_need              -> ["food"]
  water_need             -> ["water_sanitation"]
  medical_need           -> ["health"]
  shelter_need           -> ["shelter"]
  displacement           -> ["displacement"]
  infrastructure_damage  -> ["infrastructure"]
  aid_blocked            -> ["access"]
  looting                -> ["security", "food"]
  missing_persons        -> ["security"]
```

Extracts urgency hint from severity field (critical/high/medium/low).

### `corroborate` node

Cross-references the report against ACLED events and nearby civilian reports.

**ACLED matching** — query `events` table for entries within 5km and 72h of report. Match by `ontology_class`:

| Civilian report_type     | Corroborating ACLED ontology_class     |
|--------------------------|----------------------------------------|
| `shelling`               | `shelling`                             |
| `gunfire`                | `armed_conflict`                       |
| `infrastructure_damage`  | `shelling`, `armed_conflict`           |
| `looting`                | `armed_conflict`                       |
| `displacement`           | `armed_conflict`, `shelling`           |
| `aid_blocked`            | `aid_obstruction`                      |
| `shelter_need`           | `armed_conflict`, `shelling`           |
| `missing_persons`        | `armed_conflict`                       |
| `medical_need`           | `armed_conflict` (with fatalities > 0) |
| `water_need`             | — (satellite/weather instead)          |
| `food_need`              | `aid_obstruction`, `armed_conflict`    |

ACLED is the **primary corroboration source** for conflict-related reports. It's daily, verified, and has precise locations. Satellite is secondary.

**Cross-report matching** — query `civilian_reports` for entries within 3km and 48h with the same `report_type`. Normalize to corroboration score: `min(match_count / 5, 1.0)`.

**Scoring** — critical/high ACLED event within 2km = 0.8 corroboration. Lower severity or further = weaker. Cross-report matches add proportionally.

### `enrich_weather` node

1. Query `weather_data` for record closest in date to report timestamp
2. Compute weather risks using existing `compute_weather_risks()` from `ingest/weather.py`
3. Store `weather_data` dict with flood_risk, storm_risk, heat_risk, route_disruption_risk

### `score` node (rewired)

Replace hardcoded 0.5 values with real data from enrichment nodes:

- `source_prior` -> `SOURCE_PRIORS[state.source_type]`
- `cross_source_corroboration` -> from corroborate node output
- `weather_plausibility` -> from enrich_weather (high weather risk for matching report type = plausible)
- `satellite_corroboration` -> from enrich_satellite (already works)
- `completeness_score` -> word count: >50 words = 0.8, >20 = 0.6, else 0.4
- `geospatial_consistency` -> 0.8 if within El Fasher bbox, else 0.4

Calls real `ConfidenceBreakdown.compute_publishability()`.

### Validation context (new output from score node)

Each report gets a `validation_context` dict mapping its report_type to what each source says:

| report_type              | satellite check                              | weather check          | acled check                        |
|--------------------------|----------------------------------------------|------------------------|------------------------------------|
| `water_need`             | NDWI trend (declining = confirms)            | Low precip = confirms  | —                                  |
| `food_need`              | NDVI decline (only if baseline NDVI > 0.25)  | Drought conditions     | aid_obstruction / looting nearby   |
| `shelter_need`           | —                                            | Storm risk             | Violence nearby                    |
| `infrastructure_damage`  | NDVI drop in urban area / change_score       | —                      | Shelling/battles nearby            |
| `shelling`               | Fire scar (NDVI drop, weak)                  | —                      | ACLED shelling events              |
| `displacement`           | —                                            | Flood risk             | Any violence nearby                |
| `aid_blocked`            | —                                            | Route disruption       | ACLED aid_obstruction              |

Each check produces `{confirmed: bool, signal: str, confidence: float}`.

---

## Location-Aware Satellite Interpretation

NDVI interpretation depends on regional vegetation baseline:

```
IF scene NDVI < 0.25 (arid/semi-arid, e.g. Sahel):
    -> Classify as baseline_vegetation = "arid"
    -> Suppress food_need satellite corroboration
    -> NDVI changes not meaningful for crop stress
    -> NDWI still useful for water/flooding

IF scene NDVI >= 0.25 (agricultural/vegetated):
    -> Classify as baseline_vegetation = "vegetated"
    -> NDVI decline > 0.1 = crop stress signal
    -> Corroborates food_need reports
```

Derived from earliest scene's NDVI for the area. El Fasher (~0.15-0.25 in May) would be classified as arid, suppressing food-related satellite signals. A crisis in South Sudan's agricultural belt (NDVI 0.4+) would use them.

---

## Satellite Imagery Viewer for NGOs

Expose raw satellite scene data so NGOs can visually assess damage:

- `tile_url` — direct link to Sentinel-2 tile on Planetary Computer
- `bbox` — scene bounding box for map rendering
- `viewer_url` — constructed EO Browser link with bbox + date, enabling interactive viewing with multiple band combinations (true color, false color IR for fire scars, NDWI for water)

This lets ops teams make their own visual assessment rather than trusting computed indices blindly. Particularly valuable for infrastructure damage where automated detection at 10m resolution has limits.

---

## Dashboard Endpoint

### `GET /api/analysis/dashboard`

Returns the full operational picture as structured JSON.

### Response structure

```json
{
  "generated_at": "2024-05-11T14:00:00Z",
  "data_coverage": {
    "satellite_scenes": 1,
    "weather_records": 11,
    "civilian_reports": 502,
    "acled_events": 47,
    "incident_clusters": 7
  },
  "zones": [
    {
      "cluster_id": "...",
      "location": "Abu Shouk camp",
      "centroid": [13.685, 25.355],
      "radius_km": 5.0,
      "report_count": 67,

      "risk_profile": {
        "conflict_risk": 0.85,
        "water_scarcity": 0.72,
        "food_insecurity": 0.40,
        "flood_risk": 0.15,
        "infrastructure_damage": 0.68,
        "access_difficulty": 0.55
      },
      "top_risks": ["conflict_risk", "water_scarcity"],
      "risk_level": "critical",

      "corroboration": {
        "acled_events_nearby": 5,
        "acled_severity_max": "critical",
        "cross_report_density": 0.8,
        "satellite_confirmed": ["infrastructure_damage"],
        "weather_confirmed": ["water_scarcity"]
      },

      "satellite_context": {
        "scenes": [
          {
            "acquisition_date": "2024-05-06",
            "tile_url": "https://planetarycomputer.microsoft.com/...",
            "bbox": [25.2, 13.5, 25.5, 13.7],
            "cloud_cover_pct": 12.3,
            "ndvi": 0.18,
            "ndwi": -0.05,
            "quality_score": 0.82
          }
        ],
        "change_detection": {
          "ndvi_delta": -0.04,
          "ndwi_delta": 0.08,
          "flood_score": 0.15,
          "change_score": 0.09
        },
        "baseline_vegetation": "arid",
        "viewer_url": "https://apps.sentinel-hub.com/eo-browser/?..."
      },

      "narrative": "Abu Shouk camp faces critical conflict risk..."
    }
  ],
  "corridors": [
    {
      "from": { "name": "El Fasher city center", "centroid": [13.63, 25.35] },
      "to": { "name": "Zamzam camp", "centroid": [13.53, 25.24] },
      "distance_km": 15.2,
      "risk_level": "high",
      "hazards": ["armed_conflict", "shelling"],
      "intervening_clusters": ["El Fasher airport zone"],
      "advisory": "Route passes through active conflict zone near airport. 3 ACLED shelling events in last 72h within 2km of direct path."
    }
  ],
  "narrative_summary": "Overall situation assessment generated by Claude..."
}
```

### Computation steps

1. Fetch all `incident_clusters`, `satellite_scenes`, `weather_data`, `events`, `civilian_reports`
2. For each cluster:
   - Count ACLED events within radius + 72h window
   - Match satellite scene closest by distance to centroid
   - Match weather records closest by date
   - Compute risk_profile: ACLED density -> conflict_risk, report type distribution -> water/food/shelter scores, satellite indices -> flood/infrastructure, weather risks -> flood/heat
   - Determine baseline_vegetation from scene NDVI (< 0.25 = arid)
   - Build EO Browser viewer URL from bbox + date
   - Send high-risk zones to Claude for brief narrative
3. For cluster pairs within 25km:
   - Check if direct path passes near high-risk clusters or ACLED events
   - Compute corridor risk from intervening hazards
   - Generate advisory text via Claude
4. Generate overall narrative summary via Claude

---

## Files to Modify

| File | Action |
|------|--------|
| `backend/src/tribble/pipeline/graph.py` | Fill `classify`, `corroborate`, `enrich_weather` stubs; rewire `score` node |
| `backend/src/tribble/api/analysis.py` | Replace `POST /satellite` with `GET /dashboard` endpoint |

### Reused without modification
- `satellite_fusion.py` — fusion scoring
- `satellite_indices.py` — NDVI/NDWI/flood computation
- `models/confidence.py` — ConfidenceBreakdown + publishability
- `ingest/weather.py` — `compute_weather_risks()`
- `services/briefing.py` — cluster briefing generation
- `models/enrichment.py` — WeatherSnapshot, SatelliteObservation

---

## Verification

1. Pipeline: process a civilian report end-to-end -> `confidence_scores` row has real values (not hardcoded 0.5)
2. Pipeline: `corroboration_hits` populated with ACLED matches for conflict reports
3. Pipeline: `weather_data` populated with real risk scores
4. Dashboard: `GET /api/analysis/dashboard` returns zones with risk profiles + satellite viewer links
5. Dashboard: corridor advisories computed between nearby clusters
6. Dashboard: narratives generated by Claude for high-risk zones
