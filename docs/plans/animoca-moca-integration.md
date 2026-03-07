# Animoca Labs / Moca Network — Research & Rough Implementation

## What It Is

**Animoca Brands** (Animoca Labs is their R&D/engine arm) is a Hong Kong–based company focused on blockchain gaming, digital property rights, and Web3. The piece that matters for integration is **Moca Network**, their identity and credentials stack.

**Moca Network** = **AIR Kit** (SDK/API) + **Moca Chain** (identity chain).

- **AIR Kit** — Developer toolkit with two services:
  - **Account Services**: Web3 login, SSO, wallet management (Moca ID).
  - **Credential Services**: Issue, verify, and consume **zero-knowledge credentials** (portable, verifiable).
- **AIR** = Account, Identity, Reputation. Use cases they list: AI agents with verifiable access, fintech (verify income/age without PII), games (portable identity/badges), DAOs (pseudonymous membership), consumer apps avoiding traditional KYC.
- **Tech**: Web SDK (`@mocanetwork/airkit`), Flutter SDK; **REST API** for server-side “issue on behalf” and status/verify. Auth is **Partner JWT** (JWKS + ES256 private key).

Docs: [docs.moca.network](https://docs.moca.network/airkit/).  
Issue-on-behalf (server-to-server): [Issue on Behalf](https://docs.moca.network/airkit/usage/credential/issue-on-behalf).  
Sandbox API base: `https://api.sandbox.mocachain.org/v1`.

---

## What Tribble Would Use It For

- **Verifiable reporter identity**  
  Submitters who prove identity via Moca (e.g. Moca ID login or a verified credential) get a **higher source prior** in the confidence model, so their reports are treated as more trustworthy without Tribble handling PII or running KYC.

- **Optional credential issuance**  
  Tribble (as issuer) could issue credentials such as “verified field reporter” or “NGO partner” via the **Issue on Behalf** API, then use presence of that credential at submission time to boost `source_prior` or to gate certain actions.

- **Single integration point**  
  One Moca integration can serve both web and (future) WhatsApp intake: user proves identity in Moca; Tribble only checks “has valid credential / session” and maps that to a source type or prior.

---

## Rough Implementation

### 1. Model and config

- **New source type** (optional but clear):
  - e.g. `WEB_MOCA_VERIFIED` or `MOCA_VERIFIED` (channel-agnostic).
- **`SOURCE_PRIORS`** in `backend/src/tribble/models/confidence.py`:
  - Add e.g. `"web_moca_verified": 0.88` (above `web_identified` 0.80, below `acled_historical` 0.95).
- **Report submission** (and any future WhatsApp adapter):
  - Accept an optional **Moca credential proof** or **session token** (e.g. from frontend after Moca login or credential present).
  - If present and valid → set `source_type` to Moca-verified and use the new prior; otherwise keep current behaviour (web_identified / web_anonymous, etc.).

### 2. Backend: Moca client (Python)

- **No official Python SDK** — use REST.
- **Env**: `MOCA_PARTNER_ID`, `MOCA_ISSUER_DID`, `MOCA_PRIVATE_KEY` (ES256), `MOCA_BUILD_ENV=sandbox|production`.
- **JWT**: Build Partner JWT (payload: `partnerId`, `email` for issue-on-behalf, `scope`, `exp`, `iat`); sign with ES256; send as `x-partner-auth`.
- **Endpoints** (from [Issue on Behalf](https://docs.moca.network/airkit/usage/credential/issue-on-behalf)):
  - `POST /v1/credentials/issue-on-behalf` — body: `issuerDid`, `credentialId`, `credentialSubject`, `onDuplicate`.
  - `GET /v1/credentials/status?coreClaimHash=...` — poll until `vcStatus` is `ONCHAIN`.
- **Verification**: Use Moca’s credential verification API (see [Credential Verification](https://docs.moca.network/airkit/quickstart/verify-credentials)) so that when the frontend sends a credential or session proof, the backend calls Moca to verify and then sets `source_type` + prior.

Implement a small **`tribble.integrations.moca`** (or `tribble.services.moca_client`) module:

- `generate_partner_jwt(scope: str, email: str | None = None) -> str`
- `issue_credential_on_behalf(email: str, credential_id: str, subject: dict, on_duplicate: str = "ignore") -> dict`
- `get_credential_status(core_claim_hash: str) -> dict`
- `verify_credential(proof_from_client: str) -> dict | None` (exact API depends on Moca verify docs)

Use **httpx** (async) and **PyJWT** + **cryptography** for ES256. Keep private key in env (or secret manager), never in code.

### 3. API: report submission

- **`POST /api/reports`** (and future WhatsApp webhook):
  - Add optional body field, e.g. `moca_proof: str | null` or `moca_session_token: str | null`.
  - If `moca_proof` present:
    - Call `moca_client.verify_credential(moca_proof)`.
    - On success: set `source_type = SourceType.WEB_MOCA_VERIFIED` (or equivalent), `anonymity = IDENTIFIED` (or PSEUDONYMOUS per policy).
    - On failure or missing proof: keep current logic (e.g. `sub.anonymous` → web_anonymous / web_identified).
  - Persist `source_type` as today so confidence scoring and pipeline use the new prior.

### 4. Frontend (optional for first slice)

- For “Login with Moca” or “Verify with Moca”:
  - Embed **AIR Kit Web SDK** (`@mocanetwork/airkit`), init with `partnerId`, call `airService.login()` and/or credential presentation flow.
  - On success, send the returned proof/token in `moca_proof` (or equivalent) with the report payload.
- If the first implementation is backend-only (e.g. issue-on-behalf for known emails), frontend can be deferred.

### 5. Credential schema (Dashboard)

- In Moca Developer Dashboard (sandbox): create a **schema** for “Tribble verified reporter” (or “NGO partner”) with attributes you need (e.g. `role`, `organisation`, `verified_at`).
- Create an **Issuance program** from that schema; use its ID as `credentialId` in issue-on-behalf and (if you verify by credential type) in verification.

### 6. Testing

- Use Moca **sandbox** (`BUILD_ENV.SANDBOX`, `https://api.sandbox.mocachain.org/v1`).
- Unit tests: mock `httpx` calls to Moca endpoints; assert correct JWT shape and request body.
- Integration test (optional): real sandbox issue + status check with a test email; verify report created with `WEB_MOCA_VERIFIED` and higher `source_prior` in confidence breakdown.

### 7. Dependencies

- `httpx`
- `pyjwt[crypto]` (or `PyJWT` + `cryptography` for ES256)

No need for the Node `@mocanetwork/airkit` on the backend if you only do server-side issue and verify via REST.

---

## Summary

| Item | Purpose |
|------|--------|
| **What it is** | Animoca’s Moca Network = AIR Kit (identity + ZK credentials) + Moca Chain; REST API for server-side issue/verify. |
| **Why Tribble** | Verifiable reporter identity → higher source prior; optional “verified reporter” credentials; one integration for web + future WhatsApp. |
| **Rough implementation** | New source type + SOURCE_PRIORS; Python Moca client (JWT + httpx); verify at report submit; optional frontend AIR Kit; credential schema + program in Dashboard; sandbox first. |

---

## One-line description for Animoca Labs

**“Animoca Labs — R&D arm of Animoca Brands; Moca Network (AIR Kit) provides the identity and verifiable-credentials stack we use for trusted reporter identity and higher confidence scoring without handling PII.”**
