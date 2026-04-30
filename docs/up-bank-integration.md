# Up Bank Integration

This document is the operational reference for how PiggyBack talks to Up Bank.
The canonical source-of-truth for any Up API question is the official docs at
https://developer.up.com.au/, which are also indexed by **context7** under the
library ID `/websites/developer_up_au` (High reputation, 92 indexed snippets).

If you're touching `src/lib/up-api.ts`, `src/app/api/upbank/webhook/route.ts`,
`src/app/api/upbank/sync/route.ts`, or `src/app/actions/upbank.ts`, **always
re-query context7 first** to confirm no drift since the last edit. Each method
on `UpApiClient` carries a `@see` link to the matching Up docs page — start
there.

---

## Endpoint inventory

| Endpoint | Used by | Purpose |
|---|---|---|
| `GET /util/ping` | `connectUpBank` | Validate a fresh PAT before encrypting + storing. |
| `GET /accounts` | sync | Bulk fetch user accounts. Filters: `accountType`, `ownershipType`. |
| `GET /accounts/{id}` | webhook | Refresh balance after a transaction event. |
| `GET /transactions/{id}` | webhook | Hydrate the full transaction body from a `TRANSACTION_*` event ID. |
| `GET /accounts/{id}/transactions` | sync | Time-window-chunked transaction sync. Filters: `since`, `until`. |
| `GET /categories` | sync | Pull Up's category tree. Not paginated per Up's docs. |
| `GET /tags` | sync | Populate `tags_canonical` for the activity tag picker. |
| `POST /webhooks` | `registerUpWebhook` | Subscribe to real-time transaction events. |
| `DELETE /webhooks/{id}` | `deleteUpWebhook` | Remove the subscription. |
| `POST /webhooks/{id}/ping` | `pingWebhook` | Fire a `PING` event for diagnostics. |
| `GET /webhooks/{id}/logs` | admin tooling | Inspect delivery history when a user reports stale data. |
| `PATCH /transactions/{id}/relationships/category` | UI categorisation | Set or clear (`data: null`) Up's category. |
| `POST/DELETE /transactions/{id}/relationships/tags` | UI tagging | Attach or detach tags. |

`/attachments` is documented but unused — see *Out of scope* below.

---

## Webhook contract

- **Signing**: SHA-256 HMAC over the raw request body, hex-encoded, in the
  `X-Up-Authenticity-Signature` header. Verified in constant time after a
  `^[0-9a-f]{64}$` regex pre-check (see `verifySignature` in
  `src/app/api/upbank/webhook/route.ts`).
- **Replay protection**: events older or further-future than `REPLAY_WINDOW_MS`
  (default 5 min) are rejected with `400 Event expired`. This is a
  PiggyBack-side defense — Up's docs don't mandate it.
- **Idempotency**: Up sets a stable `data.id` across delivery retries. PiggyBack
  also relies on the `(account_id, up_transaction_id)` unique constraint on
  `transactions` for de-duplication.
- **Retry by Up**: any non-200 response triggers exponential-backoff retry from
  Up's side. The handler returns `500` on processing errors so a transient blip
  is retried automatically; `401` on signature/secret failure stops retries.
- **Event types** (exhaustive per Up's docs as of 2026-04):
  - `PING` — diagnostic, acknowledged with no processing.
  - `TRANSACTION_CREATED` — new transaction (HELD or SETTLED-on-arrival).
  - `TRANSACTION_SETTLED` — HELD → SETTLED transition.
  - `TRANSACTION_DELETED` — HELD transaction was reversed (e.g. hotel deposit).
- **Cap**: Up enforces 10 webhooks per PAT. Surfaced via
  `UpWebhookLimitReachedError` with a friendly UI message.

## PAT lifecycle

```
user pastes PAT
   → connectUpBank() validates via /util/ping
   → encrypted with AES-256-GCM (UP_API_ENCRYPTION_KEY, 32 bytes)
   → stored in up_api_configs.encrypted_token
   → fetched + decrypted via getPlaintextToken when webhook/sync needs it
   → on 401 from Up: surface "reconnect" UI (UpUnauthorizedError)
   → on account deletion: webhook deleted via Up API, row dropped via FK cascade
```

Encryption key is required in production. In dev, a missing key falls back to
plaintext-passthrough (acknowledged tradeoff for local-only setup).

## Pagination strategy

- **Categories**: single GET (Up doesn't paginate this list). `getCategories`
  returns `{ data: UpCategory[] }`.
- **Accounts / tags / webhooks**: `getAllPages` walks `links.next` opaquely,
  capped at `MAX_PAGES = 100`. With `page[size] = 100`, that's 10k items —
  comfortable for these small lists.
- **Transactions**: time-window chunking, **not** unbounded `getAllPages`.
  Each window is `SYNC_WINDOW_DAYS = 30` days; pages within a window are
  walked normally. This bounds memory and makes sync naturally resumable on
  timeout — a partial run leaves `last_synced_at` unchanged so the next run
  picks up from the same `since`.

Every walked URL is re-validated via `validateUpApiUrl` to prevent SSRF — a
compromised pagination link can't redirect us to internal services.

## Error taxonomy

`UpApiClient.request<T>` parses HTTP status and throws one of:

| Class | Status | Meaning | Auto-retry? |
|---|---|---|---|
| `UpUnauthorizedError` | 401 | PAT revoked or invalid | No — surface "reconnect" |
| `UpRateLimitedError` | 429 | Rate-limited; carries parsed `Retry-After` | Yes, once (Retry-After respected, capped at 30s) |
| `UpClientError` | other 4xx | Caller-side problem | No |
| `UpWebhookLimitReachedError` | 4xx on POST `/webhooks` | At 10-webhook cap | No — surface "delete an old one" |
| `UpServerError` | 5xx | Transient | Yes, once on 1s backoff |

All extend `UpApiError`, which carries the parsed JSON:API error payload (`payload.errors[0].title / .detail / .source`).

## Category resolution (three-tier + inference + null)

`resolveCategoryBatch` and `resolveCategorySingle` in `src/lib/resolve-category.ts`
implement the same precedence:

1. **User override** (`transaction_category_overrides` row).
2. **User merchant rule** (`merchant_category_rules` for `description`).
3. **Up's category** (`relationships.category.data.id`).
4. **Inferred** (round-up, salary, transfer — see `infer-category.ts`).
5. **null** — eligible for AI fallback in the webhook path.

Before referencing Up's category ID, the resolver calls `ensureCategoryExists`
to insert a stub row if Up has shipped a new category since the last
`/categories` sync. Prevents an FK race between webhooks and category sync.

## Constants

All magic numbers live in `src/lib/up-constants.ts`. Each carries a `// docs:`
or `// product decision:` comment. If you change a doc-tagged value, verify
against context7 first.

## Out of scope (deliberate)

- `/attachments` endpoint — we surface a `has_attachment` flag from
  `relationships.attachment.data` but don't fetch the attachment itself.
- Multi-currency support — PiggyBack assumes AUD throughout.
- Up Home / mortgage / offset features — v2 product surface.

## How to audit drift

1. Pick the file you're touching.
2. For each `@see` in JSDoc, query context7:
   - `mcp__context7__query-docs` with `libraryId: "/websites/developer_up_au"`
   - Query: paste the URL fragment and ask for the schema.
3. Diff against the type in `src/lib/up-types.ts` and the call shape in
   `src/lib/up-api.ts`.
4. If drift found: fix `up-types.ts` first, then `up-api.ts`, then call sites.
   Update this doc and the JSDoc `@see` link if the Up URL changed.

This discipline is the whole reason the audit exists. Don't skip step 2.
