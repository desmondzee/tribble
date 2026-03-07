from enum import StrEnum
from typing import Any

from pydantic import BaseModel, Field, model_validator


class AssistantBlockType(StrEnum):
    TEXT = "text"
    BULLETS = "bullets"
    CITATION = "citation"
    WARNING = "warning"


class AssistantBlock(BaseModel):
    type: AssistantBlockType
    text: str = Field(min_length=1)
    items: list[str] = Field(default_factory=list)
    report_id: str | None = None

    @model_validator(mode="after")
    def validate_shape(self) -> "AssistantBlock":
        if self.type == AssistantBlockType.CITATION and not self.report_id:
            raise ValueError("citation blocks require report_id")
        return self


class AssistantQuery(BaseModel):
    prompt: str = Field(min_length=1, max_length=4000)
    cluster_id: str | None = None
    conversation_id: str | None = None


class AssistantResponse(BaseModel):
    conversation_id: str
    blocks: list[AssistantBlock] = Field(default_factory=list)
    metadata: dict[str, Any] = Field(default_factory=dict)
