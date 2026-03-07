# Tribble — Humanitarian Intelligence Platform

> **For Codex:** Use the `executing-plans` skill to implement this plan task-by-task.
> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Backend-first humanitarian intelligence system. Multi-source crisis data flows through a deterministic LangGraph pipeline, gets scored across 9 confidence signals, clusters spatiotemporally, and serves GeoJSON to a map.

**Architecture:** This is a *pipeline*, not an agent swarm. LangGraph orchestrates a fixed 11-node state graph — every node is a pure function with typed I/O. LLMs handle the soft problems (translation, extraction, classification). Everything else is deterministic. Supabase is the database, not the orchestration engine. FastAPI serves the query layer. Next.js renders the dashboard.

**Stack:**

| Concern | Choice | Rationale |
|---------|--------|-----------|
| Frontend | Next.js 16 · React 19 · Tailwind 4 · Mapbox GL | SSR + server components, PostGIS-native map layer |
| Backend | Python 3.12 · FastAPI · LangGraph · httpx | LangGraph requires Python; FastAPI is the thinnest viable wrapper |
| Database | Supabase (Postgres + PostGIS + RLS) | Geography-native, row-level security, realtime subscriptions |
| LLM | Z.ai GLM-4 | Translation · extraction · classification · summarization only |
| External | ACLED v3 · OpenWeatherMap · Sentinel-2 STAC | Conflict events · weather context · 10m satellite metadata |
| Queue | Postgres job table + SKIP LOCKED | No Redis dependency; Postgres handles this fine at our scale |
| Test | pytest · pytest-asyncio · Vitest | Standard, nothing exotic |

---

## Design Decisions

**Why pipeline, not agents.** LangGraph distinguishes between workflows (predetermined paths) and agents (dynamic tool use). We need auditability and repeatable behavior. A crisis report processed today should trace the same nodes as the same report processed tomorrow. Freeform agent routing is the wrong abstraction here.

**Why confidence decomposition, not truth labels.** Binary truth labeling is epistemically dishonest in this domain. We decompose into 9 signals (source prior, spam, duplication, completeness, geospatial consistency, temporal consistency, cross-source corroboration, weather plausibility, satellite corroboration), then compute three independent output scores: publishability, urgency, access difficulty. These are separate axes — a report can be urgent but low-confidence.

**Why clusters, not reports, as the map primitive.** Individual reports are evidence. The operator sees incident clusters: geographic cells with aggregated severity, confidence, need categories, and infrastructure hazards. This matches how humanitarian coordination actually works — you triage areas, not individual submissions.

**Why conservative rejection.** Auto-reject only on high-confidence abuse: empty submissions, gibberish, mass duplicate spam. Everything else gets downgraded, never silently discarded. In conflict zones, noisy genuine reports are more valuable than a clean dashboard with gaps.

**Why historical demo with production architecture.** The demo runs against ACLED's Khartoum 2023 dataset with seeded dummy user reports. Every report passes through the identical pipeline a live system would use. The architecture doesn't lie — it uses safer data.

---

## Repository Layout

```
tribble/
├── backend/
│   ├── pyproject.toml
│   ├── .env.example
│   └── src/tribble/
│       ├── main.py                   # FastAPI entrypoint
│       ├── config.py                 # pydantic-settings, env-driven
│       ├── db.py                     # Supabase client singleton
│       ├── models/                   # Crisis ontology — Pydantic, no ORM
│       │   ├── report.py             # CrisisReport · SourceType · ReportMode
│       │   ├── location.py           # Location · LocationCluster
│       │   ├── infrastructure.py     # InfrastructureObject · DamageAssessment
│       │   ├── confidence.py         # ConfidenceBreakdown · ConfidenceScore
│       │   ├── enrichment.py         # WeatherSnapshot · SatelliteObservation
│       │   ├── cluster.py            # IncidentCluster
│       │   └── taxonomy.py           # TaxonomyTerm · CrisisCategory
│       ├── pipeline/                 # LangGraph state graph
│       │   ├── state.py              # PipelineState TypedDict
│       │   ├── graph.py              # build_pipeline() → compiled graph
│       │   └── nodes/                # One file per node, pure functions
│       ├── ingest/                   # Source-specific adapters
│       │   ├── acled.py              # ACLED historical import
│       │   ├── weather.py            # OpenWeatherMap + deterministic risk calc
│       │   ├── satellite.py          # Sentinel-2 STAC search
│       │   ├── web_report.py         # Website intake
│       │   ├── whatsapp.py           # WhatsApp chatbot intake (stub)
│       │   └── seed.py               # Khartoum 2023 dummy data generator
│       ├── services/
│       │   ├── briefing.py           # NGO briefing generation
│       │   ├── clustering.py         # Cluster lifecycle
│       │   └── queue.py              # Job queue ops
│       └── api/                      # FastAPI routers
│           ├── reports.py            # POST/GET reports
│           ├── clusters.py           # GeoJSON cluster endpoint
│           ├── enrichment.py         # Weather/satellite queries
│           └── briefings.py          # NGO summary endpoint
├── tribble/                          # Next.js 16 frontend
│   ├── app/
│   └── lib/supabase/
│       ├── client.ts                 # Browser client
│       └── server.ts                 # Server component client
├── supabase/migrations/              # Ordered, idempotent SQL
│   ├── 001_enable_postgis.sql
│   ├── 002_taxonomy.sql
│   ├── 003_core_tables.sql
│   ├── 004_enrichment_tables.sql
│   ├── 005_clustering_tables.sql
│   ├── 006_confidence_tables.sql
│   ├── 007_queue_table.sql
│   ├── 008_rls_policies.sql
│   └── 009_seed_taxonomy.sql
└── docs/plans/
```

---

## The Pipeline

```
  ingest ──► prefilter ──┬──► REJECT (empty/gibberish/banned)
                         │
                         ▼
                     normalize ──► translate ──► classify ──► geocode
                                                               │
                                                               ▼
                     deduplicate ◄─────────────────────────────┘
                         │
                         ▼
                     corroborate ──► enrich_weather ──► enrich_satellite
                                                            │
                                                            ▼
                                                         score ──► cluster ──► PUBLISH
```

11 nodes. One conditional edge (prefilter → reject or continue). Everything else is linear. Each node returns a partial state update — no side effects, no DB writes inside the graph. Persistence happens after the graph completes.

**Routing logic:**
- Empty/gibberish → reject at prefilter (conservative: <10 chars only)
- Anonymous → lower source prior, continue normally
- Low confidence → retain in DB with low publishability, never discard
- Highly corroborated → high publishability, surfaces immediately on map

---

## Confidence Model

This is the intellectual core.

| Signal | Measures | Direction |
|--------|----------|-----------|
| `source_prior` | Trust floor by source type | Higher = more trusted |
| `spam_score` | Abuse probability | Higher = more likely spam |
| `duplication_score` | Near-duplicate overlap | Higher = more duplicated |
| `completeness_score` | Ontology field coverage | Higher = more complete |
| `geospatial_consistency` | Location plausibility | Higher = more consistent |
| `temporal_consistency` | Timestamp plausibility | Higher = more consistent |
| `cross_source_corroboration` | Independent confirmation | Higher = more confirmed |
| `weather_plausibility` | Weather context alignment | Higher = more plausible |
| `satellite_corroboration` | Satellite evidence support | Higher = more supported |

**Source priors** (these are starting points, not ceilings):

```
acled_historical     0.95    # curated dataset
weather              0.95    # deterministic API
satellite            0.85    # instrument data, interpretation varies
web_identified       0.80    # accountable submitter
whatsapp_identified  0.65    # accountable but informal channel
web_anonymous        0.55    # unaccountable but structured form
whatsapp_anonymous   0.40    # unaccountable and informal
```

**Output scores** (independent axes, not derived from each other):
- **Publishability** — weighted combination of all 9 signals, spam-penalized, dedup-adjusted
- **Urgency** — time-sensitivity of the reported need
- **Access difficulty** — how hard it is to reach the area (weather + route + conflict)

The publishability formula weights spam_score at 20% (inverted) — heaviest single weight. If duplication_score > 0.8, publishability is halved. This is deliberately conservative.

---

## Database Schema

Nine migrations, ordered. PostGIS first, then taxonomy, then tables from most to least fundamental.

### 001: PostGIS
```sql
CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS postgis_topology;
```

### 002: Taxonomy
Typed enum for crisis categories. `taxonomy_terms` table with `parent_id` self-reference for hierarchy. 13 seed terms covering the humanitarian taxonomy: security, displacement, health, food, water/sanitation, shelter, infrastructure, access, communications, weather, aid, public service.

### 003: Core Tables

**`locations`** — PostGIS `GEOGRAPHY(Point, 4326)`, country/admin fields, precision enum (exact/approximate/admin_area). GIST index on geometry.

**`reports`** — Central entity. Key design choices:
- `source_type` enum (7 values) — not stringly typed
- `mode` enum — `incident_creation` vs `incident_enrichment` (first-class, not a boolean)
- `parent_report_id` self-reference for enrichment chains
- `crisis_categories TEXT[]` + GIN index — array, not junction table (simpler queries, good enough at this scale)
- `extracted_facts JSONB` — structured extraction output, schema varies by node
- `processing_metadata JSONB` — pipeline audit data

**`report_media`** — attachments, FK to reports, CASCADE delete.
**`translations`** — source/target language, model used, confidence.
**`source_evidence`** — links reports to external corroboration (ACLED events, satellite obs, etc).

### 004: Enrichment Tables

**`infrastructure_objects`** — PostGIS point, type (hospital/bridge/road/market/etc), status, source. GIST index.
**`damage_assessments`** — per-infrastructure, with damage_level, confidence, evidence chain.
**`weather_snapshots`** — per-location weather with pre-computed risk scores.
**`satellite_observations`** — scene ID, acquisition date, cloud cover, change detection results. Partial index on `change_detected = true`.

### 005: Clustering
```sql
CREATE TABLE incident_clusters (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    centroid GEOGRAPHY(Point, 4326) NOT NULL,
    radius_km FLOAT NOT NULL,
    country TEXT NOT NULL,
    country_iso CHAR(3) NOT NULL,
    admin1 TEXT,
    report_count INT NOT NULL DEFAULT 0,
    report_ids UUID[] NOT NULL DEFAULT '{}',
    top_need_categories TEXT[] NOT NULL DEFAULT '{}',
    weighted_severity FLOAT NOT NULL DEFAULT 0,
    weighted_confidence FLOAT NOT NULL DEFAULT 0,
    access_blockers TEXT[] NOT NULL DEFAULT '{}',
    infrastructure_hazards TEXT[] NOT NULL DEFAULT '{}',
    evidence_summary TEXT NOT NULL DEFAULT '',
    last_updated TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_clusters_geom ON incident_clusters USING GIST(centroid);
CREATE INDEX idx_clusters_severity ON incident_clusters(weighted_severity DESC);
```

### 006: Confidence + Audit Trail

`verification_runs` — one per pipeline invocation. Records pipeline_version, node_trace (ordered JSONB array), timing, status. This is the audit log.

`confidence_scores` — FK to report + verification run. Stores publishability, urgency, access_difficulty as separate floats, plus full breakdown as JSONB.

### 007: Job Queue
```sql
CREATE TABLE pipeline_jobs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    report_id UUID NOT NULL REFERENCES reports(id),
    status TEXT NOT NULL DEFAULT 'pending',
    priority INT NOT NULL DEFAULT 0,
    attempts INT NOT NULL DEFAULT 0,
    max_attempts INT NOT NULL DEFAULT 3,
    last_error TEXT,
    node_trace JSONB NOT NULL DEFAULT '[]',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    locked_by TEXT,
    locked_at TIMESTAMPTZ
);

CREATE INDEX idx_jobs_pending ON pipeline_jobs(priority DESC, created_at ASC)
    WHERE status = 'pending';

CREATE OR REPLACE FUNCTION claim_next_job(worker_id TEXT)
RETURNS SETOF pipeline_jobs LANGUAGE sql AS $$
    UPDATE pipeline_jobs
    SET status = 'processing', locked_by = worker_id,
        locked_at = now(), attempts = attempts + 1,
        started_at = COALESCE(started_at, now())
    WHERE id = (
        SELECT id FROM pipeline_jobs
        WHERE status = 'pending' AND attempts < max_attempts
        ORDER BY priority DESC, created_at ASC
        FOR UPDATE SKIP LOCKED LIMIT 1
    ) RETURNING *;
$$;
```

`FOR UPDATE SKIP LOCKED` is the correct pattern here — no advisory locks, no polling, no external queue dependency. Workers call `claim_next_job('worker_id')` and get exactly one job or nothing.

### 008: RLS Policies
- `taxonomy_terms`: public read
- `incident_clusters`: public read (this is the map layer)
- `reports`: authenticated insert, public read
- Everything else: service role only (pipeline backend uses the service key, which bypasses RLS by default in Supabase)

---

## Implementation Tasks

Every task follows TDD: failing test → minimal implementation → green → commit. No exceptions.

---

### Task 1: Python Backend Scaffold

**Creates:** `backend/pyproject.toml` · `main.py` · `config.py` · `.env.example` · `tests/conftest.py`

**pyproject.toml:**
```toml
[project]
name = "tribble-backend"
version = "0.1.0"
requires-python = ">=3.12"
dependencies = [
    "fastapi>=0.115.0",
    "uvicorn[standard]>=0.34.0",
    "pydantic>=2.10.0",
    "pydantic-settings>=2.7.0",
    "httpx>=0.28.0",
    "langgraph>=0.3.0",
    "langchain-core>=0.3.0",
    "supabase>=2.11.0",
    "python-dotenv>=1.0.0",
    "geopy>=2.4.0",
]
[project.optional-dependencies]
dev = ["pytest>=8.3.0", "pytest-asyncio>=0.24.0", "pytest-httpx>=0.35.0", "ruff>=0.8.0"]
[build-system]
requires = ["hatchling"]
build-backend = "hatchling.build"
[tool.pytest.ini_options]
asyncio_mode = "auto"
testpaths = ["tests"]
[tool.ruff]
target-version = "py312"
line-length = 100
```

**config.py:**
```python
from pydantic_settings import BaseSettings

class Settings(BaseSettings):
    supabase_url: str
    supabase_service_key: str
    supabase_anon_key: str
    acled_api_key: str = ""
    acled_email: str = ""
    openweathermap_api_key: str = ""
    zai_api_key: str = ""
    zai_model: str = "glm-4"
    sentinel_stac_url: str = "https://earth-search.aws.element84.com/v1"
    pipeline_max_retries: int = 3
    cluster_radius_km: float = 5.0
    cluster_time_window_hours: int = 72

    class Config:
        env_file = ".env"
        env_prefix = "TRIBBLE_"

settings = Settings()
```

**main.py:**
```python
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

app = FastAPI(title="Tribble", version="0.1.0")
app.add_middleware(CORSMiddleware, allow_origins=["http://localhost:3000"],
                   allow_credentials=True, allow_methods=["*"], allow_headers=["*"])

@app.get("/health")
async def health():
    return {"status": "ok"}
```

**tests/conftest.py:**
```python
import os
os.environ.setdefault("TRIBBLE_SUPABASE_URL", "https://test.supabase.co")
os.environ.setdefault("TRIBBLE_SUPABASE_SERVICE_KEY", "test-key")
os.environ.setdefault("TRIBBLE_SUPABASE_ANON_KEY", "test-key")
```

**Verify:** `pip install -e ".[dev]" && uvicorn tribble.main:app --port 8000` → `/health` returns 200.

**Commit:** `feat: scaffold Python backend with FastAPI and env-driven config`

---

### Task 2: Crisis Taxonomy

**Creates:** `models/taxonomy.py` · migrations 001, 002, 009

**Test:**
```python
from tribble.models.taxonomy import TaxonomyTerm, CrisisCategory

def test_term_creation():
    t = TaxonomyTerm(id="violence_active_threat", label="Violence / Active Threat",
                     category=CrisisCategory.SECURITY, description="Armed conflict or direct threat")
    assert t.category == CrisisCategory.SECURITY

def test_hierarchy():
    t = TaxonomyTerm(id="airstrike", label="Airstrike", category=CrisisCategory.SECURITY,
                     description="Aerial bombardment", parent_id="violence_active_threat")
    assert t.parent_id == "violence_active_threat"
```

**Implementation:**
```python
from enum import StrEnum
from pydantic import BaseModel

class CrisisCategory(StrEnum):
    SECURITY = "security"
    DISPLACEMENT = "displacement"
    HEALTH = "health"
    FOOD = "food"
    WATER_SANITATION = "water_sanitation"
    SHELTER = "shelter"
    INFRASTRUCTURE = "infrastructure"
    ACCESS = "access"
    COMMUNICATIONS = "communications"
    WEATHER = "weather"
    AID = "aid"
    PUBLIC_SERVICE = "public_service"

class TaxonomyTerm(BaseModel):
    id: str
    label: str
    category: CrisisCategory
    description: str
    parent_id: str | None = None
```

Write migrations (PostGIS enable, taxonomy table + seed). 13 terms covering the full humanitarian taxonomy.

**Commit:** `feat: crisis taxonomy — 13 humanitarian categories with hierarchy support`

---

### Task 3: Report + Location Models

**Creates:** `models/report.py` · `models/location.py` · migration 003

**Test:**
```python
from datetime import datetime, timezone
from tribble.models.report import CrisisReport, ReportMode, SourceType, AnonymityLevel

def test_incident_creation():
    r = CrisisReport(
        source_type=SourceType.WEB_IDENTIFIED, mode=ReportMode.INCIDENT_CREATION,
        anonymity=AnonymityLevel.IDENTIFIED,
        timestamp=datetime(2024, 6, 15, 12, 0, tzinfo=timezone.utc),
        latitude=15.5007, longitude=32.5599,
        narrative="Heavy shelling near the market", language="ar",
        crisis_categories=["violence_active_threat", "infrastructure_damage"],
    )
    assert r.mode == ReportMode.INCIDENT_CREATION
    assert len(r.crisis_categories) == 2

def test_enrichment_links_to_parent():
    r = CrisisReport(
        source_type=SourceType.WHATSAPP_ANONYMOUS, mode=ReportMode.INCIDENT_ENRICHMENT,
        anonymity=AnonymityLevel.ANONYMOUS,
        timestamp=datetime(2024, 6, 15, 14, 0, tzinfo=timezone.utc),
        latitude=15.5007, longitude=32.5599,
        narrative="Market destroyed, people trapped under rubble", language="ar",
        crisis_categories=["infrastructure_damage"], parent_report_id="rpt_abc123",
    )
    assert r.parent_report_id == "rpt_abc123"
```

**Implementation — report.py:**
```python
from datetime import datetime
from enum import StrEnum
from pydantic import BaseModel, Field

class SourceType(StrEnum):
    WEB_IDENTIFIED = "web_identified"
    WEB_ANONYMOUS = "web_anonymous"
    WHATSAPP_IDENTIFIED = "whatsapp_identified"
    WHATSAPP_ANONYMOUS = "whatsapp_anonymous"
    ACLED_HISTORICAL = "acled_historical"
    SATELLITE = "satellite"
    WEATHER = "weather"

class ReportMode(StrEnum):
    INCIDENT_CREATION = "incident_creation"
    INCIDENT_ENRICHMENT = "incident_enrichment"

class AnonymityLevel(StrEnum):
    IDENTIFIED = "identified"
    PSEUDONYMOUS = "pseudonymous"
    ANONYMOUS = "anonymous"

class CrisisReport(BaseModel):
    id: str | None = None
    source_type: SourceType
    mode: ReportMode
    anonymity: AnonymityLevel
    timestamp: datetime
    latitude: float = Field(ge=-90, le=90)
    longitude: float = Field(ge=-180, le=180)
    narrative: str
    language: str = "en"
    crisis_categories: list[str] = Field(default_factory=list)
    help_categories: list[str] = Field(default_factory=list)
    media_urls: list[str] = Field(default_factory=list)
    infrastructure_refs: list[str] = Field(default_factory=list)
    parent_report_id: str | None = None
    extracted_facts: dict | None = None
    translation: str | None = None
    processing_metadata: dict = Field(default_factory=dict)
```

**Implementation — location.py:**
```python
from datetime import datetime
from pydantic import BaseModel, Field

class Location(BaseModel):
    id: str | None = None
    name: str | None = None
    admin1: str | None = None
    admin2: str | None = None
    country: str
    country_iso: str = Field(max_length=3)
    latitude: float = Field(ge=-90, le=90)
    longitude: float = Field(ge=-180, le=180)
    precision: str = "approximate"

class LocationCluster(BaseModel):
    id: str | None = None
    centroid_lat: float
    centroid_lng: float
    radius_km: float
    country: str
    admin1: str | None = None
    report_count: int = 0
    created_at: datetime | None = None
    updated_at: datetime | None = None
```

Write migration 003 (locations with PostGIS GIST index, reports with GIN index on categories array, report_media, translations, source_evidence).

**Commit:** `feat: report + location models with dual-mode schema`

---

### Task 4: Enrichment + Infrastructure Models

**Creates:** `models/enrichment.py` · `models/infrastructure.py` · migration 004

**Test:**
```python
from datetime import datetime, timezone
from tribble.models.enrichment import WeatherSnapshot, SatelliteObservation

def test_weather():
    s = WeatherSnapshot(location_id="loc_001", timestamp=datetime(2024, 6, 15, 12, 0, tzinfo=timezone.utc),
                        temperature_c=42.5, humidity_pct=15.0, wind_speed_ms=8.2, condition="clear",
                        flood_risk=0.1, heat_risk=0.9, route_disruption_risk=0.15)
    assert s.heat_risk == 0.9

def test_satellite():
    o = SatelliteObservation(location_id="loc_001", scene_id="S2B_20240615",
                             acquisition_date=datetime(2024, 6, 15, 8, 26, tzinfo=timezone.utc),
                             cloud_cover_pct=12.5, change_detected=True,
                             change_type="infrastructure_damage", change_confidence=0.72)
    assert o.change_detected and o.change_type == "infrastructure_damage"
```

**Implementation — enrichment.py:**
```python
from datetime import datetime
from pydantic import BaseModel, Field

class WeatherSnapshot(BaseModel):
    id: str | None = None
    location_id: str
    timestamp: datetime
    temperature_c: float | None = None
    humidity_pct: float | None = None
    wind_speed_ms: float | None = None
    condition: str | None = None
    precipitation_mm: float | None = None
    flood_risk: float = Field(default=0.0, ge=0, le=1)
    storm_risk: float = Field(default=0.0, ge=0, le=1)
    heat_risk: float = Field(default=0.0, ge=0, le=1)
    route_disruption_risk: float = Field(default=0.0, ge=0, le=1)
    raw_response: dict | None = None

class SatelliteObservation(BaseModel):
    id: str | None = None
    location_id: str
    scene_id: str
    acquisition_date: datetime
    cloud_cover_pct: float = Field(ge=0, le=100)
    resolution_m: float = 10.0
    change_detected: bool = False
    change_type: str | None = None
    change_confidence: float = Field(default=0.0, ge=0, le=1)
    tile_url: str | None = None
    metadata: dict = Field(default_factory=dict)
```

**Implementation — infrastructure.py:**
```python
from datetime import datetime
from pydantic import BaseModel, Field

class InfrastructureObject(BaseModel):
    id: str | None = None
    name: str | None = None
    object_type: str
    latitude: float = Field(ge=-90, le=90)
    longitude: float = Field(ge=-180, le=180)
    country: str
    admin1: str | None = None
    status: str = "operational"
    source: str = "manual"

class DamageAssessment(BaseModel):
    id: str | None = None
    infrastructure_id: str
    assessment_date: datetime
    damage_level: str
    confidence: float = Field(ge=0, le=1)
    source: str
    evidence_ids: list[str] = Field(default_factory=list)
    notes: str | None = None
```

Write migration 004 (infrastructure_objects with GIST, damage_assessments, weather_snapshots, satellite_observations with partial index on change_detected).

**Commit:** `feat: enrichment + infrastructure models and tables`

---

### Task 5: Confidence Scoring

**Creates:** `models/confidence.py` · migration 006

**Test:**
```python
from tribble.models.confidence import ConfidenceScore, ConfidenceBreakdown

def test_publishability_is_bounded():
    b = ConfidenceBreakdown(source_prior=0.7, spam_score=0.05, duplication_score=0.0,
                            completeness_score=0.8, geospatial_consistency=0.9,
                            temporal_consistency=0.85, cross_source_corroboration=0.6,
                            weather_plausibility=0.75, satellite_corroboration=0.0)
    assert 0.0 <= b.compute_publishability() <= 1.0

def test_axes_are_independent():
    s = ConfidenceScore(report_id="r1", publishability=0.85, urgency=0.95, access_difficulty=0.7,
                        breakdown=ConfidenceBreakdown(
                            source_prior=0.8, spam_score=0.02, duplication_score=0.0,
                            completeness_score=0.9, geospatial_consistency=0.85,
                            temporal_consistency=0.9, cross_source_corroboration=0.7,
                            weather_plausibility=0.8, satellite_corroboration=0.3))
    assert s.urgency != s.publishability  # independent, not derived
```

**Implementation:**
```python
from pydantic import BaseModel, Field

class ConfidenceBreakdown(BaseModel):
    source_prior: float = Field(ge=0, le=1)
    spam_score: float = Field(ge=0, le=1)
    duplication_score: float = Field(ge=0, le=1)
    completeness_score: float = Field(ge=0, le=1)
    geospatial_consistency: float = Field(ge=0, le=1)
    temporal_consistency: float = Field(ge=0, le=1)
    cross_source_corroboration: float = Field(ge=0, le=1)
    weather_plausibility: float = Field(ge=0, le=1)
    satellite_corroboration: float = Field(ge=0, le=1)

    def compute_publishability(self) -> float:
        raw = (0.15 * self.source_prior + 0.20 * (1.0 - self.spam_score)
               + 0.10 * self.completeness_score + 0.15 * self.geospatial_consistency
               + 0.10 * self.temporal_consistency + 0.15 * self.cross_source_corroboration
               + 0.05 * self.weather_plausibility + 0.10 * self.satellite_corroboration)
        if self.duplication_score > 0.8:
            raw *= 0.5
        return round(min(max(raw, 0.0), 1.0), 4)

SOURCE_PRIORS: dict[str, float] = {
    "web_identified": 0.80, "web_anonymous": 0.55,
    "whatsapp_identified": 0.65, "whatsapp_anonymous": 0.40,
    "acled_historical": 0.95, "satellite": 0.85, "weather": 0.95,
}

class ConfidenceScore(BaseModel):
    report_id: str
    publishability: float = Field(ge=0, le=1)
    urgency: float = Field(ge=0, le=1)
    access_difficulty: float = Field(ge=0, le=1)
    breakdown: ConfidenceBreakdown
```

Write migration 006 (verification_runs for audit trail, confidence_scores with breakdown JSONB).

**Commit:** `feat: 9-signal confidence scoring with weighted publishability`

---

### Task 6: Incident Cluster Model

**Creates:** `models/cluster.py` · migration 005

**Test:**
```python
from datetime import datetime, timezone
from tribble.models.cluster import IncidentCluster

def test_cluster():
    c = IncidentCluster(
        centroid_lat=15.5, centroid_lng=32.56, radius_km=3.2,
        country="Sudan", country_iso="SDN", report_count=7,
        top_need_categories=["violence_active_threat", "medical_need", "displacement"],
        weighted_severity=0.88, weighted_confidence=0.72,
        access_blockers=["route_blockage"], infrastructure_hazards=["hospital_damaged"],
        evidence_summary="7 reports, 3 sources, 48h.", last_updated=datetime(2024, 6, 16, 18, 0, tzinfo=timezone.utc))
    assert c.weighted_severity > 0.5 and c.report_count == 7
```

**Implementation:**
```python
from datetime import datetime
from pydantic import BaseModel, Field

class IncidentCluster(BaseModel):
    id: str | None = None
    centroid_lat: float = Field(ge=-90, le=90)
    centroid_lng: float = Field(ge=-180, le=180)
    radius_km: float = Field(gt=0)
    country: str
    country_iso: str = Field(max_length=3)
    admin1: str | None = None
    report_count: int = Field(ge=0)
    report_ids: list[str] = Field(default_factory=list)
    top_need_categories: list[str] = Field(default_factory=list)
    weighted_severity: float = Field(ge=0, le=1)
    weighted_confidence: float = Field(ge=0, le=1)
    access_blockers: list[str] = Field(default_factory=list)
    infrastructure_hazards: list[str] = Field(default_factory=list)
    evidence_summary: str = ""
    last_updated: datetime | None = None
```

Write migration 005 (incident_clusters with GIST on centroid, descending index on severity).

**Commit:** `feat: incident cluster — the map display primitive`

---

### Task 7: Queue + RLS

**Creates:** migrations 007, 008

Write the job queue migration with `claim_next_job` and the RLS policies (both specified in the schema section above).

**Commit:** `feat: job queue (SKIP LOCKED) + RLS policies`

---

### Task 8: LangGraph Pipeline

**Creates:** `pipeline/state.py` · `pipeline/graph.py`

This is the critical path. The graph compiles once. Each node is a pure function: `PipelineState → dict` (partial update).

**Test:**
```python
from tribble.pipeline.state import PipelineState, PipelineStatus
from tribble.pipeline.graph import build_pipeline

def _state(**kw) -> PipelineState:
    base: PipelineState = {
        "report_id": "t1", "raw_narrative": "", "source_type": "web_anonymous",
        "latitude": 0.0, "longitude": 0.0, "language": "en",
        "timestamp": "2024-06-15T12:00:00Z", "status": PipelineStatus.INGESTED,
        "node_trace": [], "error": None, "normalized": None, "translation": None,
        "classification": None, "geocoded_location": None, "duplicates_found": [],
        "corroboration_hits": [], "weather_data": None, "satellite_data": None,
        "confidence_breakdown": None, "confidence_scores": None, "cluster_id": None,
    }
    base.update(kw)
    return base

def test_compiles():
    assert build_pipeline() is not None

def test_rejects_empty():
    r = build_pipeline().invoke(_state())
    assert r["status"] == PipelineStatus.REJECTED

def test_full_flow():
    r = build_pipeline().invoke(_state(raw_narrative="Heavy fighting near the airport, families sheltering"))
    assert r["status"] == PipelineStatus.PUBLISHED
    assert len(r["node_trace"]) == 11
    assert r["confidence_scores"] is not None
```

**Implementation — state.py:**
```python
from enum import StrEnum
from typing import TypedDict

class PipelineStatus(StrEnum):
    INGESTED = "ingested"
    PREFILTERED = "prefiltered"
    NORMALIZED = "normalized"
    TRANSLATED = "translated"
    CLASSIFIED = "classified"
    GEOCODED = "geocoded"
    DEDUPLICATED = "deduplicated"
    CORROBORATED = "corroborated"
    WEATHER_ENRICHED = "weather_enriched"
    SATELLITE_ENRICHED = "satellite_enriched"
    SCORED = "scored"
    PUBLISHED = "published"
    REJECTED = "rejected"
    ERROR = "error"

class PipelineState(TypedDict):
    report_id: str
    raw_narrative: str
    source_type: str
    latitude: float
    longitude: float
    language: str
    timestamp: str
    status: PipelineStatus
    node_trace: list[str]
    error: str | None
    normalized: dict | None
    translation: str | None
    classification: dict | None
    geocoded_location: dict | None
    duplicates_found: list[str]
    corroboration_hits: list[dict]
    weather_data: dict | None
    satellite_data: dict | None
    confidence_breakdown: dict | None
    confidence_scores: dict | None
    cluster_id: str | None
```

**Implementation — graph.py:**
```python
from typing import Literal
from langgraph.graph import StateGraph, START, END
from tribble.pipeline.state import PipelineState, PipelineStatus

def prefilter(state: PipelineState) -> dict:
    trace = state["node_trace"] + ["prefilter"]
    narrative = (state.get("raw_narrative") or "").strip()
    if not narrative or len(narrative) < 10:
        return {"status": PipelineStatus.REJECTED, "node_trace": trace, "error": "Too short"}
    return {"status": PipelineStatus.PREFILTERED, "node_trace": trace}

def normalize(state: PipelineState) -> dict:
    trace = state["node_trace"] + ["normalize"]
    return {"status": PipelineStatus.NORMALIZED, "node_trace": trace,
            "normalized": {"narrative_clean": state["raw_narrative"].strip(),
                           "word_count": len(state["raw_narrative"].split())}}

def translate(state: PipelineState) -> dict:
    trace = state["node_trace"] + ["translate"]
    t = None if state.get("language") == "en" else state["raw_narrative"]
    return {"status": PipelineStatus.TRANSLATED, "node_trace": trace, "translation": t}

def classify(state: PipelineState) -> dict:
    trace = state["node_trace"] + ["classify"]
    return {"status": PipelineStatus.CLASSIFIED, "node_trace": trace,
            "classification": {"crisis_categories": [], "help_categories": [], "urgency_hint": "medium"}}

def geocode(state: PipelineState) -> dict:
    trace = state["node_trace"] + ["geocode"]
    return {"status": PipelineStatus.GEOCODED, "node_trace": trace,
            "geocoded_location": {"latitude": state["latitude"], "longitude": state["longitude"],
                                  "precision": "approximate"}}

def deduplicate(state: PipelineState) -> dict:
    trace = state["node_trace"] + ["deduplicate"]
    return {"status": PipelineStatus.DEDUPLICATED, "node_trace": trace, "duplicates_found": []}

def corroborate(state: PipelineState) -> dict:
    trace = state["node_trace"] + ["corroborate"]
    return {"status": PipelineStatus.CORROBORATED, "node_trace": trace, "corroboration_hits": []}

def enrich_weather(state: PipelineState) -> dict:
    return {"status": PipelineStatus.WEATHER_ENRICHED, "node_trace": state["node_trace"] + ["enrich_weather"]}

def enrich_satellite(state: PipelineState) -> dict:
    return {"status": PipelineStatus.SATELLITE_ENRICHED, "node_trace": state["node_trace"] + ["enrich_satellite"]}

def score(state: PipelineState) -> dict:
    trace = state["node_trace"] + ["score"]
    return {"status": PipelineStatus.SCORED, "node_trace": trace,
            "confidence_breakdown": {"source_prior": 0.5, "spam_score": 0.05, "duplication_score": 0.0,
                                     "completeness_score": 0.5, "geospatial_consistency": 0.5,
                                     "temporal_consistency": 0.5, "cross_source_corroboration": 0.0,
                                     "weather_plausibility": 0.5, "satellite_corroboration": 0.0},
            "confidence_scores": {"publishability": 0.5, "urgency": 0.5, "access_difficulty": 0.3}}

def cluster_node(state: PipelineState) -> dict:
    return {"status": PipelineStatus.PUBLISHED, "node_trace": state["node_trace"] + ["cluster"]}

def _route_prefilter(state: PipelineState) -> Literal["normalize", "__end__"]:
    return END if state["status"] == PipelineStatus.REJECTED else "normalize"

def build_pipeline():
    g = StateGraph(PipelineState)
    for name, fn in [("prefilter", prefilter), ("normalize", normalize), ("translate", translate),
                     ("classify", classify), ("geocode", geocode), ("deduplicate", deduplicate),
                     ("corroborate", corroborate), ("enrich_weather", enrich_weather),
                     ("enrich_satellite", enrich_satellite), ("score", score), ("cluster", cluster_node)]:
        g.add_node(name, fn)
    g.add_edge(START, "prefilter")
    g.add_conditional_edges("prefilter", _route_prefilter)
    for a, b in [("normalize", "translate"), ("translate", "classify"), ("classify", "geocode"),
                 ("geocode", "deduplicate"), ("deduplicate", "corroborate"), ("corroborate", "enrich_weather"),
                 ("enrich_weather", "enrich_satellite"), ("enrich_satellite", "score"), ("score", "cluster")]:
        g.add_edge(a, b)
    g.add_edge("cluster", END)
    return g.compile()
```

Every node is a placeholder that will be wired to real services. The *graph structure* is final — the node implementations evolve.

**Commit:** `feat: 11-node LangGraph pipeline with conditional rejection`

---

### Task 9: ACLED Adapter

**Creates:** `ingest/acled.py`

**Test:**
```python
from tribble.ingest.acled import ACLEDClient, acled_event_to_crisis_report

SAMPLE = {"event_id_cnty": "SDN12345", "event_date": "2023-04-15", "event_type": "Battles",
          "sub_event_type": "Armed clash", "actor1": "SAF", "actor2": "RSF",
          "admin1": "Khartoum", "location": "Khartoum", "latitude": "15.5007",
          "longitude": "32.5599", "fatalities": "12", "notes": "Clashes near airport.",
          "country": "Sudan", "iso3": "SDN"}

def test_to_report():
    r = acled_event_to_crisis_report(SAMPLE)
    assert r.source_type == "acled_historical" and r.latitude == 15.5007
    assert "violence_active_threat" in r.crisis_categories

def test_protest_mapping():
    p = {**SAMPLE, "event_type": "Protests", "sub_event_type": "Peaceful protest", "fatalities": "0"}
    assert "violence_active_threat" not in acled_event_to_crisis_report(p).crisis_categories

async def test_url_construction():
    url = ACLEDClient("k", "e")._build_url("Sudan", 2023, 100)
    assert "country=Sudan" in url and "year=2023" in url
```

**Implementation:**
```python
from datetime import datetime, timezone
from urllib.parse import urlencode
import httpx
from tribble.models.report import CrisisReport, ReportMode, SourceType, AnonymityLevel

ACLED_BASE_URL = "https://api.acleddata.com/acled/read"
EVENT_TYPE_MAP: dict[str, list[str]] = {
    "Battles": ["violence_active_threat"],
    "Explosions/Remote violence": ["violence_active_threat", "infrastructure_damage"],
    "Violence against civilians": ["violence_active_threat"],
    "Protests": ["public_service_interruption"],
    "Riots": ["violence_active_threat", "public_service_interruption"],
    "Strategic developments": ["aid_delivery_update"],
}

def acled_event_to_crisis_report(event: dict) -> CrisisReport:
    event_type = event.get("event_type", "")
    cats = list(EVENT_TYPE_MAP.get(event_type, []))
    fatalities = int(event.get("fatalities", 0) or 0)
    if fatalities > 0 and "violence_active_threat" not in cats:
        cats.append("violence_active_threat")
    try:
        ts = datetime.strptime(event["event_date"], "%Y-%m-%d").replace(tzinfo=timezone.utc)
    except (ValueError, KeyError):
        ts = datetime.now(timezone.utc)
    return CrisisReport(
        source_type=SourceType.ACLED_HISTORICAL, mode=ReportMode.INCIDENT_CREATION,
        anonymity=AnonymityLevel.IDENTIFIED, timestamp=ts,
        latitude=float(event.get("latitude", 0)), longitude=float(event.get("longitude", 0)),
        narrative=f"[ACLED] {event_type}: {event.get('sub_event_type', '')}. {event.get('notes', '')}",
        language="en", crisis_categories=cats,
        processing_metadata={"acled_event_id": event.get("event_id_cnty"),
                             "acled_event_type": event_type, "acled_fatalities": fatalities,
                             "acled_actors": [event.get("actor1"), event.get("actor2")],
                             "acled_country_iso": event.get("iso3")})

class ACLEDClient:
    def __init__(self, api_key: str, email: str):
        self.api_key, self.email = api_key, email
        self._http = httpx.AsyncClient(timeout=30.0)

    def _build_url(self, country: str, year: int, limit: int = 500, page: int = 1) -> str:
        return f"{ACLED_BASE_URL}?{urlencode({'key': self.api_key, 'email': self.email, 'country': country, 'year': str(year), 'limit': str(limit), 'page': str(page)})}"

    async def fetch_events(self, country: str, year: int, limit: int = 500) -> list[dict]:
        r = await self._http.get(self._build_url(country, year, limit))
        r.raise_for_status()
        return r.json().get("data", [])

    async def import_as_reports(self, country: str, year: int, limit: int = 500) -> list[CrisisReport]:
        return [acled_event_to_crisis_report(e) for e in await self.fetch_events(country, year, limit)]
```

**Commit:** `feat: ACLED adapter with event-type → crisis-category mapping`

---

### Task 10: Weather Enrichment

**Creates:** `ingest/weather.py`

**Test:**
```python
from tribble.ingest.weather import compute_weather_risks, WeatherConditions

def test_flood():
    r = compute_weather_risks(WeatherConditions(25.0, 95.0, 3.0, "Rain", 50.0))
    assert r.flood_risk > 0.5

def test_heat():
    r = compute_weather_risks(WeatherConditions(48.0, 10.0, 2.0, "Clear", 0.0))
    assert r.heat_risk > 0.8 and r.flood_risk < 0.1

def test_storm():
    r = compute_weather_risks(WeatherConditions(20.0, 80.0, 25.0, "Thunderstorm", 30.0))
    assert r.storm_risk > 0.5
```

**Implementation:**
```python
from dataclasses import dataclass
import httpx
from tribble.config import settings

@dataclass
class WeatherConditions:
    temperature_c: float
    humidity_pct: float
    wind_speed_ms: float
    condition: str
    precipitation_mm: float = 0.0

@dataclass
class WeatherRisks:
    flood_risk: float
    storm_risk: float
    heat_risk: float
    route_disruption_risk: float

def compute_weather_risks(c: WeatherConditions) -> WeatherRisks:
    flood = min(c.precipitation_mm / 60.0, 1.0)
    wind = min(c.wind_speed_ms / 30.0, 1.0)
    storm = min(wind * 0.6 + (1.0 if "thunderstorm" in c.condition.lower() else 0.0) * 0.4, 1.0)
    heat = 1.0 if c.temperature_c >= 45 else max((c.temperature_c - 35) / 10.0, 0.0) if c.temperature_c >= 35 else 0.0
    route = min(flood * 0.5 + storm * 0.3 + heat * 0.2, 1.0)
    return WeatherRisks(round(flood, 3), round(storm, 3), round(heat, 3), round(route, 3))

async def fetch_weather(lat: float, lon: float) -> WeatherConditions:
    async with httpx.AsyncClient(timeout=10.0) as client:
        r = await client.get("https://api.openweathermap.org/data/2.5/weather",
                             params={"lat": lat, "lon": lon, "appid": settings.openweathermap_api_key, "units": "metric"})
        r.raise_for_status()
        d = r.json()
    return WeatherConditions(d.get("main", {}).get("temp", 0), d.get("main", {}).get("humidity", 0),
                             d.get("wind", {}).get("speed", 0), d.get("weather", [{}])[0].get("main", "Unknown"),
                             d.get("rain", {}).get("1h", 0))
```

**Commit:** `feat: deterministic weather risk computation`

---

### Task 11: Sentinel-2 STAC Adapter

**Creates:** `ingest/satellite.py`

**Test:**
```python
from tribble.ingest.satellite import build_stac_search_params

def test_params():
    p = build_stac_search_params(15.5, 32.56, "2023-04-01", "2023-04-30", 20)
    assert p["collections"] == ["sentinel-2-l2a"]
    assert p["intersects"]["coordinates"] == [32.56, 15.5]

def test_default_cloud():
    assert build_stac_search_params(0, 0, "2024-01-01", "2024-01-31")["query"]["eo:cloud_cover"]["lte"] == 30
```

**Implementation:**
```python
import httpx

def build_stac_search_params(lat: float, lon: float, date_from: str, date_to: str,
                              max_cloud_cover: int = 30, limit: int = 10) -> dict:
    return {"collections": ["sentinel-2-l2a"],
            "intersects": {"type": "Point", "coordinates": [lon, lat]},
            "datetime": f"{date_from}T00:00:00Z/{date_to}T23:59:59Z",
            "query": {"eo:cloud_cover": {"lte": max_cloud_cover}},
            "limit": limit, "sortby": [{"field": "datetime", "direction": "desc"}]}

async def search_sentinel2_scenes(lat: float, lon: float, date_from: str, date_to: str,
                                    max_cloud_cover: int = 30) -> list[dict]:
    params = build_stac_search_params(lat, lon, date_from, date_to, max_cloud_cover)
    async with httpx.AsyncClient(timeout=30.0) as c:
        r = await c.post("https://earth-search.aws.element84.com/v1/search", json=params)
        r.raise_for_status()
    return [{"scene_id": f["id"], "acquisition_date": f.get("properties", {}).get("datetime"),
             "cloud_cover_pct": f.get("properties", {}).get("eo:cloud_cover", 0),
             "tile_url": (f["links"][0]["href"] if f.get("links") else None), "bbox": f.get("bbox")}
            for f in r.json().get("features", [])]
```

**Commit:** `feat: Sentinel-2 STAC satellite scene search`

---

### Task 12: Report Submission API

**Creates:** `db.py` · `api/reports.py`

**Test:**
```python
from fastapi.testclient import TestClient
from tribble.main import app
client = TestClient(app)

def test_rejects_invalid():
    assert client.post("/api/reports", json={}).status_code == 422

def test_accepts_valid():
    r = client.post("/api/reports", json={
        "latitude": 15.5, "longitude": 32.56,
        "narrative": "Heavy fighting near the market, several buildings damaged",
        "crisis_categories": ["violence_active_threat"]})
    assert r.status_code in (201, 503)
```

**db.py:**
```python
from supabase import create_client, Client
from tribble.config import settings

_client: Client | None = None

def get_supabase() -> Client:
    global _client
    if _client is None:
        _client = create_client(settings.supabase_url, settings.supabase_service_key)
    return _client
```

**api/reports.py:**
```python
from datetime import datetime, timezone
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field
from tribble.db import get_supabase
from tribble.models.report import SourceType, ReportMode, AnonymityLevel

router = APIRouter(prefix="/api/reports", tags=["reports"])

class ReportSubmission(BaseModel):
    latitude: float = Field(ge=-90, le=90)
    longitude: float = Field(ge=-180, le=180)
    narrative: str = Field(min_length=10, max_length=5000)
    language: str = "en"
    crisis_categories: list[str] = Field(default_factory=list)
    help_categories: list[str] = Field(default_factory=list)
    anonymous: bool = True
    parent_report_id: str | None = None

class ReportResponse(BaseModel):
    report_id: str
    status: str

@router.post("", status_code=201, response_model=ReportResponse)
async def submit_report(sub: ReportSubmission):
    try:
        db = get_supabase()
    except Exception:
        raise HTTPException(503, "Database unavailable")
    mode = ReportMode.INCIDENT_ENRICHMENT if sub.parent_report_id else ReportMode.INCIDENT_CREATION
    anon = AnonymityLevel.ANONYMOUS if sub.anonymous else AnonymityLevel.IDENTIFIED
    src = SourceType.WEB_ANONYMOUS if sub.anonymous else SourceType.WEB_IDENTIFIED
    loc = db.table("locations").insert({"country": "Unknown", "country_iso": "UNK",
                                        "geom": f"POINT({sub.longitude} {sub.latitude})"}).execute()
    rpt = db.table("reports").insert({
        "source_type": src, "mode": mode, "anonymity": anon,
        "event_timestamp": datetime.now(timezone.utc).isoformat(),
        "location_id": loc.data[0]["id"], "narrative": sub.narrative,
        "language": sub.language, "crisis_categories": sub.crisis_categories,
        "help_categories": sub.help_categories, "parent_report_id": sub.parent_report_id,
        "processing_metadata": {}}).execute()
    rid = rpt.data[0]["id"]
    db.table("pipeline_jobs").insert({"report_id": rid, "priority": 0}).execute()
    return ReportResponse(report_id=rid, status="queued")
```

Register in `main.py`:
```python
from tribble.api.reports import router as reports_router
app.include_router(reports_router)
```

**Commit:** `feat: report submission API with auto-enqueue`

---

### Task 13: GeoJSON Cluster API

**Creates:** `api/clusters.py`

**Test:**
```python
from fastapi.testclient import TestClient
from tribble.main import app
client = TestClient(app)

def test_endpoint_exists():
    assert client.get("/api/clusters").status_code in (200, 503)

def test_accepts_bbox():
    assert client.get("/api/clusters?bbox=30,14,35,17").status_code in (200, 503)
```

**Implementation:**
```python
from fastapi import APIRouter, HTTPException, Query
from tribble.db import get_supabase

router = APIRouter(prefix="/api/clusters", tags=["clusters"])

@router.get("")
async def get_clusters(bbox: str | None = Query(None), min_severity: float = Query(0.0, ge=0, le=1),
                       country_iso: str | None = None, limit: int = Query(200, ge=1, le=1000)):
    try:
        db = get_supabase()
    except Exception:
        raise HTTPException(503, "Database unavailable")
    q = db.table("incident_clusters").select("*").gte("weighted_severity", min_severity).order(
        "weighted_severity", desc=True).limit(limit)
    if country_iso:
        q = q.eq("country_iso", country_iso)
    clusters = (q.execute()).data or []
    return {"type": "FeatureCollection", "features": [{
        "type": "Feature",
        "geometry": {"type": "Point", "coordinates": [c.get("centroid_lng", 0), c.get("centroid_lat", 0)]},
        "properties": {k: c[k] for k in ["id", "report_count", "weighted_severity", "weighted_confidence",
                                           "top_need_categories", "access_blockers", "infrastructure_hazards",
                                           "evidence_summary", "radius_km", "country", "last_updated"]},
    } for c in clusters]}
```

Register in `main.py`. **Commit:** `feat: GeoJSON cluster API for map layer`

---

### Task 14: NGO Briefing Generator

**Creates:** `services/briefing.py`

**Test:**
```python
from tribble.services.briefing import generate_cluster_briefing

def test_briefing():
    b = generate_cluster_briefing({"country": "Sudan", "admin1": "Khartoum", "report_count": 12,
                                   "weighted_severity": 0.88, "weighted_confidence": 0.75,
                                   "top_need_categories": ["violence_active_threat", "medical_need"],
                                   "access_blockers": ["route_blockage"],
                                   "infrastructure_hazards": ["hospital_damaged"],
                                   "evidence_summary": "12 reports, 4 sources.",
                                   "weather_risks": {"heat_risk": 0.7}})
    assert "Sudan" in b and "Khartoum" in b and len(b) > 100
```

**Implementation:**
```python
def _sev(s: float) -> str:
    return "CRITICAL" if s >= 0.8 else "HIGH" if s >= 0.6 else "MODERATE" if s >= 0.4 else "LOW"

def generate_cluster_briefing(c: dict) -> str:
    admin1 = c.get("admin1", "")
    loc = f"{admin1}, {c['country']}" if admin1 else c["country"]
    lines = [f"## Situation Briefing: {loc}", "",
             f"**Severity:** {_sev(c.get('weighted_severity', 0))} ({c.get('weighted_severity', 0):.0%})",
             f"**Confidence:** {c.get('weighted_confidence', 0):.0%}",
             f"**Reports:** {c.get('report_count', 0)}", ""]
    for label, key in [("Priority Needs", "top_need_categories"), ("Access Blockers", "access_blockers"),
                       ("Infrastructure Hazards", "infrastructure_hazards")]:
        items = c.get(key, [])
        if items:
            lines.append(f"**{label}:**")
            lines.extend(f"- {i.replace('_', ' ').title()}" for i in items)
            lines.append("")
    wx = c.get("weather_risks", {})
    warns = [n for k, n in [("flood_risk", "flood"), ("heat_risk", "extreme heat"),
                             ("storm_risk", "storm")] if wx.get(k, 0) > 0.5]
    if warns:
        lines.extend([f"**Weather:** {', '.join(warns)}", ""])
    if c.get("evidence_summary"):
        lines.extend([f"**Evidence:** {c['evidence_summary']}", ""])
    return "\n".join(lines)
```

Template-based intentionally. LLM summarization layers on top later — this version is auditable and deterministic.

**Commit:** `feat: deterministic NGO briefing generator`

---

### Task 15: Next.js Supabase Client

**Creates:** `tribble/lib/supabase/client.ts` · `server.ts`

```bash
cd tribble && npm install @supabase/supabase-js @supabase/ssr
```

**client.ts:**
```typescript
import { createBrowserClient } from "@supabase/ssr";
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!
  );
}
```

**server.ts:**
```typescript
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
export async function createClient() {
  const cs = await cookies();
  return createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, {
      cookies: {
        getAll() { return cs.getAll(); },
        setAll(c) { try { c.forEach(({ name, value, options }) => cs.set(name, value, options)); } catch {} },
      },
    });
}
```

Create `.env.local.example` with Supabase + Mapbox + API URL placeholders.

**Commit:** `feat: Supabase SSR client for Next.js 16`

---

### Task 16: Demo Seed Data Generator

**Creates:** `ingest/seed.py`

**Test:**
```python
from tribble.ingest.seed import generate_dummy_reports

def test_generates_correct_count():
    reports = generate_dummy_reports(count=10)
    assert len(reports) == 10
    for r in reports:
        assert r.latitude != 0 and len(r.narrative) > 20 and len(r.crisis_categories) > 0
```

**Implementation:**
```python
import random
from datetime import datetime, timedelta, timezone
from tribble.models.report import CrisisReport, ReportMode, SourceType, AnonymityLevel

SCENARIOS = [
    {"t": "Heavy gunfire near {loc}, families sheltering", "c": ["violence_active_threat"],
     "lat": (15.48, 15.62), "lng": (32.50, 32.60)},
    {"t": "Hospital in {loc} overwhelmed, no supplies", "c": ["medical_need", "infrastructure_damage"],
     "lat": (15.50, 15.58), "lng": (32.52, 32.58)},
    {"t": "Families displaced from {loc}, moving south on foot", "c": ["displacement", "shelter_need"],
     "lat": (15.45, 15.55), "lng": (32.48, 32.56)},
    {"t": "Water cut off in {loc} for 3 days", "c": ["water_access"],
     "lat": (15.52, 15.60), "lng": (32.54, 32.62)},
    {"t": "Bridge near {loc} destroyed, aid trucks blocked", "c": ["route_blockage", "infrastructure_damage"],
     "lat": (15.49, 15.56), "lng": (32.51, 32.58)},
    {"t": "Food distribution in {loc} looted", "c": ["food_insecurity"],
     "lat": (15.50, 15.57), "lng": (32.52, 32.60)},
]
LOCS = ["Omdurman", "Bahri", "central Khartoum", "Al-Kalakla", "Soba", "the airport area", "the market district"]
SRCS = [(SourceType.WEB_IDENTIFIED, AnonymityLevel.IDENTIFIED), (SourceType.WEB_ANONYMOUS, AnonymityLevel.ANONYMOUS),
        (SourceType.WHATSAPP_IDENTIFIED, AnonymityLevel.IDENTIFIED), (SourceType.WHATSAPP_ANONYMOUS, AnonymityLevel.ANONYMOUS)]

def generate_dummy_reports(count: int = 50, **_) -> list[CrisisReport]:
    base = datetime(2023, 4, 15, 6, 0, tzinfo=timezone.utc)
    out = []
    for _ in range(count):
        s = random.choice(SCENARIOS)
        src, anon = random.choice(SRCS)
        out.append(CrisisReport(
            source_type=src, mode=ReportMode.INCIDENT_CREATION, anonymity=anon,
            timestamp=base + timedelta(hours=random.uniform(0, 168)),
            latitude=round(random.uniform(*s["lat"]), 6), longitude=round(random.uniform(*s["lng"]), 6),
            narrative=s["t"].format(loc=random.choice(LOCS)),
            language=random.choice(["en", "ar", "ar", "ar"]), crisis_categories=s["c"]))
    return out
```

**Commit:** `feat: Khartoum 2023 demo seed generator`

---

### Task 17: Integration Tests

**Creates:** `tests/test_pipeline/test_integration.py`

```python
from tribble.pipeline.graph import build_pipeline
from tribble.pipeline.state import PipelineState, PipelineStatus
from tribble.ingest.seed import generate_dummy_reports
from tribble.ingest.acled import acled_event_to_crisis_report

def _to_state(r) -> PipelineState:
    return {"report_id": r.id or "t", "raw_narrative": r.narrative, "source_type": r.source_type,
            "latitude": r.latitude, "longitude": r.longitude, "language": r.language,
            "timestamp": r.timestamp.isoformat(), "status": PipelineStatus.INGESTED,
            "node_trace": [], "error": None, "normalized": None, "translation": None,
            "classification": None, "geocoded_location": None, "duplicates_found": [],
            "corroboration_hits": [], "weather_data": None, "satellite_data": None,
            "confidence_breakdown": None, "confidence_scores": None, "cluster_id": None}

def test_dummy_report_e2e():
    r = build_pipeline().invoke(_to_state(generate_dummy_reports(1)[0]))
    assert r["status"] == PipelineStatus.PUBLISHED and len(r["node_trace"]) == 11

def test_acled_event_e2e():
    e = {"event_id_cnty": "SDN12345", "event_date": "2023-04-15", "event_type": "Battles",
         "sub_event_type": "Armed clash", "actor1": "SAF", "actor2": "RSF", "admin1": "Khartoum",
         "location": "Khartoum", "latitude": "15.5", "longitude": "32.56", "fatalities": "5",
         "notes": "Clashes near airport", "country": "Sudan", "iso3": "SDN"}
    assert build_pipeline().invoke(_to_state(acled_event_to_crisis_report(e)))["status"] == PipelineStatus.PUBLISHED

def test_batch_20():
    results = [build_pipeline().invoke(_to_state(r)) for r in generate_dummy_reports(20)]
    assert all(r["status"] in (PipelineStatus.PUBLISHED, PipelineStatus.REJECTED) for r in results)
    assert sum(1 for r in results if r["status"] == PipelineStatus.PUBLISHED) > 0
```

**Commit:** `test: e2e pipeline integration (dummy + ACLED + batch)`

---

### Task 18: Full Suite Green

```bash
cd backend && pytest -v
```

All green. **Commit:** `chore: full test suite passing`

---

## Summary

| Task | Artifact | What it proves |
|------|----------|---------------|
| 1 | Backend scaffold | FastAPI boots, config loads from env |
| 2 | Taxonomy | Ontology is typed, hierarchical, seed-populated |
| 3 | Reports + locations | Dual-mode schema works (creation + enrichment) |
| 4 | Enrichment + infra | Weather/satellite/infrastructure models are bounded |
| 5 | Confidence | 9 signals compose into 3 independent output scores |
| 6 | Clusters | Map primitive aggregates correctly |
| 7 | Queue + RLS | Jobs claim atomically, RLS enforces access |
| 8 | Pipeline | 11 nodes compile, reject spam, pass valid reports |
| 9 | ACLED | Event types map to crisis categories correctly |
| 10 | Weather | Risk computation is deterministic and bounded |
| 11 | Satellite | STAC search params are correct |
| 12 | Report API | Submissions validate, persist, and enqueue |
| 13 | Cluster API | GeoJSON serves correctly |
| 14 | Briefing | Template produces readable NGO summaries |
| 15 | Frontend DB | Supabase SSR client wired for Next.js 16 |
| 16 | Seed data | Generator produces realistic Khartoum reports |
| 17 | Integration | Pipeline handles all source types end-to-end |
| 18 | Suite green | Everything works together |

## Out of Scope (Deliberately)

| What | Why not now |
|------|-----------|
| Z.ai/GLM integration | Placeholder nodes are ready; wire when keys arrive |
| OpenClaw assistant | Layers on top of a working backend |
| FLock decentralization | Extensibility path, not a demo dependency |
| WhatsApp Business | Requires Twilio/Meta setup |
| Mapbox map UI | Consumes the cluster API; backend-first |
| Supabase Realtime | Push updates after the batch pipeline works |
| Auth + roles | NGO operator accounts come after the data flows |
| Satellite ML | Actual change detection needs a vision pipeline |
