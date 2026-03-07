from fastapi import APIRouter, Query

from tribble.services.stream_metrics import collect_stream_stats
from tribble.services.stream_simulator import get_stream_simulator

router = APIRouter(prefix="/api/streaming", tags=["streaming"])


@router.get("/stats")
async def streaming_stats(window_minutes: int = Query(10, ge=1, le=120)):
    return await collect_stream_stats(window_minutes=window_minutes)


@router.get("/health")
async def streaming_health(window_minutes: int = Query(10, ge=1, le=120)):
    stats = await collect_stream_stats(window_minutes=window_minutes)
    return {
        "status": stats["status"],
        "queue_depth": stats["queue_depth"],
        "backpressure": stats["backpressure"],
        "oldest_pending_age_s": stats["oldest_pending_age_s"],
    }


@router.post("/reseed")
async def streaming_reseed():
    simulator = get_stream_simulator()
    status = simulator.status()
    if status["running"]:
        await simulator.stop()
        await simulator.start(
            events_per_minute=max(int(status.get("events_per_minute") or 1), 1),
            source_profile=str(status.get("source_profile") or "mixed"),
            noise_ratio=float(status.get("noise_ratio") or 0.0),
        )
        return {"status": "ok", "mode": "reseeded", "simulation": simulator.status()}
    return {"status": "ok", "mode": "idle", "simulation": status}
