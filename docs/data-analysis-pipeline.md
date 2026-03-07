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

**Process:** Data is summarised into a prompt; Gemini (or Flock fallback) produces:

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

**Stored in:** `analysis_results` (analysis_type: `satellite_analysis`).

---

## 4. Data sources (what feeds the analyses)

| Source | Table(s) | How it gets in |
|--------|----------|-----------------|
| Armed conflict events | `events` | ACLED API (seed_supabase / ingest) |
| Civilian reports | `civilian_reports` | Seed script (synthetic), web submissions, future WhatsApp |
| Weather | `weather_data` | Open-Meteo historical (ingest) |
| Satellite imagery | `satellite_scenes` | Sentinel-2 STAC (e.g. Planetary Computer), indices (NDVI, NDWI) |
| Incoming reports for pipeline | `reports` | POST /api/reports, simulator, or other ingest |

---

## 5. Summary

- **Report pipeline:** Analyses **each new report** (narrative + metadata) → classification, corroboration, weather/satellite enrichment, confidence → publish or reject.  
- **Situation report:** Analyses **events + civilian_reports + weather** → LLM → narrative situation report and recommendations.  
- **Satellite analysis:** Analyses **satellite_scenes + weather + civilian_reports** → fusion + LLM → EO-based flood/impact and correlation with ground reports.

All analysis outputs that are persisted go into **analysis_results** (situation_report, satellite_analysis) or into **verification_runs** / **confidence_scores** (per-report pipeline).
