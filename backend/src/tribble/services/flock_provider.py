import httpx

from tribble.services.llm_provider import LLMResult


class FlockProvider:
    def __init__(
        self,
        api_key: str,
        base_url: str,
        model: str,
        timeout_s: float = 15.0,
    ):
        self.api_key = api_key
        self.base_url = base_url.rstrip("/")
        self.model = model
        self.timeout_s = timeout_s

    def _headers(self) -> dict[str, str]:
        return {
            "x-litellm-api-key": self.api_key,
            "Content-Type": "application/json",
        }

    def _build_request(self, prompt: str, stream: bool = False) -> dict:
        return {
            "model": self.model,
            "messages": [{"role": "user", "content": prompt}],
            "stream": stream,
        }

    async def generate(self, prompt: str, stream: bool = False) -> LLMResult:
        if not self.api_key.strip():
            return LLMResult(status="disabled", model=self.model)

        try:
            async with httpx.AsyncClient(timeout=self.timeout_s) as client:
                response = await client.post(
                    f"{self.base_url}/chat/completions",
                    headers=self._headers(),
                    json=self._build_request(prompt, stream=stream),
                )
                response.raise_for_status()
                payload = response.json()
        except Exception as exc:
            return LLMResult(
                status="unavailable",
                model=self.model,
                error=str(exc),
                metadata={"provider": "flock"},
            )

        content = ""
        choices = payload.get("choices") or []
        if choices:
            content = str((choices[0].get("message") or {}).get("content") or "")

        return LLMResult(
            status="ok",
            text=content,
            model=self.model,
            metadata={"provider": "flock"},
        )

    async def list_models(self) -> list[str]:
        if not self.api_key.strip():
            return []

        try:
            async with httpx.AsyncClient(timeout=self.timeout_s) as client:
                response = await client.get(
                    f"{self.base_url}/models",
                    headers=self._headers(),
                )
                response.raise_for_status()
                payload = response.json()
        except Exception:
            return []

        out: list[str] = []
        for model in payload.get("data") or []:
            model_id = model.get("id")
            if isinstance(model_id, str) and model_id:
                out.append(model_id)
        return out
