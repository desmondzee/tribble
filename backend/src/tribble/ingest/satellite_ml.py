import httpx

from tribble.models.satellite_ml import SatelliteMLResult


def build_compression_request(
    scene_id: str,
    bbox: list[float],
    provider: str = "compression_company",
) -> dict:
    return {
        "provider": provider,
        "scene_id": scene_id,
        "bbox": bbox,
    }


def parse_provider_result(payload: dict, scene_id: str) -> SatelliteMLResult:
    return SatelliteMLResult(
        scene_id=scene_id,
        change_probability=float(payload.get("change_probability", 0.0)),
        compression_ratio=float(payload.get("compression_ratio", 1.0)),
        change_type=payload.get("change_type"),
        quality_score=payload.get("quality_score"),
        metadata={"raw": payload},
    )


class CompressionProviderClient:
    def __init__(self, base_url: str, api_key: str, timeout_s: float = 20.0):
        self.base_url = base_url.rstrip("/")
        self.api_key = api_key
        self.timeout_s = timeout_s

    def _headers(self) -> dict[str, str]:
        if not self.api_key:
            return {"Content-Type": "application/json"}
        return {"Authorization": f"Bearer {self.api_key}", "Content-Type": "application/json"}

    async def submit_job(self, scene_id: str, bbox: list[float]) -> SatelliteMLResult:
        request_payload = build_compression_request(scene_id=scene_id, bbox=bbox)
        if not self.base_url:
            return SatelliteMLResult(
                scene_id=scene_id,
                change_probability=0.0,
                compression_ratio=1.0,
                change_type=None,
                quality_score=0.0,
                metadata={"fallback": True, "reason": "provider_unconfigured"},
            )

        try:
            async with httpx.AsyncClient(timeout=self.timeout_s) as client:
                resp = await client.post(
                    f"{self.base_url}/jobs",
                    headers=self._headers(),
                    json=request_payload,
                )
                resp.raise_for_status()
                payload = resp.json()
        except Exception as exc:
            return SatelliteMLResult(
                scene_id=scene_id,
                change_probability=0.0,
                compression_ratio=1.0,
                change_type=None,
                quality_score=0.0,
                metadata={"fallback": True, "reason": "provider_error", "error": str(exc)},
            )

        return parse_provider_result(payload, scene_id=scene_id)
