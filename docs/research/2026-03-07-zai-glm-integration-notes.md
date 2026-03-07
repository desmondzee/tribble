# Z.ai GLM Integration Notes (Stage 2)

## Objective

Define a safe provider abstraction for optional Z.ai/GLM usage without blocking deterministic pipeline behavior.

## Proposed API Contract

- Provider class: `ZAIProvider`
- Entry method: `generate(prompt: str, stream: bool = False) -> LLMResult`
- Transport endpoint assumption: `POST {base_url}/chat/completions`
- Message shape: OpenAI-style chat payload with `messages[]`.

## Authentication

- Header: `Authorization: Bearer <TRIBBLE_ZAI_API_KEY>`
- Missing key behavior: provider returns `status="disabled"` instead of raising.

## Reliability and Safety

- Timeout budget: 15s default.
- Any network/HTTP/parse failure maps to `status="unavailable"` with error text.
- Assistant must keep deterministic fallback path even when provider is unavailable.

## Retry Policy (Planned)

- Stage 2 implementation: no automatic retry in provider class.
- Future: bounded retry (max 2), exponential backoff, retry only idempotent request failures.

## Unresolved Questions

- Confirm canonical production endpoint path and model list endpoint for Z.ai account tier.
- Confirm rate-limit headers and backoff guidance.
- Confirm streaming response format parity with OpenAI-style delta chunks.
