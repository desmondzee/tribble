import asyncio
import random
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Callable

import httpx


@dataclass
class SimulationState:
    running: bool = False
    events_emitted: int = 0
    events_failed: int = 0
    events_per_minute: int = 0
    source_profile: str = "mixed"
    noise_ratio: float = 0.0
    last_error: str | None = None
    started_at: str | None = None


def _mixed_payload(rng: random.Random) -> dict:
    scenarios = [
        ("Road flooded near district market after storms", ["water_access", "route_blockage"]),
        ("Bridge damaged and access disrupted for aid trucks", ["infrastructure_damage", "route_blockage"]),
        ("Hospital overwhelmed after clashes in downtown area", ["medical_need", "violence_active_threat"]),
        ("Displaced families requesting shelter and clean water", ["displacement", "shelter_need"]),
    ]
    narrative, crisis_categories = rng.choice(scenarios)
    lat = rng.uniform(15.45, 15.62)
    lon = rng.uniform(32.48, 32.64)
    return {
        "latitude": round(lat, 6),
        "longitude": round(lon, 6),
        "narrative": narrative,
        "language": "en",
        "crisis_categories": crisis_categories,
        "help_categories": [],
        "anonymous": bool(rng.randint(0, 1)),
    }


def _satellite_heavy_payload(rng: random.Random) -> dict:
    payload = _mixed_payload(rng)
    payload["narrative"] = "Satellite indicates standing water growth near transport corridor"
    payload["crisis_categories"] = ["water_access", "route_blockage"]
    return payload


def _weather_heavy_payload(rng: random.Random) -> dict:
    payload = _mixed_payload(rng)
    payload["narrative"] = "Severe weather surge causing route disruption and localized flooding"
    payload["crisis_categories"] = ["weather_hazard", "route_blockage"]
    return payload


SOURCE_MAPPERS: dict[str, Callable[[random.Random], dict]] = {
    "mixed": _mixed_payload,
    "satellite_heavy": _satellite_heavy_payload,
    "weather_heavy": _weather_heavy_payload,
}


def make_synthetic_submission(seed: int | None = None, source_profile: str = "mixed") -> dict:
    rng = random.Random(seed)
    mapper = SOURCE_MAPPERS.get(source_profile, _mixed_payload)
    payload = mapper(rng)
    if len(payload["narrative"]) < 10:
        payload["narrative"] = f"{payload['narrative']} situation update"
    return payload


class StreamSimulator:
    def __init__(self):
        self._state = SimulationState()
        self._task: asyncio.Task | None = None
        self._lock = asyncio.Lock()

    def status(self) -> dict:
        return {
            "running": self._state.running,
            "events_emitted": self._state.events_emitted,
            "events_failed": self._state.events_failed,
            "events_per_minute": self._state.events_per_minute,
            "source_profile": self._state.source_profile,
            "noise_ratio": self._state.noise_ratio,
            "last_error": self._state.last_error,
            "started_at": self._state.started_at,
        }

    async def start(
        self,
        events_per_minute: int,
        source_profile: str,
        noise_ratio: float = 0.0,
        api_base_url: str = "http://localhost:8000",
    ) -> dict:
        async with self._lock:
            if self._state.running:
                return self.status()
            self._state.running = True
            self._state.events_per_minute = events_per_minute
            self._state.source_profile = source_profile
            self._state.noise_ratio = noise_ratio
            self._state.started_at = datetime.now(timezone.utc).isoformat()
            self._state.last_error = None
            self._task = asyncio.create_task(self._run_loop(api_base_url))
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

    async def _run_loop(self, api_base_url: str) -> None:
        interval = 60.0 / max(self._state.events_per_minute, 1)
        async with httpx.AsyncClient(timeout=8.0) as client:
            while self._state.running:
                payload = make_synthetic_submission(source_profile=self._state.source_profile)
                if random.random() < self._state.noise_ratio:
                    payload["narrative"] = payload["narrative"][:12]
                try:
                    response = await client.post(f"{api_base_url}/api/reports", json=payload)
                    if response.status_code < 400:
                        self._state.events_emitted += 1
                    else:
                        self._state.events_failed += 1
                        self._state.last_error = f"http_{response.status_code}"
                except Exception as exc:
                    self._state.events_failed += 1
                    self._state.last_error = str(exc)
                await asyncio.sleep(interval)


_simulator = StreamSimulator()


def get_stream_simulator() -> StreamSimulator:
    return _simulator
