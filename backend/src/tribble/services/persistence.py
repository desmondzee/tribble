from datetime import datetime, timezone

from tribble.db import get_supabase
from tribble.pipeline.state import PipelineStatus


async def claim_next_job(worker_id: str) -> dict | None:
    db = get_supabase()
    rows = db.rpc("claim_next_job", {"worker_id": worker_id}).execute().data or []
    if not rows:
        return None
    return rows[0]


async def load_report_data(report_id: str) -> dict | None:
    db = get_supabase()
    rows = (
        db.table("reports")
        .select("id,source_type,narrative,language,event_timestamp,created_at,processing_metadata")
        .eq("id", report_id)
        .limit(1)
        .execute()
        .data
        or []
    )
    if not rows:
        return None

    report = rows[0]
    metadata = report.get("processing_metadata") or {}
    if not isinstance(metadata, dict):
        metadata = {}

    return {
        "id": str(report["id"]),
        "source_type": report.get("source_type", "web_anonymous"),
        "narrative": report.get("narrative") or "",
        "language": report.get("language") or "en",
        "event_timestamp": report.get("event_timestamp") or report.get("created_at"),
        "latitude": float(metadata.get("latitude", 0.0)),
        "longitude": float(metadata.get("longitude", 0.0)),
    }


def _to_verification_status(pipeline_status: PipelineStatus | str | None) -> str:
    if pipeline_status == PipelineStatus.PUBLISHED:
        return "completed"
    if pipeline_status == PipelineStatus.REJECTED:
        return "rejected"
    return "failed"


async def persist_pipeline_outputs(report_id: str, pipeline_result: dict) -> None:
    db = get_supabase()

    started_at = datetime.now(timezone.utc)
    completed_at = datetime.now(timezone.utc)
    verification_payload = {
        "report_id": report_id,
        "pipeline_version": "0.2.0",
        "node_trace": pipeline_result.get("node_trace") or [],
        "started_at": started_at.isoformat(),
        "completed_at": completed_at.isoformat(),
        "status": _to_verification_status(pipeline_result.get("status")),
        "error": pipeline_result.get("error"),
        "duration_ms": max(int((completed_at - started_at).total_seconds() * 1000), 0),
    }

    inserted = db.table("verification_runs").insert(verification_payload).execute().data or []
    if not inserted:
        return

    verification_run_id = inserted[0].get("id")
    confidence_scores = pipeline_result.get("confidence_scores")
    confidence_breakdown = pipeline_result.get("confidence_breakdown")
    validation_context = pipeline_result.get("validation_context")
    if not verification_run_id or not confidence_scores or not confidence_breakdown:
        return

    breakdown_with_validation = {**confidence_breakdown}
    if validation_context:
        breakdown_with_validation["validation_context"] = validation_context

    db.table("confidence_scores").insert(
        {
            "report_id": report_id,
            "verification_run_id": verification_run_id,
            "publishability": float(confidence_scores.get("publishability", 0.0)),
            "urgency": float(confidence_scores.get("urgency", 0.0)),
            "access_difficulty": float(confidence_scores.get("access_difficulty", 0.0)),
            "breakdown": breakdown_with_validation,
        }
    ).execute()


async def update_job_status(
    job_id: str,
    status: str,
    node_trace: list[str],
    error: str | None = None,
) -> None:
    db = get_supabase()
    payload: dict[str, object] = {
        "status": status,
        "node_trace": node_trace,
        "last_error": error,
    }
    if status in {"completed", "failed"}:
        payload["completed_at"] = datetime.now(timezone.utc).isoformat()
    db.table("pipeline_jobs").update(payload).eq("id", job_id).execute()


async def get_queue_snapshot(limit: int = 200) -> list[dict]:
    db = get_supabase()
    return (
        db.table("pipeline_jobs")
        .select("id,status,created_at,started_at,completed_at,last_error")
        .order("created_at", desc=True)
        .limit(limit)
        .execute()
        .data
        or []
    )
