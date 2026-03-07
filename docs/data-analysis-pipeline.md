# Data analysis pipeline — what is being analysed

Brief overview of the analysis flows and the data they use.

---

## 1. Report pipeline (LangGraph)

**What is analysed:** Incoming **reports** (narrative, source, language, optional lat/lng).

**Flow:** Each report is pushed through 11 nodes; the pipeline produces a **verification run** and **confidence scores**, and may publish or reject.

| Stage | Data used | Output |
|-------|-----------|--------|
| prefilter | `raw_narrative` | Reject if too short |
| normalize | narrative | Clean text, word count |
| translate | narrative, language | Translated text (if not en) |
| classify | narrative, report_type | Type, categories, severity/urgency |
| geocode | narrative, lat/lng | Resolved location |
| deduplicate | location, time | Duplicate report IDs |
| corroborate | report type, location, time | ACLED / cross-source hits |
| enrich_weather | location, timestamp | Weather context, flood risk |
| enrich_satellite | location, time | EO indices, fusion with weather/reports |
| score | all above | Confidence breakdown, publishability, urgency |
| cluster | — | Final status (published/rejected) |

**Stored in:** `reports` (input), `pipeline_jobs`, `verification_runs`, `confidence_scores`.

---

## 2. Situation report analysis (LLM)

**Endpoint:** `POST /api/analysis/run`

**What is analysed:**

- **events** (up to 100) — ontology_class, severity, location_name, description, timestamp  
- **civilian_reports** (up to 200) — report_type, severity, location_name, narrative, timestamp  
- **weather_data** (up to 15) — date, temperature_c, humidity_pct, precipitation_mm  

**Process:** Data is summarised into a prompt; Claude (or Flock fallback) produces:

- Situation report (2–3 paragraphs)  
- Trend analysis  
- Needs assessment (ranked)  
- Recommendations for NGOs  

**Stored in:** `analysis_results` (analysis_type: `situation_report`).

---

## 3. Satellite / EO analysis (LLM)

**Endpoint:** `POST /api/analysis/satellite`

**What is analysed:**

- **satellite_scenes** — acquisition_date, ndvi, ndwi, cloud_cover, bbox, quality  
- **weather_data** — matched by date to each scene (precipitation → flood risk)  
- **civilian_reports** (up to 200) — for cross-source corroboration signal  

**Process:** For each scene, fusion scores are computed (satellite + weather + report signals). All scenes, weather, reports, and fusion results go into a prompt; the LLM produces:

- Flood/water extent assessment  
- Impact and infrastructure notes  
- Correlation with civilian reports  

**Optional AI-derived signals:** When `enable_satellite_ai_analysis` is enabled, a vision model (e.g. Claude) can analyse satellite preview imagery per scene. Results are cached in `satellite_ai_results` (flood_score_ai, infrastructure_damage_score_ai, labels) and **supplement** index-based fusion and risk scoring. All AI outputs are area-level hypotheses for corroboration only; no building-level claims.

**Stored in:** `analysis_results` (analysis_type: `satellite_analysis`).

---

## 4. Data sources (what feeds the analyses)

| Source | Table(s) | How it gets in |
|--------|----------|-----------------|
| Armed conflict events | `events` | ACLED API (seed_supabase / ingest) |
| Civilian reports | `civilian_reports` | Seed script (synthetic), web submissions, future WhatsApp |
| Weather | `weather_data` | Open-Meteo historical (ingest) |
| Satellite imagery | `satellite_scenes` | Sentinel-2 STAC (e.g. Planetary Computer), indices (NDVI, NDWI) |
| Satellite AI analysis | `satellite_ai_results` | Optional vision model per scene (cached); supplements fusion and risk |
| Incoming reports for pipeline | `reports` | POST /api/reports, simulator, or other ingest |

---

## 5. Summary

- **Report pipeline:** Analyses **each new report** (narrative + metadata) → classification, corroboration, weather/satellite enrichment, confidence → publish or reject.  
- **Situation report:** Analyses **events + civilian_reports + weather** → LLM → narrative situation report and recommendations.  
- **Satellite analysis:** Analyses **satellite_scenes + weather + civilian_reports** → fusion + LLM → EO-based flood/impact and correlation with ground reports.

All analysis outputs that are persisted go into **analysis_results** (situation_report, satellite_analysis) or into **verification_runs** / **confidence_scores** (per-report pipeline).

---

## 6. Maps agent and route suggestion

**Endpoint:** `GET /api/routes/suggest` and `POST /api/routes/suggest`

**What it does:** Suggests safe routes between an origin and destination by avoiding **recent** incidents. Used by the Safe Routes page and by HELIOS when the user asks for safe routes, alternative ways in, or how to avoid recent events.

**What is analysed:**

- **events** — filtered by `timestamp >= now() - avoid_recent_hours` (recency).
- **incident_clusters** — filtered by `last_updated` for the same window; used as risk geometry along the path.

**Process:**

1. Filter events and clusters by recency (`avoid_recent_hours` query/body param).
2. Compute **primary route** (direct A→B) risk using `compute_corridor_risk` with recency-filtered intervening events and clusters.
3. If the direct route has high/critical risk and an event is near the segment, compute an **alternative** route via a detour waypoint away from the event.
4. Optionally generate a short **narrative** (Claude) summarising the suggestion.
5. Return `recent_events_nearby`, `suggested_routes` (primary + optional alternative), and `narrative`.

**Response shape:** `{ recent_events_nearby: [...], suggested_routes: [{ type, summary, waypoints_or_corridor, risk_level, advisory, distance_km }], narrative }`.

**HELIOS integration:** When the user message matches routing keywords (e.g. "safe route", "alternative way in", "avoid the incident"), HELIOS calls the route-suggestion logic with default origin/destination and returns the formatted suggestion. For custom coordinates, the user uses the **Safe Routes** page (`/app/routes`).

---

## 7. Event-driven satellite analysis (per news event)

**Endpoints:** `POST /api/analysis/event-satellite`, `GET /api/analysis/event-satellite`

**What is analysed:** Individual **news/conflict events** with coordinates (from `events` table or from the feed, e.g. `/api/events/news`). For each event we run: context-driven event parsing (LLM) → 5km×5km satellite snapshots at multiple time windows (before / at_event / after) → vision analysis per snapshot → synthesis (does this event affect aid response?).

**Storage:** Results are stored in **Supabase** in `analysis_results` with `analysis_type: 'event_satellite_aid_impact'`. Each row's `details` includes `event_id`, `parsed_event`, `snapshots` (array of `period_label`, `acquisition_date`, `image_url`, `scene_id`, `satellite_analysis`), and `synthesis`. This allows organisations to see **all photos of a location across time intervals** and to power a **satellite analysis bar** in the feed, Inspect, and Helios.

**Feed / satellite analysis bar:**

- **Manual trigger only:** To control cost, do **not** auto-run satellite analysis for all events on feed load. The user should **manually trigger** analysis (e.g. "Run satellite analysis" or "Analyse" on a single event, or "Analyse selected" for a few). Only then call the API for that event or selection.
- **Run analysis (user-triggered):** When the user triggers analysis for one or more events, send `POST /api/analysis/event-satellite` with `events_with_coords: [ { id, lat, lng, narrative, timestamp, ... } ]` for those events (e.g. the selected feed item(s)). Results are stored and keyed by `id`.
- **Show stored results:** After a run, or when the user opens an event that already has analysis, call `GET /api/analysis/event-satellite?event_ids=id1,id2,...` for that event’s id. Each result includes `snapshots` with `image_url`, `acquisition_date`, `period_label` for before/at_event/after — use these in a **satellite analysis bar** for that event to show the location over time.
- **Map behaviour:** Only events with coordinates can have satellite analysis. Do **not** draw a 5km×5km circle or square for **cluster markers that have no events inside their radius**; only show the satellite footprint (or analysis) for actual event points that have analysis.
