from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from tribble.api.assistant import router as assistant_router
from tribble.api.clusters import router as clusters_router
from tribble.api.geolocation import router as geolocation_router
from tribble.api.realtime import router as realtime_router
from tribble.api.reports import router as reports_router
from tribble.api.simulation import router as simulation_router
from tribble.api.streaming import router as streaming_router
from tribble.api.worker import router as worker_router
from tribble.api.analysis import router as analysis_router
from tribble.api.pipeline import router as pipeline_router
from tribble.api.news import router as news_router
from tribble.api.helios import router as helios_router
from tribble.api.satellite import router as satellite_router
from tribble.config import get_settings
from tribble.db import get_supabase

app = FastAPI(title="Tribble", version="0.1.0")
app.include_router(reports_router)
app.include_router(clusters_router)
app.include_router(geolocation_router)
app.include_router(assistant_router)
app.include_router(realtime_router)
app.include_router(simulation_router)
app.include_router(streaming_router)
app.include_router(worker_router)
app.include_router(analysis_router)
app.include_router(pipeline_router)
app.include_router(news_router)
app.include_router(helios_router)
app.include_router(satellite_router)

_settings = get_settings()
app.add_middleware(
    CORSMiddleware,
    allow_origins=_settings.cors_origins,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE"],
    allow_headers=["Authorization", "Content-Type"],
)


def _supabase_status() -> dict:
    """Probe Supabase connectivity. Returns status dict, never raises."""
    settings = get_settings()
    if not settings.supabase_url or not settings.supabase_service_key:
        return {"db": "unconfigured", "detail": "Set TRIBBLE_SUPABASE_URL and TRIBBLE_SUPABASE_SERVICE_KEY"}
    try:
        client = get_supabase()
        r = client.table("reports").select("id").limit(1).execute()
        if r.data is not None:
            return {"db": "ok"}
        return {"db": "error", "detail": "Unexpected response from Supabase"}
    except Exception as e:
        return {"db": "error", "detail": str(e)}


@app.get("/health")
async def health():
    out = {"status": "ok", **_supabase_status()}
    return out
