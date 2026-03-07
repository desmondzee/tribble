# Humanitarian Intelligence Platform Stage 2 Implementation Plan

> **For Codex:** Use the `executing-plans` skill to implement this plan task-by-task.

**Goal:** Deliver Stage 2 capabilities on top of the existing backend: a narrow API assistant (OpenClaw-inspired), FLock provider integration, satellite ML groundwork, Mapbox UI transition, Supabase Realtime, and a research-backed path for Z.ai/GLM integration.

**Architecture:** Keep the deterministic LangGraph pipeline as the core. Add new capabilities behind explicit feature flags so production behavior remains stable while Stage 2 tracks are incrementally enabled. Treat external systems (FLock, Z.ai, compression provider) as adapter boundaries with graceful fallbacks and test doubles.

**Tech Stack:** Python 3.12, FastAPI, LangGraph, Supabase/PostGIS, React 18 + Vite, Mapbox GL JS, Supabase Realtime, pytest, Vitest.

---

## Phase Scope

| Phase | Item | Priority | Execution Rule |
|---|---|---|---|
| Now | OpenClaw narrow API assistant | High | Backend `/api/assistant/query` only; optional LLM enhancement later |
| Now | FLock decentralization dependency | High | Ship OpenAI-compatible provider adapter with non-blocking assistant fallback |
| Now | Satellite intelligence track (hack-track aligned) | High | Sentinel-2 via Planetary Computer, RGB/NDVI/change/flood analytics, SCL quality gating, and pipeline fusion wiring |
| Now | Continuous fake-data streaming ingestion (production path) | High | Drive `POST /api/reports` continuously, process via queue worker, and publish realtime stats |
| Next | Mapbox map UI | High | Replace placeholder map path with API-backed Mapbox component |
| Next | Supabase Realtime | High | Push cluster/report updates after base flow is stable |
| Next | Z.ai/GLM integration research + wiring | Medium | Document integration findings and add provider abstraction |
| Later | Auth + roles | Low | Defer until operator workflows stabilize |
| Later | WhatsApp Business | Low | Defer pending Twilio/Meta setup |

## Execution Rules

- TDD only: failing test -> minimal implementation -> green -> commit.
- Execute in batches of 3 tasks, report status, wait for feedback.
- No hidden scope expansion: only items listed in this Stage 2 plan.

## Narrow Assistant Scope (Locked)

**In scope now:**
- Deterministic backend assistant response generation
- Assistant response contracts and citations
- `POST /api/assistant/query` API route
- Optional provider abstraction behind feature flags

**Out of scope for this Stage 2 track:**
- WhatsApp/Telegram/Discord/iMessage gateway integration
- Browser automation tools, shell execution tooling, or skill runtime orchestration
- Cron/heartbeat/webhook automation for assistant workflows
- Full "personal agent OS" behavior

## Satellite Track Requirements (Hack-Track Context)

Source context: `/Users/james/Downloads/TCC x Imperial AI Hack Track.pdf`

- Primary source: Sentinel-2 metadata discovery via Planetary Computer STAC.
- Core analytics: RGB preview metadata + NDVI + NDWI/MNDWI + before/after change metrics.
- Quality handling: SCL/cloud/noise gating must down-rank low-quality scenes.
- Disaster-response flow: "watch -> detect -> deliver" deterministic output object.
- Multi-source fusion: satellite + weather + incident reports must combine into one publishable alert score.
- Edge-case behavior: cloud-heavy scenes do not crash pipeline; they degrade confidence with explicit reason codes.

## Satellite Use-Case Walkthrough (Concrete)

### Use Case A: Flooded Access Route Near Khartoum

**Trigger:** Multiple incoming reports mention roads becoming impassable after heavy rain.

**What the system does:**
- Pulls Sentinel-2 candidate scenes (before/after window) from Planetary Computer STAC.
- Applies quality gating (cloud cover + SCL clear-sky ratio).
- Computes NDWI/MNDWI deltas and change score for the route corridor.
- Fuses satellite signal with weather flood risk and cross-source corroboration.
- Produces a deterministic alert stage:
  - `watch` (weak evidence),
  - `detect` (moderate aligned evidence),
  - `deliver` (strong multi-source evidence).

**Output consumed by app:**
- Updated cluster confidence + access difficulty.
- Structured `satellite_alert` payload with reason codes and source scene IDs.
- Realtime update event for map/operator panel.

### Use Case B: Infrastructure Damage Verification

**Trigger:** Reports claim bridge or hospital damage.

**What the system does:**
- Selects before/after Sentinel-2 scenes at location.
- Calculates spectral change and quality score.
- If quality is acceptable, boosts satellite corroboration; if poor quality, keeps report but marks low-confidence satellite evidence.
- Updates evidence summary with explicit satellite confidence reason.

## Continuous Streaming Demo Requirements

- The demo path must be the same as production: `ingest -> queue -> pipeline -> cluster -> realtime`.
- Synthetic event generator must use `POST /api/reports` (no direct table inserts in simulator).
- Stream runs continuously with configurable event rate, source mix, and chaos/noise ratio.
- Backpressure must be visible via queue depth and processing lag metrics.
- Every processed item must expose a traceable status (`queued`, `processing`, `published`, `rejected`, `error`).
- Data model is source-agnostic: new source types can be ingested via adapter mapping without changing pipeline core.

## Implementation Depth Policy (Now vs Later)

**Implemented now in Stage 2 (working baseline, not stubs):**
- Real queue + worker loop processing continuously.
- Real synthetic traffic generator posting through production ingestion endpoint.
- Real Sentinel-2 scene discovery calls to configured STAC endpoint.
- Real deterministic index calculations (NDVI/NDWI/MNDWI) and flood/change scoring.
- Real quality gating and deterministic confidence impact logic.
- Real API surfaces for simulator/worker/stream metrics used by demo UI.

**Deferred to later stages:**
- Full raster tile processing/visualization pipeline and heavy geospatial batch jobs.
- Advanced ML training/inference for per-pixel segmentation at scale.
- Non-core channels and orchestration layers (WhatsApp Business, full agent OS behaviors).
- Cost/latency optimization for production-scale satellite workloads.

## FLock Implementation Notes (Researched)

- Use FLock API Platform as an optional inference provider (OpenAI-compatible endpoint).
- Base URL: `https://api.flock.io/v1`.
- Auth header: `x-litellm-api-key: <key>`.
- Primary endpoint: `POST /chat/completions` (supports streaming mode).
- Discovery endpoint: `GET /models` for runtime model validation.
- Fallback rule: if key/model/network fails, remain deterministic and return non-LLM assistant response.

---

### Task 1: Stage 2 Feature Flags + Config Surface

**Files:**
- Modify: `backend/src/tribble/config.py`
- Modify: `backend/.env.example`
- Create: `backend/tests/test_stage2_config.py`
- Create: `frontend/.env.example`
- Modify: `frontend/src/vite-env.d.ts`

**Step 1: Write the failing test**

```python
from tribble.config import Settings


def test_stage2_flags_default_to_safe_values(monkeypatch):
    monkeypatch.setenv("TRIBBLE_SUPABASE_URL", "https://test.supabase.co")
    monkeypatch.setenv("TRIBBLE_SUPABASE_SERVICE_KEY", "svc")
    monkeypatch.setenv("TRIBBLE_SUPABASE_ANON_KEY", "anon")
    s = Settings()
    assert s.enable_openclaw is False
    assert s.enable_flock is False
    assert s.enable_satellite_ml is False
```

**Step 2: Run test to verify it fails**

Run: `cd backend && pytest tests/test_stage2_config.py -v`  
Expected: FAIL because new Stage 2 settings are missing.

**Step 3: Write minimal implementation**

Add to `Settings`:
- `enable_openclaw: bool = False`
- `enable_flock: bool = False`
- `enable_satellite_ml: bool = False`
- `flock_api_base_url: str = "https://api.flock.io/v1"`
- `flock_api_key: str = Field(default="", repr=False)`
- `flock_model: str = "meta-llama/Llama-3.3-70B-Instruct"`
- `satellite_stac_url: str = "https://planetarycomputer.microsoft.com/api/stac/v1"`
- `satellite_cloud_cover_threshold: float = 40.0`
- `satellite_min_scl_clear_pct: float = 60.0`
- `satellite_change_window_days: int = 14`
- `satellite_ml_provider_url: str = ""`
- `satellite_ml_api_key: str = Field(default="", repr=False)`
- `zai_base_url: str = "https://api.z.ai/v1"`

**Step 4: Run test to verify it passes**

Run: `cd backend && pytest tests/test_stage2_config.py -v`

**Step 5: Commit**

`feat: add stage2 feature flags and config surface`

---

### Task 2: OpenClaw Assistant Response Contracts

**Files:**
- Create: `backend/src/tribble/models/assistant.py`
- Create: `backend/tests/test_assistant_models.py`

**Step 1: Write the failing test**

```python
import pytest
from tribble.models.assistant import AssistantBlock, AssistantResponse


def test_citation_block_requires_report_id():
    with pytest.raises(Exception):
        AssistantBlock(type="citation", text="source only")


def test_response_accepts_text_and_citation_blocks():
    r = AssistantResponse(
        conversation_id="c1",
        blocks=[
            AssistantBlock(type="text", text="summary"),
            AssistantBlock(type="citation", text="report", report_id="r1"),
        ],
    )
    assert len(r.blocks) == 2
```

**Step 2: Run test to verify it fails**

Run: `cd backend && pytest tests/test_assistant_models.py -v`  
Expected: FAIL because assistant models do not exist.

**Step 3: Write minimal implementation**

Define:
- `AssistantBlockType` (`text`, `bullets`, `citation`, `warning`)
- `AssistantBlock` with validation (`citation` requires `report_id`)
- `AssistantQuery` and `AssistantResponse` Pydantic models

**Step 4: Run test to verify it passes**

Run: `cd backend && pytest tests/test_assistant_models.py -v`

**Step 5: Commit**

`feat: add openclaw assistant response contracts`

---

### Task 3: Deterministic OpenClaw Service

**Files:**
- Create: `backend/src/tribble/services/openclaw.py`
- Create: `backend/tests/test_openclaw_service.py`

**Step 1: Write the failing test**

```python
from tribble.services.openclaw import build_cluster_answer


def test_build_cluster_answer_returns_citations():
    cluster = {
        "country": "Sudan",
        "admin1": "Khartoum",
        "report_count": 3,
        "top_need_categories": ["medical_need"],
        "evidence": [{"report_id": "r1", "excerpt": "Hospital damaged"}],
    }
    blocks = build_cluster_answer("What is happening?", cluster)
    assert any(b.type == "citation" for b in blocks)
```

**Step 2: Run test to verify it fails**

Run: `cd backend && pytest tests/test_openclaw_service.py -v`  
Expected: FAIL because service does not exist.

**Step 3: Write minimal implementation**

Implement deterministic function:
- `build_cluster_answer(prompt: str, cluster: dict) -> list[AssistantBlock]`
- template sections: situation, needs, blockers, evidence citations
- no external LLM call in this task

**Step 4: Run test to verify it passes**

Run: `cd backend && pytest tests/test_openclaw_service.py -v`

**Step 5: Commit**

`feat: add deterministic openclaw assistant service`

---

### Task 4: Assistant API Endpoint

**Files:**
- Create: `backend/src/tribble/api/assistant.py`
- Modify: `backend/src/tribble/main.py`
- Create: `backend/tests/test_api_assistant.py`

**Step 1: Write the failing test**

```python
from fastapi.testclient import TestClient
from tribble.main import app

client = TestClient(app)


def test_assistant_endpoint_validates_payload():
    r = client.post("/api/assistant/query", json={})
    assert r.status_code == 422
```

**Step 2: Run test to verify it fails**

Run: `cd backend && pytest tests/test_api_assistant.py -v`  
Expected: FAIL because endpoint/route is missing.

**Step 3: Write minimal implementation**

Add endpoint:
- `POST /api/assistant/query`
- request model: `prompt`, optional `cluster_id`
- response model: `AssistantResponse`
- when `TRIBBLE_ENABLE_OPENCLAW` is false, return `503` with clear message

Register router in `main.py`.

**Step 4: Run test to verify it passes**

Run: `cd backend && pytest tests/test_api_assistant.py -v`

**Step 5: Commit**

`feat: expose openclaw assistant api endpoint`

---

### Task 5: FLock API Provider Adapter (OpenAI-Compatible)

**Files:**
- Create: `backend/src/tribble/services/flock_provider.py`
- Create: `backend/src/tribble/services/llm_provider.py`
- Create: `backend/tests/test_flock_provider.py`
- Modify: `backend/src/tribble/config.py`

**Step 1: Write the failing test**

```python
import pytest
from tribble.services.flock_provider import FlockProvider


@pytest.mark.asyncio
async def test_returns_disabled_without_key():
    provider = FlockProvider(api_key="", base_url="https://api.flock.io/v1", model="model")
    out = await provider.generate("summarize")
    assert out.status == "disabled"


@pytest.mark.asyncio
async def test_builds_chat_completions_request_shape():
    provider = FlockProvider(api_key="k", base_url="https://api.flock.io/v1", model="model")
    req = provider._build_request("hello", stream=False)
    assert req["model"] == "model"
    assert req["messages"][0]["role"] == "user"
```

**Step 2: Run test to verify it fails**

Run: `cd backend && pytest tests/test_flock_provider.py -v`  
Expected: FAIL because provider adapter and protocol do not exist.

**Step 3: Write minimal implementation**

Implement:
- `LLMProvider` protocol and `LLMResult` contract.
- `FlockProvider` with:
  - base URL `https://api.flock.io/v1`
  - `x-litellm-api-key` auth header
  - `POST /chat/completions` request format
  - optional stream flag
  - timeout and deterministic error mapping (`disabled`, `unavailable`, `ok`)
- optional `list_models()` (`GET /models`) utility for startup diagnostics.

**Step 4: Run test to verify it passes**

Run: `cd backend && pytest tests/test_flock_provider.py -v`

**Step 5: Commit**

`feat: add flock openai-compatible provider adapter`

---

### Task 6: Wire FLock as Optional Assistant Enhancer (Non-Blocking)

**Files:**
- Modify: `backend/src/tribble/services/openclaw.py`
- Modify: `backend/src/tribble/api/assistant.py`
- Create: `backend/tests/test_assistant_flock_integration.py`
- Modify: `backend/src/tribble/config.py`

**Step 1: Write the failing test**

```python
import pytest
from tribble.services.openclaw import maybe_enhance_with_provider


@pytest.mark.asyncio
async def test_provider_failure_keeps_deterministic_response():
    class FailingProvider:
        async def generate(self, prompt: str):
            raise RuntimeError("network")
    blocks = await maybe_enhance_with_provider("hello", [], FailingProvider())
    assert blocks == []
```

**Step 2: Run test to verify it fails**

Run: `cd backend && pytest tests/test_assistant_flock_integration.py -v`  
Expected: FAIL because optional provider enhancement path is missing.

**Step 3: Write minimal implementation**

Implement:
- `enable_flock` + `flock_api_key` + `flock_model` config fields.
- assistant flow:
  - always generate deterministic base response first
  - optionally append provider refinement if FLock is enabled and healthy
  - on provider failure, log and return deterministic-only response
- API response metadata indicates whether FLock enhancement was applied.

**Step 4: Run test to verify it passes**

Run: `cd backend && pytest tests/test_assistant_flock_integration.py tests/test_api_assistant.py -v`

**Step 5: Commit**

`feat: wire optional flock enhancement into assistant path`

---

### Task 7: Satellite EO Schema + Contracts (Sentinel-2, Quality, Flood/Change)

**Files:**
- Create: `supabase/migrations/011_satellite_eo.sql`
- Create: `backend/src/tribble/models/satellite_ml.py`
- Create: `backend/tests/test_satellite_ml_models.py`
- Create: `backend/tests/test_satellite_eo_contracts.py`

**Step 1: Write the failing test**

```python
import pytest
from tribble.models.satellite_ml import SatelliteEOFeatures, SceneQuality


def test_scene_quality_bounds():
    with pytest.raises(Exception):
        SceneQuality(cloud_cover_pct=105.0, scl_clear_pct=80.0, quality_score=0.8)


def test_eo_features_require_indices_and_scores():
    f = SatelliteEOFeatures(
        scene_id_before="S2_before",
        scene_id_after="S2_after",
        ndvi_before=0.41,
        ndvi_after=0.33,
        ndwi_before=0.10,
        ndwi_after=0.44,
        mndwi_before=0.02,
        mndwi_after=0.31,
        flood_score=0.79,
        change_score=0.66,
        quality_score=0.84,
    )
    assert f.flood_score > 0.7
```

**Step 2: Run test to verify it fails**

Run: `cd backend && pytest tests/test_satellite_ml_models.py tests/test_satellite_eo_contracts.py -v`  
Expected: FAIL because EO feature/quality contracts do not exist.

**Step 3: Write minimal implementation**

Create SQL tables:
- `satellite_scene_cache` (provider, scene_id, datetime, cloud_cover_pct, scl_clear_pct, assets)
- `satellite_analytics` (before/after scene refs, NDVI/NDWI/MNDWI values, flood/change/quality scores, method_version)
- `satellite_ml_jobs` / `satellite_ml_results` (compression-provider job audit trail)

Create model(s):
- `SceneQuality`
- `SatelliteEOFeatures`
- `SatelliteMLJob`
- `SatelliteMLResult`

**Step 4: Run test to verify it passes**

Run: `cd backend && pytest tests/test_satellite_ml_models.py tests/test_satellite_eo_contracts.py -v`

**Step 5: Commit**

`feat: add sentinel2 eo schema and typed analytics contracts`

---

### Task 8: Planetary Computer + SCL Quality + Index/Change Adapter

**Files:**
- Modify: `backend/src/tribble/ingest/satellite.py`
- Create: `backend/src/tribble/ingest/satellite_ml.py`
- Create: `backend/src/tribble/ingest/satellite_indices.py`
- Modify: `backend/src/tribble/config.py`
- Create: `backend/tests/test_satellite_planetary_computer.py`
- Create: `backend/tests/test_satellite_indices.py`

**Step 1: Write the failing test**

```python
from tribble.ingest.satellite import build_planetary_computer_search_params
from tribble.ingest.satellite_indices import compute_indices, compute_flood_change_scores


def test_planetary_computer_params_target_sentinel2_l2a():
    p = build_planetary_computer_search_params(15.5, 32.56, "2026-03-01", "2026-03-07")
    assert p["collections"] == ["sentinel-2-l2a"]


def test_indices_and_flood_change_scores_are_computed():
    idx = compute_indices(red=0.2, green=0.3, nir=0.6, swir1=0.1)
    scores = compute_flood_change_scores(
        ndwi_before=0.08, ndwi_after=0.42, mndwi_before=0.01, mndwi_after=0.33
    )
    assert "ndvi" in idx and scores["flood_score"] > 0.5
```

**Step 2: Run test to verify it fails**

Run: `cd backend && pytest tests/test_satellite_planetary_computer.py tests/test_satellite_indices.py -v`  
Expected: FAIL because Planetary Computer helpers and index functions are missing.

**Step 3: Write minimal implementation**

Implement:
- `build_planetary_computer_search_params(...)` (Sentinel-2 L2A STAC, bbox/point, date window, cloud limit)
- index helpers: `compute_indices` for NDVI/NDWI/MNDWI
- SCL/quality helpers: quality score from cloud cover + SCL clear ratio
- `compute_flood_change_scores(...)` for before/after change and flood likelihood
- compression-provider adapter functions:
  - `build_compression_request(...)`
  - `CompressionProviderClient.submit_job(...)`
  - `parse_provider_result(...)`
- provider failure path returns structured fallback (no pipeline crash)
- explicitly no TODO-only placeholders for index/quality functions; unit tests must assert numeric outputs

**Step 4: Run test to verify it passes**

Run: `cd backend && pytest tests/test_satellite.py tests/test_satellite_planetary_computer.py tests/test_satellite_indices.py -v`

**Step 5: Commit**

`feat: add planetary computer ingestion and scl/index flood-change analytics`

---

### Task 9: Pipeline Multi-Source Fusion for Disaster Response Outputs

**Files:**
- Modify: `backend/src/tribble/pipeline/state.py`
- Modify: `backend/src/tribble/pipeline/graph.py`
- Create: `backend/src/tribble/services/satellite_fusion.py`
- Modify: `backend/src/tribble/models/confidence.py`
- Create: `backend/tests/test_pipeline_satellite_ml.py`
- Create: `backend/tests/test_satellite_fusion.py`

**Step 1: Write the failing test**

```python
from tribble.services.satellite_fusion import fuse_satellite_weather_report_signals


def test_fusion_boosts_alert_on_satellite_and_weather_agreement():
    fused = fuse_satellite_weather_report_signals(
        satellite={"flood_score": 0.82, "quality_score": 0.88},
        weather={"flood_risk": 0.76},
        reports={"cross_source_corroboration": 0.64},
    )
    assert fused["alert_score"] > 0.75
    assert fused["stage"] in {"watch", "detect", "deliver"}
```

**Step 2: Run test to verify it fails**

Run: `cd backend && pytest tests/test_satellite_fusion.py tests/test_pipeline_satellite_ml.py -v`  
Expected: FAIL because fusion service + pipeline wiring are missing.

**Step 3: Write minimal implementation**

Update:
- `PipelineState` fields:
  - `satellite_eo_features: dict | None`
  - `satellite_quality: dict | None`
  - `satellite_alert: dict | None`
- `enrich_satellite` node attaches EO features + quality + fallback reason codes
- `score` node consumes fusion output to update:
  - `confidence_breakdown["satellite_corroboration"]`
  - `confidence_scores["access_difficulty"]`
- add deterministic "watch -> detect -> deliver" stage in `satellite_alert`
- low-quality scenes degrade confidence but do not auto-reject valid reports
- fusion service must return machine-readable reason codes (for UI + audit trail)

**Step 4: Run test to verify it passes**

Run: `cd backend && pytest tests/test_pipeline.py tests/test_satellite_fusion.py tests/test_pipeline_satellite_ml.py -v`

**Step 5: Commit**

`feat: fuse satellite weather and report signals into deterministic disaster alerts`

---

### Task 10: Mapbox Foundation (Phase Next)

**Files:**
- Modify: `frontend/package.json`
- Create: `frontend/src/lib/mapbox.ts`
- Create: `frontend/src/test/mapbox-config.test.ts`
- Modify: `frontend/.env.example`

**Step 1: Write the failing test**

```ts
import { describe, it, expect } from "vitest";
import { getMapboxToken } from "@/lib/mapbox";

describe("mapbox config", () => {
  it("throws when token is missing", () => {
    expect(() => getMapboxToken("")).toThrow();
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd frontend && npm run test -- src/test/mapbox-config.test.ts`  
Expected: FAIL because module/function does not exist.

**Step 3: Write minimal implementation**

Add:
- `mapbox-gl` dependency
- `getMapboxToken(raw?: string): string` with explicit error
- feature flag parser `isMapboxEnabled()`

**Step 4: Run test to verify it passes**

Run: `cd frontend && npm run test -- src/test/mapbox-config.test.ts`

**Step 5: Commit**

`feat: add mapbox config module and dependency`

---

### Task 11: API-Backed Operational Map Component (Phase Next)

**Files:**
- Create: `frontend/src/components/map/OperationalMap.tsx`
- Modify: `frontend/src/components/layout/AppShell.tsx`
- Create: `frontend/src/lib/clusters-api.ts`
- Create: `frontend/src/test/operational-map.test.tsx`

**Step 1: Write the failing test**

```tsx
import { render, screen } from "@testing-library/react";
import { OperationalMap } from "@/components/map/OperationalMap";

test("renders cluster count label", async () => {
  render(<OperationalMap />);
  expect(await screen.findByText(/clusters/i)).toBeInTheDocument();
});
```

**Step 2: Run test to verify it fails**

Run: `cd frontend && npm run test -- src/test/operational-map.test.tsx`  
Expected: FAIL because component/api hook does not exist.

**Step 3: Write minimal implementation**

Implement:
- `clusters-api.ts` fetches `GET /api/clusters`
- `OperationalMap` renders Mapbox map and plots returned GeoJSON
- `AppShell` swaps `SimulatedMap` for `OperationalMap` when `VITE_ENABLE_MAPBOX_UI=true`

**Step 4: Run test to verify it passes**

Run: `cd frontend && npm run test -- src/test/operational-map.test.tsx`

**Step 5: Commit**

`feat: add operational mapbox component backed by cluster api`

---

### Task 12: Supabase Realtime SQL + Backend Contract (Phase Next)

**Files:**
- Create: `supabase/migrations/012_realtime_cluster_events.sql`
- Create: `backend/src/tribble/api/realtime.py`
- Modify: `backend/src/tribble/main.py`
- Create: `backend/tests/test_api_realtime.py`

**Step 1: Write the failing test**

```python
from fastapi.testclient import TestClient
from tribble.main import app

client = TestClient(app)


def test_realtime_health_endpoint_exists():
    r = client.get("/api/realtime/health")
    assert r.status_code in (200, 503)
```

**Step 2: Run test to verify it fails**

Run: `cd backend && pytest tests/test_api_realtime.py -v`  
Expected: FAIL because realtime router does not exist.

**Step 3: Write minimal implementation**

Add:
- SQL trigger/function to emit cluster/report changes to `realtime_cluster_events`
- `/api/realtime/health` endpoint to expose backend readiness
- router registration in `main.py`

**Step 4: Run test to verify it passes**

Run: `cd backend && pytest tests/test_api_realtime.py -v`

**Step 5: Commit**

`feat: add realtime sql contract and backend readiness endpoint`

---

### Task 13: Frontend Realtime Subscription Wiring (Phase Next)

**Files:**
- Modify: `frontend/src/store/realtimeSlice.ts`
- Create: `frontend/src/lib/realtime.ts`
- Modify: `frontend/src/components/layout/TopBar.tsx`
- Create: `frontend/src/test/realtime-subscription.test.ts`

**Step 1: Write the failing test**

```ts
import { describe, it, expect } from "vitest";
import { applyRealtimeEvent } from "@/lib/realtime";

describe("realtime event handling", () => {
  it("updates recent ids with newest first", () => {
    const next = applyRealtimeEvent({ recentEventIds: ["a"] }, { id: "b" });
    expect(next.recentEventIds[0]).toBe("b");
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd frontend && npm run test -- src/test/realtime-subscription.test.ts`  
Expected: FAIL because helper is missing.

**Step 3: Write minimal implementation**

Implement:
- pure helper `applyRealtimeEvent`
- Supabase channel subscribe wrapper in `lib/realtime.ts`
- connect/reconnect indicators in `realtimeSlice`

**Step 4: Run test to verify it passes**

Run: `cd frontend && npm run test -- src/test/realtime-subscription.test.ts`

**Step 5: Commit**

`feat: wire supabase realtime subscription path in frontend`

---

### Task 14: Z.ai/GLM Research + Provider Abstraction (Phase Next, Medium Priority)

**Files:**
- Create: `docs/research/2026-03-07-zai-glm-integration-notes.md`
- Modify: `backend/src/tribble/services/llm_provider.py`
- Create: `backend/src/tribble/services/zai_provider.py`
- Create: `backend/tests/test_zai_provider.py`

**Step 1: Write the failing test**

```python
import pytest
from tribble.services.zai_provider import ZAIProvider


@pytest.mark.asyncio
async def test_provider_returns_disabled_when_no_key():
    p = ZAIProvider(api_key="", model="glm-4", base_url="https://api.z.ai/v1")
    out = await p.generate("hello")
    assert out.status == "disabled"
```

**Step 2: Run test to verify it fails**

Run: `cd backend && pytest tests/test_zai_provider.py -v`  
Expected: FAIL because provider abstraction is missing.

**Step 3: Write minimal implementation**

Implement:
- provider implementation matching protocol: `generate(prompt) -> LLMResult`
- `ZAIProvider` with disabled fallback when missing key
- research note with:
  - auth approach
  - endpoint assumptions
  - timeout/retry policy
  - unresolved questions to verify once keys are available

**Step 4: Run test to verify it passes**

Run: `cd backend && pytest tests/test_zai_provider.py -v`

**Step 5: Commit**

`feat: add z.ai provider abstraction and integration research notes`

---

### Task 15: Continuous Fake-Data Stream Ingestion Service (Production Path)

**Files:**
- Create: `backend/src/tribble/services/stream_simulator.py`
- Create: `backend/src/tribble/api/simulation.py`
- Modify: `backend/src/tribble/main.py`
- Create: `backend/tests/test_stream_simulator.py`
- Create: `backend/tests/test_api_simulation.py`

**Step 1: Write the failing test**

```python
from tribble.services.stream_simulator import make_synthetic_submission


def test_synthetic_submission_is_valid_report_payload():
    payload = make_synthetic_submission(seed=1, source_profile="mixed")
    assert "latitude" in payload and "longitude" in payload
    assert len(payload["narrative"]) >= 10
```

**Step 2: Run test to verify it fails**

Run: `cd backend && pytest tests/test_stream_simulator.py tests/test_api_simulation.py -v`  
Expected: FAIL because simulator service and simulation API are missing.

**Step 3: Write minimal implementation**

Implement:
- simulator that emits configurable fake submissions (`events_per_minute`, source mix, noise ratio)
- simulator posts to `POST /api/reports` using HTTP client (same ingestion path as real traffic)
- adapter registry (`source_name -> payload mapper`) so new synthetic source types can be added without pipeline changes
- endpoints:
  - `POST /api/simulation/start`
  - `POST /api/simulation/stop`
  - `GET /api/simulation/status`

**Step 4: Run test to verify it passes**

Run: `cd backend && pytest tests/test_stream_simulator.py tests/test_api_simulation.py -v`

**Step 5: Commit**

`feat: add continuous fake-data simulator using production ingest api`

---

### Task 16: Continuous Queue Worker for Pipeline Processing

**Files:**
- Create: `backend/src/tribble/services/worker.py`
- Create: `backend/src/tribble/services/persistence.py`
- Create: `backend/src/tribble/api/worker.py`
- Modify: `backend/src/tribble/main.py`
- Create: `backend/tests/test_worker.py`
- Create: `backend/tests/test_api_worker.py`

**Step 1: Write the failing test**

```python
import pytest
from tribble.services.worker import process_one_job


@pytest.mark.asyncio
async def test_process_one_job_moves_status_to_completed():
    result = await process_one_job(worker_id="w1")
    assert result.status in {"completed", "skipped", "failed"}
```

**Step 2: Run test to verify it fails**

Run: `cd backend && pytest tests/test_worker.py tests/test_api_worker.py -v`  
Expected: FAIL because worker service and control API are missing.

**Step 3: Write minimal implementation**

Implement worker loop:
- claim job via `claim_next_job(worker_id)`
- load report data
- invoke `build_pipeline()`
- persist node trace/confidence outputs
- update job status (`completed`/`failed`) with error text
- endpoints:
  - `POST /api/worker/start`
  - `POST /api/worker/stop`
  - `GET /api/worker/status`

**Step 4: Run test to verify it passes**

Run: `cd backend && pytest tests/test_worker.py tests/test_api_worker.py -v`

**Step 5: Commit**

`feat: add continuous pipeline worker with queue claim and persistence`

---

### Task 17: Streaming Observability + Realtime Pipeline Stats

**Files:**
- Create: `backend/src/tribble/services/stream_metrics.py`
- Create: `backend/src/tribble/api/streaming.py`
- Modify: `backend/src/tribble/main.py`
- Create: `backend/tests/test_stream_metrics.py`
- Create: `backend/tests/test_api_streaming.py`

**Step 1: Write the failing test**

```python
from tribble.services.stream_metrics import compute_stream_health


def test_stream_health_reports_queue_depth_and_lag():
    h = compute_stream_health(
        queue_depth=25, ingress_per_min=60.0, processed_per_min=55.0, oldest_pending_age_s=42
    )
    assert h["queue_depth"] == 25
    assert "backpressure" in h
```

**Step 2: Run test to verify it fails**

Run: `cd backend && pytest tests/test_stream_metrics.py tests/test_api_streaming.py -v`  
Expected: FAIL because stream metrics service and API are missing.

**Step 3: Write minimal implementation**

Implement:
- metrics aggregation (queue depth, ingress rate, processing rate, reject rate, lag)
- `GET /api/streaming/stats` (poll-friendly)
- `GET /api/streaming/health` (`ok`, `degraded`, `backpressured`)
- optional replay endpoint for demo reset:
  - `POST /api/streaming/reseed`
- include status histogram by pipeline outcome (`published`, `rejected`, `error`) for live demo credibility

**Step 4: Run test to verify it passes**

Run: `cd backend && pytest tests/test_stream_metrics.py tests/test_api_streaming.py -v`

**Step 5: Commit**

`feat: add continuous streaming metrics and health endpoints`

---

### Task 18: Stage 2 Final Verification Gate

**Files:**
- Modify: `backend/tests/test_pipeline/test_integration.py`
- Modify: `frontend/src/test/example.test.ts` (replace placeholder with Stage 2 smoke)

**Step 1: Write failing end-to-end smoke tests**

Add:
- backend: assistant + FLock fallback + satellite fusion + simulation + worker + streaming metrics smoke
- frontend: map config + realtime helper smoke

**Step 2: Run tests to verify failures**

Run:
- `cd backend && pytest tests/test_pipeline/test_integration.py -v`
- `cd frontend && npm run test`

Expected: FAIL on new smoke assertions.

**Step 3: Implement minimal fixes**

Align Stage 2 code paths until smoke tests pass without relaxing assertions.

**Step 4: Run full verification**

Run:
- `cd backend && pytest -v`
- `cd frontend && npm run test`
- `cd frontend && npm run build`

**Step 5: Commit**

`chore: stage2 final verification gate green`

---

## Execution Checkpoints (Required)

| Checkpoint | Tasks |
|---|---|
| Checkpoint A | 1-3 |
| Checkpoint B | 4-6 |
| Checkpoint C | 7-9 |
| Checkpoint D | 10-12 |
| Checkpoint E | 13-15 |
| Checkpoint F | 16-18 |

Stop after each checkpoint, report outcomes, and wait for feedback.
