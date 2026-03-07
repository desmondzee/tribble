from fastapi import APIRouter
from pydantic import BaseModel, Field

from tribble.services.worker import get_pipeline_worker

router = APIRouter(prefix="/api/worker", tags=["worker"])


class WorkerStartRequest(BaseModel):
    worker_id: str = "worker-1"
    poll_interval_s: float = Field(default=0.5, gt=0.0, le=30.0)


@router.post("/start")
async def start_worker(payload: WorkerStartRequest | None = None):
    cfg = payload or WorkerStartRequest()
    worker = get_pipeline_worker()
    return await worker.start(
        worker_id=cfg.worker_id,
        poll_interval_s=cfg.poll_interval_s,
    )


@router.post("/stop")
async def stop_worker():
    worker = get_pipeline_worker()
    return await worker.stop()


@router.get("/status")
async def worker_status():
    worker = get_pipeline_worker()
    return worker.status()
