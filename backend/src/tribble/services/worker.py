import asyncio
from dataclasses import dataclass
from datetime import datetime, timezone

from tribble.pipeline.graph import build_pipeline
from tribble.pipeline.state import PipelineStatus
from tribble.services.persistence import (
    claim_next_job,
    load_report_data,
    persist_pipeline_outputs,
    update_job_status,
)


@dataclass
class ProcessJobResult:
    worker_id: str
    status: str
    job_id: str | None = None
    report_id: str | None = None
    error: str | None = None
    node_trace: list[str] | None = None


def _coerce_timestamp(raw: object) -> str:
    if isinstance(raw, str) and raw:
        return raw
    if isinstance(raw, datetime):
        return raw.isoformat()
    return datetime.now(timezone.utc).isoformat()


def _build_pipeline_state(report: dict) -> dict:
    return {
        "report_id": str(report.get("id") or "unknown-report"),
        "raw_narrative": str(report.get("narrative") or ""),
        "source_type": str(report.get("source_type") or "web_anonymous"),
        "latitude": float(report.get("latitude", 0.0)),
        "longitude": float(report.get("longitude", 0.0)),
        "language": str(report.get("language") or "en"),
        "timestamp": _coerce_timestamp(report.get("event_timestamp")),
        "status": PipelineStatus.INGESTED,
        "node_trace": [],
        "error": None,
        "normalized": None,
        "translation": None,
        "classification": None,
        "geocoded_location": None,
        "duplicates_found": [],
        "corroboration_hits": [],
        "weather_data": None,
        "satellite_data": None,
        "satellite_eo_features": None,
        "satellite_quality": None,
        "satellite_alert": None,
        "confidence_breakdown": None,
        "confidence_scores": None,
        "cluster_id": None,
        "report_type": None,
        "validation_context": None,
        "corroboration_score": None,
        "corroboration_acled_classes": None,
    }


def _is_successful_pipeline_status(status: object) -> bool:
    return status in (PipelineStatus.PUBLISHED, PipelineStatus.REJECTED)


async def process_one_job(worker_id: str) -> ProcessJobResult:
    try:
        claimed_job = await claim_next_job(worker_id)
    except Exception as exc:
        return ProcessJobResult(
            worker_id=worker_id,
            status="failed",
            error=str(exc),
        )

    if not claimed_job:
        return ProcessJobResult(worker_id=worker_id, status="skipped")

    job_id = str(claimed_job.get("id") or "")
    report_id = str(claimed_job.get("report_id") or "")
    if not job_id or not report_id:
        return ProcessJobResult(
            worker_id=worker_id,
            status="failed",
            job_id=job_id or None,
            report_id=report_id or None,
            error="missing_job_or_report_id",
        )

    try:
        report = await load_report_data(report_id)
        if report is None:
            await update_job_status(job_id, "failed", [], "report_not_found")
            return ProcessJobResult(
                worker_id=worker_id,
                status="failed",
                job_id=job_id,
                report_id=report_id,
                error="report_not_found",
            )

        pipeline = build_pipeline()
        pipeline_result = pipeline.invoke(_build_pipeline_state(report))
        await persist_pipeline_outputs(report_id, pipeline_result)

        node_trace = list(pipeline_result.get("node_trace") or [])
        error = pipeline_result.get("error")
        if _is_successful_pipeline_status(pipeline_result.get("status")):
            await update_job_status(job_id, "completed", node_trace, None)
            return ProcessJobResult(
                worker_id=worker_id,
                status="completed",
                job_id=job_id,
                report_id=report_id,
                node_trace=node_trace,
            )

        await update_job_status(job_id, "failed", node_trace, str(error or "pipeline_failed"))
        return ProcessJobResult(
            worker_id=worker_id,
            status="failed",
            job_id=job_id,
            report_id=report_id,
            error=str(error or "pipeline_failed"),
            node_trace=node_trace,
        )
    except Exception as exc:
        await update_job_status(job_id, "failed", [], str(exc))
        return ProcessJobResult(
            worker_id=worker_id,
            status="failed",
            job_id=job_id,
            report_id=report_id,
            error=str(exc),
            node_trace=[],
        )


@dataclass
class WorkerState:
    running: bool = False
    worker_id: str = "worker-1"
    poll_interval_s: float = 0.5
    jobs_completed: int = 0
    jobs_failed: int = 0
    jobs_skipped: int = 0
    last_result: str | None = None
    last_error: str | None = None
    started_at: str | None = None


class PipelineWorker:
    def __init__(self):
        self._state = WorkerState()
        self._task: asyncio.Task | None = None
        self._lock = asyncio.Lock()

    def status(self) -> dict:
        return {
            "running": self._state.running,
            "worker_id": self._state.worker_id,
            "poll_interval_s": self._state.poll_interval_s,
            "jobs_completed": self._state.jobs_completed,
            "jobs_failed": self._state.jobs_failed,
            "jobs_skipped": self._state.jobs_skipped,
            "last_result": self._state.last_result,
            "last_error": self._state.last_error,
            "started_at": self._state.started_at,
        }

    async def start(self, worker_id: str = "worker-1", poll_interval_s: float = 0.5) -> dict:
        async with self._lock:
            if self._state.running:
                return self.status()
            self._state.running = True
            self._state.worker_id = worker_id
            self._state.poll_interval_s = poll_interval_s
            self._state.jobs_completed = 0
            self._state.jobs_failed = 0
            self._state.jobs_skipped = 0
            self._state.last_result = None
            self._state.last_error = None
            self._state.started_at = datetime.now(timezone.utc).isoformat()
            self._task = asyncio.create_task(self._run_loop())
        return self.status()

    async def stop(self) -> dict:
        async with self._lock:
            self._state.running = False
            task = self._task
            self._task = None
        if task:
            task.cancel()
            try:
                await task
            except asyncio.CancelledError:
                pass
        return self.status()

    async def _run_loop(self) -> None:
        while self._state.running:
            try:
                result = await process_one_job(self._state.worker_id)
            except Exception as exc:
                result = ProcessJobResult(
                    worker_id=self._state.worker_id,
                    status="failed",
                    error=str(exc),
                )
            self._state.last_result = result.status
            if result.status == "completed":
                self._state.jobs_completed += 1
            elif result.status == "failed":
                self._state.jobs_failed += 1
                self._state.last_error = result.error
            else:
                self._state.jobs_skipped += 1
            await asyncio.sleep(self._state.poll_interval_s)


_worker = PipelineWorker()


def get_pipeline_worker() -> PipelineWorker:
    return _worker
