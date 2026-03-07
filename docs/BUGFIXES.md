# Security & Bug Fixes

Identified during code review of Batches 3–4 (Tasks 7–12).

## Status Legend

- [ ] Not started
- [x] Complete

---

## CRITICAL

### 1. [x] API key embedded in URL (acled.py)

**File:** `backend/src/tribble/ingest/acled.py`
**Issue:** `_build_url` concatenated the API key directly into the URL string, exposing it in logs, browser history, and proxy caches.
**Fix:** Renamed to `_build_params`, returns a `dict` passed to `httpx`'s `params` argument so credentials stay out of the URL.

### 2. [x] Silent Null Island defaults (acled.py)

**File:** `backend/src/tribble/ingest/acled.py`
**Issue:** Missing latitude/longitude silently defaulted to `(0, 0)` — a real location in the Gulf of Guinea. Reports would appear valid but point to the wrong place.
**Fix:** Now raises `ValueError` with a descriptive message identifying the event.

### 3. [x] Silent `datetime.now()` fallback (acled.py)

**File:** `backend/src/tribble/ingest/acled.py`
**Issue:** Missing or unparseable `event_date` silently fell back to `datetime.now()`, making historical events appear current.
**Fix:** Now raises `ValueError` with a descriptive message identifying the event.

### 4. [x] Broad `except Exception` swallowing errors (reports.py)

**File:** `backend/src/tribble/api/reports.py`
**Issue:** A single `except Exception` caught everything, hiding DB errors, validation failures, and connection issues behind a generic 500.
**Fix:** Granular handling — `HTTPException` re-raised, `httpx.ConnectError` → 503, remaining → 500 with `logger.exception`.

---

## HIGH

### 5. [x] httpx.AsyncClient connection leak (acled.py)

**File:** `backend/src/tribble/ingest/acled.py`
**Issue:** `ACLEDClient` created an `httpx.AsyncClient` but had no cleanup path — connections leaked on error or forgotten `aclose()`.
**Fix:** Added `__aenter__` / `__aexit__` so the client works as an async context manager.

### 6. [x] `r.json()` called outside `async with` (satellite.py)

**File:** `backend/src/tribble/ingest/satellite.py`
**Issue:** The HTTP response was parsed after the `async with httpx.AsyncClient` block exited, risking use of a closed connection's buffer.
**Fix:** Moved `r.json()` inside the `async with` block.

### 7. [ ] Pipeline nodes have no error boundaries (graph.py)

**File:** `backend/src/tribble/pipeline/graph.py`
**Issue:** If any node throws, the entire pipeline crashes with no trace of which node failed. Only `prefilter` currently has the `@_safe_node` decorator.
**Fix required:** Add `@_safe_node` decorator to all remaining 10 nodes: `normalize`, `translate`, `classify`, `geocode`, `deduplicate`, `corroborate`, `enrich_weather`, `enrich_satellite`, `score`, `cluster_node`.

### 8. [ ] `normalize` unsafe access on `raw_narrative` (graph.py)

**File:** `backend/src/tribble/pipeline/graph.py`
**Lines:** 40, 45–46
**Issue:** `state["raw_narrative"].strip()` and `.split()` will throw `AttributeError` if `raw_narrative` is `None`, or `KeyError` if missing entirely. The `@_safe_node` decorator will catch this, but it should be handled explicitly.
**Fix required:** Use `(state.get("raw_narrative") or "")` like `prefilter` already does.

### 9. [x] No input validation on language / list fields (reports.py)

**File:** `backend/src/tribble/api/reports.py`
**Issue:** `language` accepted any length string; `crisis_categories` and `help_categories` had no upper bound on list size — allows payload stuffing.
**Fix:** Added `min_length=2, max_length=35` on language; `max_length=20` on both category lists.

### 10. [x] Mutable global singleton for DB client (db.py)

**File:** `backend/src/tribble/db.py`
**Issue:** Used a mutable module-level `_client` variable — not thread-safe, hard to test.
**Fix:** Replaced with `@lru_cache(maxsize=1)` pattern, consistent with `config.py`.

### 11. [x] Supabase insert responses not validated (reports.py)

**File:** `backend/src/tribble/api/reports.py`
**Issue:** After `db.table(...).insert(...).execute()`, the code assumed `.data` existed and had entries. A failed insert could return empty data, leading to `IndexError`.
**Fix:** Added explicit `if not loc.data` / `if not rpt.data` checks raising `HTTPException(500)`.

### 12. [x] ACLED client input validation (acled.py)

**File:** `backend/src/tribble/ingest/acled.py`
**Issue:** `_build_url` accepted any string for `country` and any int for `year`/`limit` with no bounds checking.
**Fix:** `_build_params` now validates: country non-empty and ≤100 chars, year 1990–2100, limit 1–5000.

---

## MEDIUM

### 13. [ ] Missing `ON DELETE CASCADE` on pipeline_jobs FK (007_job_queue.sql)

**File:** `supabase/migrations/007_job_queue.sql`
**Issue:** `report_id` references `reports(id)` without `ON DELETE CASCADE`. Deleting a report leaves orphaned jobs that can never be claimed or cleaned up.
**Fix required:** Add `ON DELETE CASCADE` to the foreign key constraint.

---

## TEST FIXES

### 14. [ ] `test_url_construction` references renamed method (test_acled.py)

**File:** `backend/tests/test_acled.py`
**Issue:** Test calls `_build_url()` which was renamed to `_build_params()`. The assertion also checks for a URL string, but the method now returns a `dict`.
**Fix required:** Update test to call `_build_params()` and assert against the expected dict structure.
