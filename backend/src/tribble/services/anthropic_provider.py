"""Anthropic Claude LLM provider. Same interface as other LLM providers (e.g. Flock)."""

import base64
import logging

from anthropic import AsyncAnthropic

from tribble.services.llm_provider import LLMResult

logger = logging.getLogger(__name__)


class AnthropicProvider:
    """Claude API provider for text and vision. Use TRIBBLE_ANTHROPIC_API_KEY and TRIBBLE_LLM_MODEL."""

    def __init__(self, api_key: str, model: str = "claude-3-5-haiku-20241022"):
        self.api_key = api_key
        self.model_name = model
        self._client = AsyncAnthropic(api_key=api_key) if (api_key or "").strip() else None

    async def generate(self, prompt: str, stream: bool = False) -> LLMResult:
        if not self._client:
            return LLMResult(status="disabled", model=self.model_name)

        try:
            message = await self._client.messages.create(
                model=self.model_name,
                max_tokens=4096,
                messages=[{"role": "user", "content": prompt}],
            )
            text = ""
            if message.content:
                for block in message.content:
                    if hasattr(block, "text"):
                        text += block.text
            return LLMResult(
                status="ok",
                text=text,
                model=self.model_name,
                metadata={"provider": "anthropic"},
            )
        except Exception as exc:
            logger.warning("Anthropic generate failed: %s", exc)
            return LLMResult(
                status="unavailable",
                model=self.model_name,
                error=str(exc),
                metadata={"provider": "anthropic"},
            )

    async def generate_with_image(
        self,
        prompt: str,
        image_bytes: bytes,
        mime_type: str = "image/png",
    ) -> LLMResult:
        """Generate content from prompt + image (vision)."""
        if not self._client:
            return LLMResult(status="disabled", model=self.model_name)

        b64 = base64.b64encode(image_bytes).decode("ascii")
        content = [
            {
                "type": "image",
                "source": {"type": "base64", "media_type": mime_type, "data": b64},
            },
            {"type": "text", "text": prompt},
        ]
        try:
            message = await self._client.messages.create(
                model=self.model_name,
                max_tokens=4096,
                messages=[{"role": "user", "content": content}],
            )
            text = ""
            if message.content:
                for block in message.content:
                    if hasattr(block, "text"):
                        text += block.text
            return LLMResult(
                status="ok",
                text=text,
                model=self.model_name,
                metadata={"provider": "anthropic"},
            )
        except Exception as exc:
            logger.warning("Anthropic generate_with_image failed: %s", exc)
            return LLMResult(
                status="unavailable",
                model=self.model_name,
                error=str(exc),
                metadata={"provider": "anthropic"},
            )
