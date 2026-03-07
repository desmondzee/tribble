import pytest

from tribble.services.openclaw import maybe_enhance_with_provider


@pytest.mark.asyncio
async def test_provider_failure_keeps_deterministic_response():
    class FailingProvider:
        async def generate(self, prompt: str):
            raise RuntimeError("network")

    blocks = await maybe_enhance_with_provider("hello", [], FailingProvider())
    assert blocks == []
