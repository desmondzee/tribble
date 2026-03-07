import pytest

from tribble.services.zai_provider import ZAIProvider, get_zai_provider


@pytest.mark.asyncio
async def test_provider_returns_disabled_when_no_key():
    provider = ZAIProvider(api_key="", model="glm-4", base_url="https://api.z.ai/v1")
    out = await provider.generate("hello")
    assert out.status == "disabled"


def test_get_zai_provider_returns_none_when_disabled():
    """By default enable_zai is False; provider is None so system is never forced to use Z.ai."""
    assert get_zai_provider() is None
