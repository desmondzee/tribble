# Tribble

**Humanitarian intelligence platform.** Multi-source crisis data flows through a deterministic LangGraph pipeline, is scored across nine confidence signals, clustered spatiotemporally, and served as GeoJSON to maps and dashboards.

---

## What it does

Tribble ingests crisis-related reports from multiple sources (ACLED, news, satellite, community submissions, Discord, etc.), runs them through a fixed pipeline, and surfaces structured intelligence:

- **Unified pipeline** — One LangGraph state graph (15 nodes). LLMs handle translation, extraction, and classification; everything else is deterministic.
- **Confidence scoring** — Each report is scored on nine signals before clustering.
- **Spatiotemporal clustering** — Events are grouped by time and geography into incident clusters.
- **Map-first output** — Clusters and reports are exposed as GeoJSON and consumed by the frontend map and analysis views.

This is a **pipeline**, not an agent swarm: predictable, testable, and auditable.

---

## Architecture (high level)

```
External inputs (ACLED, weather, STAC, LLMs, Discord, …)
    → FastAPI (REST + workers)
    → LangGraph pipeline → Supabase (Postgres + PostGIS)
    → GeoJSON APIs → Next.js frontend (Mapbox/Maplibre, dashboards)
```

- **Backend:** Python 3.12+, FastAPI, LangGraph, Pydantic, Supabase client. No ORM; Pydantic models and type hints throughout.
- **Frontend:** Next.js 16, React 19, Mapbox/Maplibre, Supabase SSR, Tailwind. Lives in `tribble/`.
- **Database:** Supabase (Postgres + PostGIS + RLS). Migrations in `supabase/migrations/`.

Detailed architecture and API map: [`docs/backend-summary-and-architecture.md`](docs/backend-summary-and-architecture.md).

---

## Repository layout

| Path | Purpose |
|------|--------|
| `backend/` | FastAPI app, LangGraph pipeline, ingest, geolocation, API routes |
| `tribble/` | Next.js app (map, reports, intelligence, satellite views) |
| `supabase/` | Migrations, config |
| `docs/` | Architecture, plans, runbooks, MCP/Supabase notes |
| `.agents/skills/` | Agent skills (TDD, plans, debugging, etc.) |

---

## Prerequisites

- **Python 3.12+** (backend). Recommend [uv](https://docs.astral.sh/uv/) for installs and running.
- **Node 20+** (frontend in `tribble/`).
- **Supabase** project (Postgres + PostGIS). Use the Supabase dashboard or CLI for migrations.

---

## Getting started

### Backend

```bash
cd backend
cp .env.example .env   # then set TRIBBLE_SUPABASE_URL, TRIBBLE_SUPABASE_SERVICE_KEY, etc.
uv sync
uv run uvicorn tribble.main:app --reload --port 8000
```

- Health: [http://localhost:8000/health](http://localhost:8000/health)
- OpenAPI: [http://localhost:8000/docs](http://localhost:8000/docs)

Run from `backend/` so `tribble` resolves as the top-level package.

### Frontend

```bash
cd tribble
cp .env.local.example .env.local   # set NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY
npm install
npm run dev
```

App runs on the port Next.js reports (typically 3000).

### Database

Apply migrations with the Supabase CLI (or dashboard) against your project. Migrations are in `supabase/migrations/` (PostGIS, schema, RPCs, etc.).

---

## Testing

- **Backend:** `cd backend && uv run pytest`
- **Frontend:** from `tribble/`, use the project’s test runner (e.g. Vitest/Jest if configured).

Development workflow is TDD: write failing tests first, then implementation. See `AGENTS.md` for conventions and plan references.

---

## Documentation

| Doc | Description |
|-----|-------------|
| [AGENTS.md](AGENTS.md) | Project overview, stack, workflow, skills, coding conventions |
| [docs/backend-summary-and-architecture.md](docs/backend-summary-and-architecture.md) | System map, API layer, pipeline, Supabase |
| [docs/plans/](docs/plans/) | Implementation plans (humanitarian platform, stage 2, satellite, etc.) |
| [docs/mcp-supabase.md](docs/mcp-supabase.md) | Supabase MCP setup (when applicable) |

---

## Contributing

- **Commits:** Small, atomic, one logical change per commit.
- **Features:** Align with the implementation plans in `docs/plans/`; avoid scope creep (YAGNI).
- **Git worktrees:** Isolated feature work can use `.worktrees/`; see the using-git-worktrees skill if you use agent workflows.

---

## License

See repository license file if present.
