import pytest

from tribble.models.assistant import AssistantBlock, AssistantResponse


def test_citation_block_requires_report_id():
    with pytest.raises(Exception):
        AssistantBlock(type="citation", text="source only")


def test_response_accepts_text_and_citation_blocks():
    r = AssistantResponse(
        conversation_id="c1",
        blocks=[
            AssistantBlock(type="text", text="summary"),
            AssistantBlock(type="citation", text="report", report_id="r1"),
        ],
    )
    assert len(r.blocks) == 2
