"""Google Gemini LLM provider. Same interface as AnthropicProvider. Use TRIBBLE_GEMINI_API_KEY and TRIBBLE_GEMINI_MODEL."""

import logging

from tribble.services.llm_provider import LLMResult

logger = logging.getLogger(__name__)


class GeminiProvider:
    def __init__(self, api_key: str, model: str = "gemini-2.0-flash"):
        self.api_key = (api_key or "").strip()
        self.model_name = model
        self._api_key = self.api_key if self.api_key else None

    async def generate(self, prompt: str, stream: bool = False) -> LLMResult:
        if not self._api_key:
            return LLMResult(status="disabled", model=self.model_name)

        try:
            from google.genai import Client

            async with Client(api_key=self._api_key).aio as client:
                response = await client.models.generate_content(
                    model=self.model_name,
                    contents=prompt,
                )
            text = (response.text or "").strip()
            return LLMResult(
                status="ok",
                text=text,
                model=self.model_name,
                metadata={"provider": "gemini"},
            )
        except Exception as exc:
            logger.warning("Gemini generate failed: %s", exc)
            return LLMResult(
                status="unavailable",
                model=self.model_name,
                error=str(exc),
                metadata={"provider": "gemini"},
            )
