# Backend: pipeline nodes and API ports

## Server port

- **Default:** `8000` (when running `uvicorn tribble.main:app` or `uv run uvicorn tribble.main:app --reload`).
- Override with `--host` / `--port` or set `PORT` in the environment if your runner reads it.

---

## LangGraph pipeline (11 nodes)

The pipeline is defined in `backend/src/tribble/pipeline/graph.py` and compiled with `build_pipeline()`. Each report flows through the graph until it is **published**, **rejected**, or **errors**.

### Nodes (in execution order)

| Order | Node              | Purpose |
|-------|-------------------|--------|
| 1     | **prefilter**     | Reject too-short narratives; otherwise continue. |
| 2     | **normalize**     | Clean narrative, word count. |
| 3     | **translate**     | Translation when language ≠ en. |
| 4     | **classify**      | Report type, categories, severity/urgency. |
| 5     | **geocode**       | Resolve location. |
| 6     | **deduplicate**   | Find duplicate reports. |
| 7     | **corroborate**   | ACLED / cross-source corroboration. |
| 8     | **enrich_weather** | Weather context and risks. |
| 9     | **enrich_satellite** | Satellite EO and fusion with weather/reports. |
| 10    | **score**         | Confidence breakdown and publishability/urgency/access_difficulty. |
| 11    | **cluster**       | Final step; marks status as PUBLISHED. |

### Edges

- **START → prefilter**
- **prefilter** → conditional:
  - If **rejected** → **END**
  - Else → **normalize**
- **normalize → translate → classify → geocode → deduplicate → corroborate → enrich_weather → enrich_satellite → score → cluster → END**

### State and status

- State type: `PipelineState` in `tribble.pipeline.state`.
- Status enum: `PipelineStatus` (e.g. `INGESTED`, `PREFILTERED`, … `PUBLISHED`, `REJECTED`, `ERROR`).
- Each node appends its name to `node_trace` and may set `status` and `error`.

---

## API routers (prefixes)

| Prefix                | Tags         | Purpose |
|-----------------------|-------------|--------|
| (none)                | —           | `GET /health` |
| `/api/reports`        | reports     | Create reports, trigger pipeline jobs. |
| `/api/clusters`       | clusters    | Cluster/GeoJSON for map. |
| `/api/geolocation`    | geolocation | Run geolocation pipeline on reports. |
| `/api/assistant`      | assistant   | Assistant/briefing. |
| `/api/realtime`       | realtime    | Realtime subscriptions. |
| `/api/simulation`     | simulation  | Stream simulator control. |
| `/api/streaming`      | streaming   | `GET /stats`, `GET /health`, reseed. |
| `/api/worker`         | worker      | `POST /start`, `POST /stop`, `GET /status`. |
| `/api/analysis`       | analysis    | Situation report, satellite analysis. |
| **`/api/pipeline`**   | pipeline    | **Blueprint and queue** (see below). |

---

## Seeing what is planned and about to run

1. **Pipeline blueprint**  
   **`GET /api/pipeline/blueprint`** — Returns the graph shape: `nodes` (ordered), `edges`, and `conditional_edges`. Use this to see the planned flow.

2. **Queue (what’s about to be implemented)**  
   **`GET /api/pipeline/queue`** — Returns a snapshot of `pipeline_jobs` (pending/processing/completed). Pending jobs are what the worker will pick up next.

3. **Worker status**  
   **`GET /api/worker/status`** — Returns worker running flag, `last_result`, `last_error`, and job counts. Shows the last thing that ran.

4. **Stream stats**  
   **`GET /api/streaming/stats`** — Queue depth, throughput, backpressure. High-level view of what’s flowing.

5. **Logs**  
   When the pipeline runs, each node logs at **INFO** when it is **entering** (e.g. `Pipeline node classify for report <report_id>`). Use your process logs to see what is currently being executed and what just ran.
