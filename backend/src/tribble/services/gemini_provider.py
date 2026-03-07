import google.generativeai as genai

from tribble.services.llm_provider import LLMResult


class GeminiProvider:
    def __init__(self, api_key: str, model: str = "gemini-2.5-flash"):
        self.api_key = api_key
        self.model_name = model

    async def generate(self, prompt: str, stream: bool = False) -> LLMResult:
        if not self.api_key.strip():
            return LLMResult(status="disabled", model=self.model_name)

        try:
            genai.configure(api_key=self.api_key)
            model = genai.GenerativeModel(self.model_name)
            response = model.generate_content(prompt)
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
