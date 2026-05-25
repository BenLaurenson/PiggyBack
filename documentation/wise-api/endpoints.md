# Wise API endpoints — verified for Phase 1A

> Verified on 2026-05-25 against https://docs.wise.com/api-reference. If Wise updates their API, re-verify before changes to `src/lib/wise-api.ts`.

## Base URLs

Source: https://docs.wise.com/guides/developer/environments

- **Live (TLS only):** `https://api.wise.com`
- **Live (mTLS):** `https://api-mtls.transferwise.com`
- **Sandbox (TLS only):** `https://api.wise.com` → actually `https://api.sandbox.transferwise.tech` is the legacy form; verified current value is `https://api.wise-sandbox.com`
- **Sandbox (mTLS):** `https://api-mtls.wise-sandbox.com`

For Phase 1A (no mTLS), use `https://api.wise.com` (live) and `https://api.wise-sandbox.com` (sandbox).

## Authentication

Source: https://docs.wise.com/guides/developer/auth-and-security/personal-api-token, https://docs.wise.com/guides/developer/auth-and-security/user-access-token

- Header: `Authorization: Bearer <token>`
- For Phase 1A we expect a **Personal API Token** stored per business — never expires until revoked.
- (User Access Tokens, by contrast, expire after 12 hours — out of scope for Phase 1A.)
- No other custom headers are strictly required for the read-only endpoints below. (For state-changing operations Wise requires an `X-idempotence-uuid` header; not applicable to ingest reads. SCA / 2FA over API requires `X-2FA-Approval` and a signature header — only required for some sensitive endpoints, not the read-only ones used here.)
- Standard `Accept: application/json` recommended.

## Ping / token validation

Source: https://docs.wise.com/api-reference/user/usergetbytoken

- **Path:** `/v1/me`
- **Method:** `GET`
- **Response shape (relevant fields only):**
  ```json
  {
    "id": 12345,
    "name": "string",
    "email": "string",
    "active": true,
    "details": { /* firstName, lastName, ... */ }
  }
  ```
- A successful 200 response with a body containing `id` confirms the token is valid. Wise docs do not document this endpoint as a "ping" specifically, but it is the canonical authenticated-user lookup and is the conventional Wise token-validation endpoint.

## List profiles

Source: https://docs.wise.com/api-reference/profile, https://docs.wise.com/api-reference/profile/list-profiles

- **Path:** `/v2/profiles`
- **Method:** `GET`
- **Response shape:** JSON array of profile objects.
  ```json
  [
    {
      "id": 12345,
      "type": "PERSONAL",
      "firstName": "John",
      "lastName": "Doe"
    },
    {
      "id": 67890,
      "type": "BUSINESS",
      "name": "Acme Corp"
    }
  ]
  ```
- **Type field:** `"PERSONAL"` or `"BUSINESS"`.
  - Wise docs are slightly inconsistent on casing (some examples show lowercase `personal`/`business`). The v2 endpoint returns uppercase. **Unverified — confirm casing empirically during Task 6 by logging the first response in sandbox before relying on equality checks; treat case-insensitively for safety.**
- **Filtering:** No query param needed; client filters the array to find the `BUSINESS` profile.

## List balances for a profile

Source: https://docs.wise.com/api-reference/balance, deep-search on /balance/list

- **Path:** `/v4/profiles/{profileId}/balances`
- **Method:** `GET`
- **Required query params:**
  - `types` — comma-separated list. For ingest, use `STANDARD` (the operating multi-currency balance). `SAVINGS` is the jars/buckets feature; include if jar transactions are wanted, otherwise omit.
- **Response shape:**
  ```json
  {
    "balances": [
      {
        "id": 1234567,
        "profileId": 67890,
        "currency": "AUD",
        "type": "STANDARD",
        "name": "string|null",
        "amount": {
          "value": 0.00,
          "currency": "AUD"
        },
        "investmentState": "NOT_INVESTED",
        "createdAt": "2024-01-01T00:00:00Z",
        "accountStatus": "ACTIVE"
      }
    ]
  }
  ```
  Note: balances are wrapped in a top-level `balances` array — not a bare array.
- Balance amount lives at `amount.value` (number) with `amount.currency` (ISO 4217 code).

## Statement endpoint (per balance)

Sources: https://docs.wise.com/api-reference/balance-statements, https://docs.wise.com/api-reference/balance-statement/balancestatementget, https://docs.wise.com/guides/product/receive-money/get-a-balance-statement

- **Path:** `/v1/profiles/{profileId}/balance-statements/{balanceId}/statement.json`
- **Method:** `GET`
- **Required query params:**
  - `intervalStart` — ISO 8601 UTC, e.g. `2025-03-01T00:00:00.000Z`
  - `intervalEnd` — ISO 8601 UTC, e.g. `2025-04-30T23:59:59.999Z`
  - The span between the two **must not exceed 469 days** (~1 year 3 months). The sync worker must chunk longer ranges.
  - Optional: `type` (`COMPACT` or `FLAT`) — Wise docs default to `COMPACT`. Use `FLAT` if a flatter transaction shape is preferred. **Unverified — confirm default in sandbox; for Phase 1A leaving unset (server default) is fine.**
- **Date format:** ISO 8601 in UTC, milliseconds + `Z` suffix. Examples confirmed in docs: `2025-03-01T00:00:00.000Z`, `2018-04-30T23:59:59.999Z`.
- **Pagination shape:**
  - **No cursor/page-based pagination.** Statement is a single response for the (single-currency) balance and the requested window. The client must chunk by date-window if the window > 469 days OR if a window risks exceeding response size limits — Wise does not document a hard row limit, so chunking is defensive.
  - Detect "last page": there isn't one — each request returns the full window in one response.
- **Transaction entry shape (relevant fields):** Each entry lives in the top-level `transactions[]` array.
  - **Transaction ID:** `referenceNumber` (string) — Wise-assigned unique identifier per transaction. For transfers it is prefixed with `TRANSFER-`.
  - **Date:** `date` (string, ISO 8601 UTC).
  - **Amount:** `amount.value` (number, signed — negative for debits) and `amount.currency` (string). `type` field is `"DEBIT"` or `"CREDIT"`.
  - **Description:** `details.description` (string) — human-readable. Other useful fields under `details`: `type` (e.g. `CARD`, `CONVERSION`, `DEPOSIT`, `TRANSFER`), `paymentReference`, `senderName`, `senderAccount`, `merchant`.
  - **Category:** No first-class category field. The closest signal is `details.type` (CARD / TRANSFER / CONVERSION / DEPOSIT / FEE / etc.) and the merchant block for card transactions. **Unverified — Wise does not appear to expose a category taxonomy comparable to Up Bank.**
  - **FX conversion leg:** `exchangeDetails.forAmount` (`{value, currency}`) and `exchangeDetails.rate` (number) when the transaction involves a conversion; `exchangeDetails` is `null` otherwise. For card transactions made in a foreign currency, `details.sourceAmount`, `details.targetAmount`, `details.fee`, and `details.rate` may also be present.
  - **Running balance:** `runningBalance.value` / `runningBalance.currency`.
  - **Fees:** `totalFees.value` / `totalFees.currency`.
- **Wrapper response fields:** `accountHolder`, `issuer`, `bankDetails`, `transactions[]`, `endOfStatementBalance`, `query` (echo of intervalStart/intervalEnd/currency/accountId).

## Activity endpoint (alternative)

Sources: https://docs.wise.com/api-reference/activities, https://docs.wise.com/api-reference/activity/activitylist

- **Path:** `/v1/profiles/{profileId}/activities`
- **Method:** `GET`
- **Query params:**
  - `monetaryResourceType` (string, optional) — e.g. `TRANSFER`, `CARD_TRANSACTION`, `BALANCE_CASHBACK`.
  - `status` (string, optional) — `REQUIRES_ATTENTION`, `IN_PROGRESS`, `UPCOMING`, `COMPLETED`, `CANCELLED`.
  - `since` (string, optional) — ISO 8601 timestamp.
  - `until` (string, optional) — ISO 8601 timestamp.
  - `size` (int, optional) — 1..100, default 10.
  - `nextCursor` (string, optional) — pagination cursor from previous response.
- **Pagination shape:**
  - Cursor parameter name: `nextCursor` (query string).
  - Where the next cursor appears in the response: top-level `cursor` field on the response.
  - How to detect last page: `cursor` is `null` (or absent).
- **Response shape:**
  ```json
  {
    "cursor": "string|null",
    "activities": [
      {
        "id": "string",
        "type": "string",
        "resource": { "type": "string", "id": "string" },
        "title": "string",
        "description": "string",
        "primaryAmount": "string",
        "secondaryAmount": "string",
        "status": "string",
        "createdOn": "string",
        "updatedOn": "string"
      }
    ]
  }
  ```
- **Critical caveat — `primaryAmount` / `secondaryAmount` are strings, not numeric objects.** Wise docs call these "currency-formatted text" (e.g. `"-12.34 AUD"`). They are display-formatted, **not** machine-parseable money amounts. To recover a numeric amount and currency, the client would need to either parse the string or fetch the underlying resource via `resource.id` + `resource.type`.
- **Cross-currency / cross-balance scope:** The activity endpoint is profile-scoped, not balance-scoped — a single call returns activities spanning all balances/currencies for the profile, which is the appealing property for a single sync stream.

## Decision: getStatement vs getActivity

**Decision: use `getStatement` (per balance), not `getActivity`.**

Rationale: the activity endpoint's `primaryAmount`/`secondaryAmount` are display-formatted strings ("currency-formatted text"), not structured `{value, currency}` objects. Building reliable ledger entries from formatted strings is brittle and locale-dependent, and recovering structured amounts would require a second fetch per activity. The statement endpoint returns numeric `amount.value` + `amount.currency`, structured `exchangeDetails` for FX legs, signed amounts, `runningBalance`, and a stable `referenceNumber` — exactly the fields the sync worker needs. The trade-off (one call per balance per window vs. one stream) is acceptable: Wise Business accounts typically hold a small set of active currencies, and chunking by 469-day windows is already required.

`getActivity` may be useful later for surfacing in-progress / pending items that haven't posted to a balance yet, but it is not the right primitive for canonical transaction ingest.

The Phase 1A `getStatementPage` signature in the task spec includes a `nextCursor` param. Because the statement endpoint does **not** paginate, `nextCursor` in our client wrapper will be effectively unused for `getStatement` — the sync worker is responsible for chunking by date window. Keep the parameter in the signature for shape parity, but treat it as a no-op for the statement path. Reconsider if Wise adds pagination later.

## Verification notes

- **Casing of profile `type`:** Wise docs show both `PERSONAL`/`BUSINESS` (uppercase, in OpenAPI excerpts) and `personal`/`business` (lowercase, in narrative). Confirm empirically in sandbox before doing strict-equality matching; safest implementation is case-insensitive comparison.
- **Balance `types` parameter is required.** Forgetting it returns an empty array or 400. Default to `STANDARD` for Phase 1A.
- **469-day window cap is real.** The sync worker must chunk longer historical pulls. A reasonable default is monthly windows for fresh syncs and a since-cursor windowed query for incremental updates.
- **`details.description` is the only human-readable field.** There is no Wise "category" taxonomy comparable to Up Bank — categorization is downstream of ingest.
- **Activities `primaryAmount`/`secondaryAmount` being strings is the single biggest gotcha** — if a future task switches to `getActivity`, this must be re-litigated.
- **mTLS endpoints** (`api-mtls.transferwise.com`) are required for some high-value endpoints (e.g. funding transfers, payouts). Read-only ingest endpoints used here do **not** require mTLS — plain TLS to `api.wise.com` is fine for Phase 1A.
- **The `/v1/me` endpoint** returns the authenticated user, not the business profile. Validate token freshness with `/v1/me`; resolve the business via `/v2/profiles`.
- **Doc page `https://docs.wise.com/guides/developer/authentication`** returns 404 — content has moved under `/guides/developer/auth-and-security/...`.
