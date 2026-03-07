import pytest

from tribble.services.flock_provider import FlockProvider


@pytest.mark.asyncio
async def test_returns_disabled_without_key():
    provider = FlockProvider(api_key="", base_url="https://api.flock.io/v1", model="model")
    out = await provider.generate("summarize")
    assert out.status == "disabled"


@pytest.mark.asyncio
async def test_builds_chat_completions_request_shape():
    provider = FlockProvider(api_key="k", base_url="https://api.flock.io/v1", model="model")
    req = provider._build_request("hello", stream=False)
    assert req["model"] == "model"
    assert req["messages"][0]["role"] == "user"
