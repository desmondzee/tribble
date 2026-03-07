import logging

from tribble.models.assistant import AssistantBlock
from tribble.services.llm_provider import LLMProvider

logger = logging.getLogger(__name__)

def _format_need(need: str) -> str:
    return need.replace("_", " ").strip().title()


def build_cluster_answer(prompt: str, cluster: dict) -> list[AssistantBlock]:
    country = cluster.get("country") or "Unknown"
    admin1 = cluster.get("admin1")
    location = f"{admin1}, {country}" if admin1 else country
    report_count = int(cluster.get("report_count") or 0)
    needs = [_format_need(n) for n in cluster.get("top_need_categories", [])]

    blocks: list[AssistantBlock] = [
        AssistantBlock(
            type="text",
            text=(
                f"{report_count} reports in {location}. "
                f"Prompt: {prompt.strip() or 'Situation update requested.'}"
            ),
        )
    ]

    if needs:
        blocks.append(
            AssistantBlock(
                type="bullets",
                text="Priority needs",
                items=needs,
            )
        )

    for evidence in cluster.get("evidence", []):
        report_id = evidence.get("report_id")
        if not report_id:
            continue
        excerpt = evidence.get("excerpt") or "Source evidence attached."
        blocks.append(
            AssistantBlock(
                type="citation",
                text=excerpt,
                report_id=report_id,
            )
        )

    return blocks


async def maybe_enhance_with_provider(
    prompt: str,
    base_blocks: list[AssistantBlock],
    provider: LLMProvider | None,
) -> list[AssistantBlock]:
    del base_blocks  # reserved for future context-aware prompting
    if provider is None:
        return []

    try:
        result = await provider.generate(prompt)
    except Exception:
        logger.exception("Provider enhancement failed")
        return []

    if result.status != "ok":
        return []

    content = result.text.strip()
    if not content:
        return []

    return [AssistantBlock(type="text", text=content)]
