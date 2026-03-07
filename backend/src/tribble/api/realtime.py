from datetime import datetime, timezone

from fastapi import APIRouter, HTTPException

from tribble.db import get_supabase

router = APIRouter(prefix="/api/realtime", tags=["realtime"])


@router.get("/health")
async def realtime_health():
    try:
        client = get_supabase()
    except Exception as exc:  # pragma: no cover - defensive boundary
        raise HTTPException(503, f"Realtime unavailable: {exc}")

    return {
        "status": "ok",
        "supabase_ready": client is not None,
        "checked_at": datetime.now(timezone.utc).isoformat(),
    }
