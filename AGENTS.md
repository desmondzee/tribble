# Tribble — Humanitarian Intelligence Platform

## Project Overview

Backend-first humanitarian intelligence system. Multi-source crisis data flows through a deterministic LangGraph pipeline, gets scored across 9 confidence signals, clusters spatiotemporally, and serves GeoJSON to a map.

## Architecture

This is a **pipeline, not an agent swarm**. LangGraph orchestrates a fixed 11-node state graph — every node is a pure function with typed I/O. LLMs handle soft problems (translation, extraction, classification). Everything else is deterministic.

## Stack

- **Frontend:** Vite + React 18 (in `frontend/`) — already built
- **Backend:** Python 3.12 + FastAPI + LangGraph (in `backend/` — to be created)
- **Database:** Supabase (Postgres + PostGIS + RLS)
- **Testing:** pytest + pytest-asyncio (backend), Vitest (frontend)
- **MCP:** Supabase MCP is configured in `.cursor/mcp.json`; see `docs/mcp-supabase.md`.

## Implementation Plan

The full implementation plan is at `docs/plans/2026-03-07-humanitarian-intelligence-platform.md`. It contains 18 sequential TDD tasks.

**Stage 2:** `docs/plans/2026-03-07-humanitarian-intelligence-platform-stage-2.md` — assistant, FLock, satellite EO/fusion, streaming, Mapbox, Realtime, Z.ai research.

**Post–Stage 2 completion:** `docs/plans/2026-03-07-post-stage2-platform-completion.md` — backbone alignment, six-layer architecture, artifact set (diagrams, service spec, schema, LangGraph, API, confidence), and phased roadmap (Z.ai in pipeline, WhatsApp intake, polish).

**To implement:** Use the `executing-plans` skill to work through the plan task-by-task.

## Development Workflow

- **TDD always** — write failing tests before implementation code
- **Batch execution** — work through 3 tasks at a time, report, wait for feedback
- **Git worktrees** — use `.worktrees/` for isolated feature work
- **Verification** — run tests before claiming anything passes

## Skills Available

All skills are in `.agents/skills/`. Key ones for this project:

| Skill | When to Use |
|-------|-------------|
| `executing-plans` | Implementing the 18-task plan |
| `test-driven-development` | Every task (plan is TDD-first) |
| `systematic-debugging` | When tests fail unexpectedly |
| `verification-before-completion` | Before claiming any task is done |
| `writing-plans` | If new implementation plans are needed |
| `brainstorming` | Before adding features not in the plan |

## Coding Conventions

- **Python:** Pydantic models (no ORM), type hints everywhere, async where IO-bound
- **Tests:** pytest fixtures for Supabase client, `pytest-asyncio` for async tests
- **Commits:** Frequent, atomic — one logical change per commit
- **YAGNI:** Don't add features not in the plan
