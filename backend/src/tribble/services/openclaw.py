from tribble.models.assistant import AssistantBlock


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
