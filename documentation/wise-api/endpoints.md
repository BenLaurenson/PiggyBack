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

## Empirically Verified Shapes

Verified live against `https://api.wise.com` on 2026-05-25. Redacted response samples in `documentation/wise-api/response-samples/`. These findings supersede any conflicting detail above.

### profile.type casing

- **Actual values observed:** `"PERSONAL"` and `"BUSINESS"` — both uppercase.
- **Recommendation:** case-sensitive equality against the verified uppercase strings. The Wise narrative docs that use lowercase appear to be inaccurate; the live API returns uppercase consistently.
- **Source:** `response-samples/01-profiles.json` (also confirmed on `accountHolder.type` in statement responses).

### Statement endpoint path

- **Verified working path:** `GET /v1/profiles/{profileId}/balance-statements/{balanceId}/statement.json`
  - Note: the `{balanceId}` here is the balance `id` from `/v4/profiles/{profileId}/balances`, **not** the `borderless-accounts` account id.
  - `v3/...balance-statements/...` also returns 200 with the same payload shape (both v1 and v3 prefixes work and return identical structure for this resource).
- **Verified non-working paths (404):**
  - `/v1/profiles/{profileId}/borderless-accounts/{balanceId}/statement.json` — 404. The old "borderless-accounts" path requires the **borderless account id**, not the balance id.
  - `/v3/profiles/{profileId}/borderless-accounts/{accountId}/statement.json` returned 200 when called with the borderless-account id (e.g. `43095924`) — same payload — but using the `balance-statements` path with the balance id is the cleaner, current pattern since `/v4/profiles/{profileId}/balances` is the canonical way to enumerate balances.
  - `/v4/profiles/{profileId}/balance-statements/...` — 404 (no v4 yet).

### Statement transaction shape

- **`amount.value`: numeric** (JSON number, e.g. `1.00`, `-17.94`). Not a string. Same for `amount.value` on nested objects (`totalFees`, `runningBalance`, `details.amount`, `details.sourceAmount`, `details.targetAmount`, `exchangeDetails.fromAmount`, `exchangeDetails.toAmount`).
- **`amount.currency`: string** (ISO 4217 code, uppercase).
- **`amount.zero`: boolean** — extra convenience flag present on every monetary object inside the statement payload (`true` when value is 0). Not in any docs we've found, but consistent across all samples.
- **`referenceNumber`: always present**, string, format `PREFIX-DIGITS`. Observed prefixes:
  - `CARD-NNNNNNNNNN` — card transactions
  - `TRANSFER-NNNNNNNNNN` — deposits and outbound transfers
  - `BALANCE-NNNNNNNNNN` — conversions (cross-currency moves within own balances)
  - `FEE-TRANSFER-NNNNNNNNNN` — fee-only legs (note: double-prefix)
  - Treat the entire `referenceNumber` string as opaque — do not parse the prefix as a discriminator.
  - **Not unique by itself.** A single `referenceNumber` can appear as both `DEBIT` (charge) and `CREDIT` (refund) on the same balance, and FX legs share the reference across balances. The dedupe key must be at least `(referenceNumber, type, balanceId)`. Confirmed in `response-samples/05-statement-flat-foreign.json` — two CARD references each appear twice within USD as a DEBIT/CREDIT pair.
- **`nextCursor`: absent.** The statement response has no `cursor`, `nextCursor`, `page`, or any pagination token at the root, inside `transactions`, or anywhere. Pagination is purely date-window chunking by `intervalStart` / `intervalEnd`.
- **Top-level `type`** (`CREDIT` | `DEBIT`) — distinct from `details.type`. Sign of `amount.value` matches: `DEBIT` is negative, `CREDIT` is positive.
- **`details.type` sample values:** `CARD`, `DEPOSIT`, `TRANSFER`, `CONVERSION`, `MONEY_ADDED` (uppercase). `details` schema varies by `details.type`:
  - `CARD`: `{type, description, amount, category, merchant, cardLastFourDigits, cardHolderFullName}`
  - `DEPOSIT`: `{type, description, senderName, senderAccount, paymentReference, recipientAccountNumber, recipientAccountDetailsId}`
  - `TRANSFER`: `{type, description, recipient: {name, bankAccount}, paymentReference, creatorTrackingId}`
  - `CONVERSION`: `{type, description, sourceAmount, targetAmount, rate}`
  - `MONEY_ADDED`: `{type, description}` (minimal)
- **`runningBalance` shape:** `{value: number, currency: string, zero: boolean}` — same shape as `amount`.
- **`exchangeDetails` shape (when present):**
  ```json
  {
    "toAmount":   {"value": 1.00,  "currency": "AUD", "zero": false},
    "fromAmount": {"value": 0.73,  "currency": "USD", "zero": false},
    "rate":       1.39850
  }
  ```
  Present on FX legs (cross-currency `CARD`, `TRANSFER`, `CONVERSION`). `null` on pure same-currency activity.
- **`attachment`: `null`** in every observed transaction.
- **`activityAssetAttributions`: empty array** in every observed transaction.
- **`date`: ISO 8601 with `Z` suffix and microsecond precision** (e.g. `"2026-05-20T23:01:33.153144Z"`).

### Statement response envelope (top-level)

```json
{
  "accountHolder":     { type, profileId, address, businessName, registrationNumber, companyType },
  "issuer":            { name, firstLine, city, postCode, stateCode, countryCode, country },
  "issuers":           { payments: {...}, assets: [...] },
  "bankDetails":       { ... },
  "transactions":      [ ... ],
  "startOfStatementBalance": { value, currency, zero },
  "endOfStatementBalance":   { value, currency, zero },
  "endOfStatementUnrealisedGainLoss": null | {...},
  "balanceAssetConfiguration": null | {...},
  "query":             { intervalStart, intervalEnd, type, splitRefundFees, addStamp, currency, profileId, timezone },
  "request":           { id (UUID), creationTime, profileId, currency, balanceId, ... },
  "feeSummary":        { summaryTitle, fromTitle, toTitle, feesTitle, feeSummaryItems: [] },
  "locale":            { code: "en-GB" }
}
```

### FLAT vs COMPACT

- **For our test interval (3 transactions, no FX), FLAT and COMPACT returned identical structure** — same top-level keys, same per-transaction keys, same `details.*` keys.
- The Wise docs imply `FLAT` may expand some nested objects in cases where COMPACT collapses them, but we did not observe a difference in our samples. Treat them as schema-equivalent for client interface purposes.
- **Recommendation for Phase 1A: `type=FLAT`.** Explicit, matches the verified shape, and is the safer choice if Wise ever ships a COMPACT-only collapse for some `details.type`.

### Balances response (`/v4/profiles/{profileId}/balances?types=STANDARD`)

- Returns flat array of balance objects (not wrapped).
- Each balance: `{id, currency, amount, reservedAmount, cashAmount, totalWorth, type, name, icon, investmentState, creationTime, modificationTime, visible, primary, groupId, recipientId}`.
- All monetary fields are `{value: number, currency: string}` — no `zero` flag at this layer (the `zero` flag appears only in statement responses).
- `type`: `"STANDARD"` (uppercase) — confirms casing.
- `investmentState`: `"NOT_INVESTED"` observed; presumably `"INVESTED"` for jar/investment balances.

### Profiles response (`/v2/profiles`)

- Returns flat array. Each profile has `id` (number), `type` (`"PERSONAL"` | `"BUSINESS"`), and a large set of profile fields. Business profiles include `businessName`, `registrationNumber`, `companyType` (e.g. `"SOLE_TRADER"`), `descriptionOfBusiness`, `firstLevelCategory`, `secondLevelCategory`, `industryCategories`, `operationalAddresses[]`.
- The business-resolution function should: fetch `/v2/profiles`, filter `type === "BUSINESS"`, take `.id`. If multiple business profiles exist, additional disambiguation will be needed (out of scope for Phase 1A).

## Verification notes

- **Casing of profile `type`:** ~~Wise docs show both `PERSONAL`/`BUSINESS` (uppercase, in OpenAPI excerpts) and `personal`/`business` (lowercase, in narrative). Confirm empirically in sandbox before doing strict-equality matching; safest implementation is case-insensitive comparison.~~ **Resolved 2026-05-25:** live API returns uppercase (`"PERSONAL"`, `"BUSINESS"`). Use case-sensitive equality. See "Empirically Verified Shapes" above.
- **Balance `types` parameter is required.** Forgetting it returns an empty array or 400. Default to `STANDARD` for Phase 1A.
- **469-day window cap is real.** The sync worker must chunk longer historical pulls. A reasonable default is monthly windows for fresh syncs and a since-cursor windowed query for incremental updates.
- **`details.description` is the only human-readable field.** There is no Wise "category" taxonomy comparable to Up Bank — categorization is downstream of ingest.
- **Activities `primaryAmount`/`secondaryAmount` being strings is the single biggest gotcha** — if a future task switches to `getActivity`, this must be re-litigated.
- **mTLS endpoints** (`api-mtls.transferwise.com`) are required for some high-value endpoints (e.g. funding transfers, payouts). Read-only ingest endpoints used here do **not** require mTLS — plain TLS to `api.wise.com` is fine for Phase 1A.
- **The `/v1/me` endpoint** returns the authenticated user, not the business profile. Validate token freshness with `/v1/me`; resolve the business via `/v2/profiles`.
- **Doc page `https://docs.wise.com/guides/developer/authentication`** returns 404 — content has moved under `/guides/developer/auth-and-security/...`.
