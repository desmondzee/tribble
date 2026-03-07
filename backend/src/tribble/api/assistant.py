from uuid import uuid4

from fastapi import APIRouter, HTTPException

from tribble.config import get_settings
from tribble.models.assistant import AssistantQuery, AssistantResponse
from tribble.services.flock_provider import FlockProvider
from tribble.services.openclaw import build_cluster_answer, maybe_enhance_with_provider

router = APIRouter(prefix="/api/assistant", tags=["assistant"])


@router.post("/query", response_model=AssistantResponse)
async def query_assistant(query: AssistantQuery) -> AssistantResponse:
    settings = get_settings()
    if not settings.enable_openclaw:
        raise HTTPException(503, "OpenClaw assistant is disabled")

    blocks = build_cluster_answer(
        query.prompt,
        {
            "country": "Unknown",
            "report_count": 0,
            "top_need_categories": [],
            "evidence": [],
        },
    )

    enhanced_blocks = []
    if settings.enable_flock:
        provider = FlockProvider(
            api_key=settings.flock_api_key,
            base_url=settings.flock_api_base_url,
            model=settings.flock_model,
        )
        enhanced_blocks = await maybe_enhance_with_provider(query.prompt, blocks, provider)

    return AssistantResponse(
        conversation_id=query.conversation_id or str(uuid4()),
        blocks=blocks + enhanced_blocks,
        metadata={
            "mode": "deterministic",
            "flock_enabled": settings.enable_flock,
            "flock_enhanced": bool(enhanced_blocks),
        },
    )
