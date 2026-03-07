from dataclasses import dataclass, field
from typing import Any, Literal, Protocol


LLMStatus = Literal["ok", "disabled", "unavailable"]


@dataclass(slots=True)
class LLMResult:
    status: LLMStatus
    text: str = ""
    model: str | None = None
    error: str | None = None
    metadata: dict[str, Any] = field(default_factory=dict)


class LLMProvider(Protocol):
    async def generate(self, prompt: str, stream: bool = False) -> LLMResult:
        ...
