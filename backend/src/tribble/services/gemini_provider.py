from google import genai

from tribble.services.llm_provider import LLMResult


class GeminiProvider:
    def __init__(self, api_key: str, model: str = "gemini-2.5-flash"):
        self.api_key = api_key
        self.model_name = model
        self._client = genai.Client(api_key=api_key) if api_key.strip() else None

    async def generate(self, prompt: str, stream: bool = False) -> LLMResult:
        if not self._client:
            return LLMResult(status="disabled", model=self.model_name)

        try:
            response = await self._client.aio.models.generate_content(
                model=self.model_name,
                contents=prompt,
            )
            return LLMResult(
                status="ok",
                text=response.text or "",
                model=self.model_name,
                metadata={"provider": "gemini"},
            )
        except Exception as exc:
            return LLMResult(
                status="unavailable",
                model=self.model_name,
                error=str(exc),
                metadata={"provider": "gemini"},
            )
