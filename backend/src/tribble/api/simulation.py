from fastapi import APIRouter
from pydantic import BaseModel, Field

from tribble.services.stream_simulator import get_stream_simulator

router = APIRouter(prefix="/api/simulation", tags=["simulation"])


class SimulationStartRequest(BaseModel):
    events_per_minute: int = Field(ge=1, le=600)
    source_profile: str = "mixed"
    noise_ratio: float = Field(default=0.0, ge=0.0, le=1.0)
    api_base_url: str = "http://localhost:8000"


@router.post("/start")
async def start_simulation(payload: SimulationStartRequest):
    simulator = get_stream_simulator()
    return await simulator.start(
        events_per_minute=payload.events_per_minute,
        source_profile=payload.source_profile,
        noise_ratio=payload.noise_ratio,
        api_base_url=payload.api_base_url,
    )


@router.post("/stop")
async def stop_simulation():
    simulator = get_stream_simulator()
    return await simulator.stop()


@router.get("/status")
async def simulation_status():
    simulator = get_stream_simulator()
    return simulator.status()
