from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from tribble.api.reports import router as reports_router
from tribble.config import get_settings

app = FastAPI(title="Tribble", version="0.1.0")
app.include_router(reports_router)

_settings = get_settings()
app.add_middleware(
    CORSMiddleware,
    allow_origins=_settings.cors_origins,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE"],
    allow_headers=["Authorization", "Content-Type"],
)


@app.get("/health")
async def health():
    return {"status": "ok"}
