import pytest

from tribble.services.zai_provider import ZAIProvider


@pytest.mark.asyncio
async def test_provider_returns_disabled_when_no_key():
    provider = ZAIProvider(api_key="", model="glm-4", base_url="https://api.z.ai/v1")
    out = await provider.generate("hello")
    assert out.status == "disabled"
