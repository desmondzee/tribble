from datetime import datetime, timezone

from tribble.services.persistence import get_queue_snapshot


def _parse_ts(raw: str | None) -> datetime | None:
    if not raw:
        return None
    try:
        return datetime.fromisoformat(raw.replace("Z", "+00:00"))
    except ValueError:
        return None


def compute_stream_health(
    queue_depth: int,
    ingress_per_min: float,
    processed_per_min: float,
    oldest_pending_age_s: int,
) -> dict:
    backlog_delta_per_min = round(ingress_per_min - processed_per_min, 2)
    backpressure = (
        queue_depth >= 20
        or oldest_pending_age_s >= 30
        or backlog_delta_per_min > 5.0
    )
    if backpressure:
        status = "backpressured"
    elif queue_depth > 0 or oldest_pending_age_s > 0 or backlog_delta_per_min > 0:
        status = "degraded"
    else:
        status = "ok"
    return {
        "status": status,
        "queue_depth": int(queue_depth),
        "ingress_per_min": round(float(ingress_per_min), 2),
        "processed_per_min": round(float(processed_per_min), 2),
        "oldest_pending_age_s": int(oldest_pending_age_s),
        "backpressure": backpressure,
        "backlog_delta_per_min": backlog_delta_per_min,
    }


def _build_outcome_histogram(jobs: list[dict]) -> dict[str, int]:
    histogram = {"published": 0, "rejected": 0, "error": 0}
    for job in jobs:
        status = str(job.get("status") or "")
        marker = str(job.get("last_error") or "").lower()
        if status == "failed":
            histogram["error"] += 1
        elif status == "completed" and marker == "rejected":
            histogram["rejected"] += 1
        elif status == "completed":
            histogram["published"] += 1
    return histogram


def compute_stream_stats(jobs: list[dict], window_minutes: int = 10) -> dict:
    now = datetime.now(timezone.utc)
    window_s = max(int(window_minutes), 1) * 60

    pending_or_processing = [j for j in jobs if str(j.get("status")) in {"pending", "processing"}]
    queue_depth = len(pending_or_processing)

    ingress_events = 0
    processed_events = 0
    oldest_pending_age_s = 0

    for job in jobs:
        created_at = _parse_ts(job.get("created_at"))
        completed_at = _parse_ts(job.get("completed_at"))
        if created_at and (now - created_at).total_seconds() <= window_s:
            ingress_events += 1
        if completed_at and (now - completed_at).total_seconds() <= window_s:
            processed_events += 1

    for job in pending_or_processing:
        created_at = _parse_ts(job.get("created_at"))
        if not created_at:
            continue
        age_s = int((now - created_at).total_seconds())
        oldest_pending_age_s = max(oldest_pending_age_s, max(age_s, 0))

    outcome_histogram = _build_outcome_histogram(jobs)
    processed_total = sum(outcome_histogram.values())
    reject_rate = (
        round(outcome_histogram["rejected"] / processed_total, 4)
        if processed_total > 0
        else 0.0
    )

    ingress_per_min = ingress_events / max(window_minutes, 1)
    processed_per_min = processed_events / max(window_minutes, 1)
    health = compute_stream_health(
        queue_depth=queue_depth,
        ingress_per_min=ingress_per_min,
        processed_per_min=processed_per_min,
        oldest_pending_age_s=oldest_pending_age_s,
    )
    return {
        **health,
        "window_minutes": window_minutes,
        "reject_rate": reject_rate,
        "outcome_histogram": outcome_histogram,
    }


async def collect_stream_stats(window_minutes: int = 10) -> dict:
    data_source = "live_queue"
    try:
        jobs = await get_queue_snapshot(limit=500)
    except Exception:
        jobs = []
        data_source = "fallback_empty_queue"

    stats = compute_stream_stats(jobs=jobs, window_minutes=window_minutes)
    stats["data_source"] = data_source
    return stats
