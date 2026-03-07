import httpx

from tribble.services.llm_provider import LLMResult


class ZAIProvider:
    def __init__(self, api_key: str, model: str, base_url: str, timeout_s: float = 15.0):
        self.api_key = api_key
        self.model = model
        self.base_url = base_url.rstrip("/")
        self.timeout_s = timeout_s

    def _headers(self) -> dict[str, str]:
        return {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json",
        }

    def _payload(self, prompt: str) -> dict:
        return {
            "model": self.model,
            "messages": [{"role": "user", "content": prompt}],
            "temperature": 0.2,
        }

    async def generate(self, prompt: str, stream: bool = False) -> LLMResult:
        del stream
        if not self.api_key.strip():
            return LLMResult(status="disabled", provider="zai", model=self.model)

        try:
            async with httpx.AsyncClient(timeout=self.timeout_s) as client:
                response = await client.post(
                    f"{self.base_url}/chat/completions",
                    headers=self._headers(),
                    json=self._payload(prompt),
                )
                response.raise_for_status()
                payload = response.json()
        except Exception as exc:
            return LLMResult(
                status="unavailable",
                provider="zai",
                model=self.model,
                error=str(exc),
            )

        choices = payload.get("choices") or []
        text = ""
        if choices:
            text = str((choices[0].get("message") or {}).get("content") or "")
        return LLMResult(status="ok", provider="zai", model=self.model, text=text)
