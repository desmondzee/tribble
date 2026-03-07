"""Pipeline blueprint and queue visibility for planning and observability."""

from fastapi import APIRouter

from tribble.services.persistence import get_queue_snapshot

router = APIRouter(prefix="/api/pipeline", tags=["pipeline"])

# Canonical node order and edges (must match graph.py build_pipeline())
PIPELINE_NODES = [
    "prefilter",
    "normalize",
    "translate",
    "verify_extract",
    "classify",
    "geocode",
    "deduplicate",
    "corroborate",
    "fetch_weather",
    "enrich_weather",
    "fetch_satellite",
    "enrich_satellite",
    "score",
    "cluster",
]
PIPELINE_EDGES = [
    ("normalize", "translate"),
    ("translate", "verify_extract"),
    ("verify_extract", "classify"),
    ("classify", "geocode"),
    ("geocode", "deduplicate"),
    ("deduplicate", "corroborate"),
    ("corroborate", "fetch_weather"),
    ("fetch_weather", "enrich_weather"),
    ("enrich_weather", "fetch_satellite"),
    ("fetch_satellite", "enrich_satellite"),
    ("enrich_satellite", "score"),
    ("score", "cluster"),
]
PIPELINE_CONDITIONAL = {
    "from": "prefilter",
    "description": "If status == REJECTED → END, else → normalize",
}


@router.get("/blueprint")
async def pipeline_blueprint():
    """Return the pipeline graph shape: nodes (ordered), edges, and conditional edges.
    Use this to see what is planned and the execution order."""
    return {
        "nodes": PIPELINE_NODES,
        "edges": [{"from": a, "to": b} for a, b in PIPELINE_EDGES],
        "conditional_edges": [PIPELINE_CONDITIONAL],
        "entry": "prefilter",
        "exit": "cluster",
    }


@router.get("/queue")
async def pipeline_queue(limit: int = 100):
    """Return a snapshot of pipeline_jobs (pending, processing, completed).
    Pending/processing jobs are what is about to be or is currently being implemented."""
    if limit < 1:
        limit = 1
    if limit > 500:
        limit = 500
    jobs = await get_queue_snapshot(limit=limit)
    pending = [j for j in jobs if str(j.get("status")) in ("pending", "processing")]
    return {
        "total": len(jobs),
        "pending_or_processing": len(pending),
        "jobs": jobs,
    }
