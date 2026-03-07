# Frontend: Backend outputs and how to use them

Instructions for the frontend: what data exists, where to get it, and what to show.

---

## Scope: plan vs current implementation

**This doc is based on the implementation plan** (`docs/plans/2026-03-07-humanitarian-intelligence-platform.md` and Stage 2) **and the current codebase.** It describes:

- **Content** (severity, event types, risk, report types, verification) — as defined in the plan and in code; your friend can rely on these for labels, filters, and badges.
- **Data sources** — a mix of what exists today:
  - **Tribble app tables** (in Supabase): `events`, `submissions`, `civilian_reports`, `zones`, `ngos`, `boundaries`, `drones`, `satellite_scenes`, `weather_data`, `analysis_results`. The Next.js app and the analysis API read/write these. Events here are typically from ACLED/news ingest; civilian reports are ground-level submissions.
  - **Plan schema** (also in Supabase if migrations 003–010 are applied): `reports`, `locations`, `incident_clusters`, `pipeline_jobs`, `verification_runs`, `confidence_scores`. The pipeline worker and **GET /api/clusters** use these; clusters come from the `get_incident_clusters_geojson` RPC reading `incident_clusters`.

So: **content and API contracts** (clusters, analysis, assistant, severity, ontology, etc.) are plan-aligned. **Where** that data lives: events/civilian_reports/analysis_results = Tribble tables; cluster GeoJSON = backend API backed by plan tables. If the plan later unifies into a single schema, the doc can be updated; until then, the frontend should use the sources listed below.

---

## 1. Backend base URL

- **Env:** `NEXT_PUBLIC_API_URL` (e.g. `http://localhost:8000`).
- All API endpoints below are relative to this base.

---

## 2. What the user can see: danger, risk, and report types

So your friend knows what **content** to show — the kinds of danger, risk, and local reports (news, ACLED, civilian).

### Severity (danger level)

Everywhere we use **severity** it’s one of:

- **critical** — highest danger
- **high**
- **medium**
- **low**

Use for: event/report badges, filters, map colour, sort order.

### Event types (armed conflict / crisis — from ACLED & news)

**Events** (table `events`) have **ontology_class**. These are the “what happened” categories from **ACLED** and **news**:

- **armed_conflict** — general fighting
- **airstrike**
- **shelling**
- **bridge_damaged** — infrastructure damage
- **displacement_mass** — mass displacement
- **aid_obstruction** — aid blocked
- **disease_outbreak**
- **food_distribution** — food aid / distribution
- **suspicious_activity**
- **water_contamination**

Each event also has **source_type**: e.g. **acled** (ACLED database), **news_agent** (news), **satellite**, **drone**, **user_submission**, **analyst_input**. So “local reports through the news” = events with `source_type: "news_agent"`; ACLED-sourced = `source_type: "acled"`.

### Civilian / ground report types

**Civilian reports** (table `civilian_reports`) have **report_type**. These are what people on the ground report:

- **shelling**, **gunfire** — violence
- **food_need**, **water_need**, **medical_need**, **shelter_need** — humanitarian needs
- **displacement** — people fleeing
- **infrastructure_damage** — e.g. buildings, bridges damaged
- **aid_blocked** — aid convoys blocked
- **looting**
- **missing_persons**

Use for: report list filters, map layer by type, tags/badges.

### Risk (zones and clusters)

- **Zones** (table `zones`): **risk_score** (0–1 or similar). **zone_type** e.g. `conflict_zone`, `humanitarian_operation_area`. Use for: zone polygons, risk colour, labels.
- **Clusters** (API `/api/clusters`): **weighted_severity**, **weighted_confidence** (0–1). **top_need_categories** — list of need types (e.g. `medical_need`, `violence_active_threat`, `displacement`). **access_blockers**, **infrastructure_hazards** — text/summaries. **evidence_summary** — e.g. “7 reports, 3 sources, 48h”. Use for: cluster popovers, risk badges, “what’s wrong here”.

### Weather / environmental risk

Where available (e.g. pipeline enrichment, analysis context):

- **flood_risk**, **storm_risk**, **heat_risk**, **route_disruption_risk** (0–1).

Use for: optional risk chips or tooltips (e.g. “High flood risk”).

### Verification

- **Events:** **verification_status** — `unverified`, `pending`, `verified`, `disputed`, `escalated`. **confidence_score** (0–1).
- **Submissions:** **status** — `pending`, `in_review`, `verified`, `declined`, `escalated`.

Use for: badges (“Verified”), filters, dimming unverified.

---

## 3. Data from Supabase (direct)

The app already reads these via **`tribble/lib/supabase/queries.ts`**. Types are in **`tribble/lib/supabase/types.ts`** and **`tribble/types/index.ts`**.

| Output | Table | Query | Use for |
|--------|--------|--------|---------|
| **Events** | `events` | `fetchEvents()` → `HipEvent[]` | Map markers / event list (crisis events). |
| **Submissions** | `submissions` | `fetchSubmissions()` → `UserSubmission[]` | User-submitted reports list / review queue. |
| **Zones** | `zones` | `fetchZones()` → `DbZone[]` | Map polygons (risk zones). |
| **Boundaries** | `boundaries` | `fetchBoundaries()` → `DbBoundary[]` | Map lines (frontlines, admin). |
| **NGOs** | `ngos` | `fetchNGOs()` → `NGO[]` | Map / legend (NGO zones, colours). |
| **Drones** | `drones` | `fetchDrones()` → `Drone[]` | Map layer (drone positions, status). |
| **Satellite scenes** | `satellite_scenes` | `fetchSatelliteScenes()` → `DbSatelliteScene[]` | EO layer / imagery list. |
| **Civilian reports** | `civilian_reports` | `fetchCivilianReports()` → `DbCivilianReport[]` | Reports list / map points. |
| **Analysis results** | `analysis_results` | `fetchAnalysisResults()` → `DbAnalysisResult[]` | Situation reports & satellite analysis panels. |

**Analysis result shape:** Each row has `id`, `analysis_type` (`"situation_report"` or `"satellite_analysis"`), `summary` (main text), `details` (object), `provider`, `model`, `events_analyzed`, `reports_analyzed`, `created_at`. Use `analysis_type` to choose how to render (e.g. different card for situation vs satellite).

**Writing data:** `submitReport(...)` inserts into `submissions` (anon allowed by RLS).

---

## 4. Data from the backend API

Call these with `fetch(NEXT_PUBLIC_API_URL + path, { method, headers, body })`. Handle non-2xx and parse JSON.

### Map / clusters

- **GET** `/api/clusters?bbox=minLon,minLat,maxLon,maxLat&min_severity=0&limit=200`
- **Response:** `{ type: "FeatureCollection", features: Feature[] }`.
- **Feature.properties:** `id`, `report_count`, `weighted_severity`, `weighted_confidence`, `top_need_categories`, `access_blockers`, `infrastructure_hazards`, `evidence_summary`, `radius_km`, `country`, `last_updated`.
- **Use for:** Cluster markers/layers on the map; popover with counts and summary.

### Situation report (trigger + result)

- **POST** `/api/analysis/run` (no body).
- **Response:** `{ analysis: string, provider?: string, model?: string, events_analyzed: number, reports_analyzed: number }`.
- **Use for:** “Run analysis” button; show `analysis` in a panel. The same text is also stored in `analysis_results` (type `situation_report`), so you can alternatively read from Supabase after someone triggers the run.

### Satellite analysis (trigger + result)

- **POST** `/api/analysis/satellite` (no body).
- **Response:** `{ analysis: string, provider?: string, model?: string, scenes_analyzed: number, fusion_scores: unknown[], reports_correlated: number }`.
- **Use for:** “Run satellite analysis” button; show `analysis` in a panel. Same text is stored in `analysis_results` (type `satellite_analysis`).

### Assistant (chat)

- **POST** `/api/assistant/query`  
  **Body:** `{ prompt: string, conversation_id?: string }`.  
  **Response:** `{ conversation_id: string, blocks: Array<{ type: string, ... }>, metadata: object }`.
- **Use for:** Chat UI; render `blocks` (may include citations, text, etc.). Can return 503 if assistant is disabled.

### Pipeline / worker (ops visibility)

- **GET** `/api/pipeline/blueprint`  
  **Response:** `{ nodes: string[], edges: { from, to }[], conditional_edges: object[], entry: string, exit: string }`.
- **GET** `/api/pipeline/queue?limit=100`  
  **Response:** `{ total: number, pending_or_processing: number, jobs: Array<{ id, status, created_at, started_at, completed_at, last_error }> }`.
- **GET** `/api/worker/status`  
  **Response:** `{ running: boolean, worker_id: string, jobs_completed: number, jobs_failed: number, jobs_skipped: number, last_result?: string, last_error?: string, started_at?: string }`.
- **Use for:** Dev/ops panels (pipeline graph, queue depth, worker status).

### Streaming / simulation

- **GET** `/api/streaming/stats?window_minutes=10`  
  **Response:** `{ status, queue_depth, backpressure, oldest_pending_age_s, outcome_histogram, reject_rate, ... }`.
- **GET** `/api/streaming/health?window_minutes=10`  
  **Response:** `{ status, queue_depth, backpressure, oldest_pending_age_s }`.
- **POST** `/api/simulation/start` (body optional), **POST** `/api/simulation/stop`, **GET** `/api/simulation/status`.
- **Use for:** Optional dashboards for stream health and simulation control.

### Other

- **GET** `/health` → `{ status: "ok" }` (liveness).
- **GET** `/api/satellite/scenes?date_from=YYYY-MM-DD&date_to=YYYY-MM-DD` → `{ scenes: SatelliteScene[], date_from, date_to }`. Requires `NEXT_PUBLIC_API_URL` to be set and the backend running; for data to appear, run the backend seed (`python -m tribble.ingest.seed_supabase`) to populate `satellite_scenes`.
- **GET** `/api/geolocation/geojson?report_ids=id1,id2` → GeoJSON FeatureCollection (geolocated reports).
- **POST** `/api/reports` — report submission that enqueues pipeline jobs (alternative to Supabase `submissions` if you use the full pipeline).

---

## 5. Quick reference: what to show where

- **Map:** events, zones, boundaries, NGOs, drones, civilian reports (from Supabase); clusters (from `/api/clusters`).
- **Events / reports lists:** `fetchEvents()`, `fetchSubmissions()`, `fetchCivilianReports()`.
- **Situation report panel:** `fetchAnalysisResults()` filtered by `analysis_type === "situation_report"` and show `summary`; or trigger `POST /api/analysis/run` and show the returned `analysis`.
- **Satellite analysis panel:** Same with `analysis_type === "satellite_analysis"`; or trigger `POST /api/analysis/satellite` and show returned `analysis`.
- **Assistant:** `POST /api/assistant/query` and render `blocks`.
- **Submitting a report:** `submitReport()` (Supabase) or `POST /api/reports` (backend), depending on product choice.

Use this to wire each screen to the right data source and API.
