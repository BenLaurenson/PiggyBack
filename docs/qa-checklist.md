# QA Checklist — Phase 1 #51 Webhook & Transaction-List Hardening

This checklist documents the manual walk-through that complements the
automated regression tests for Phase 1 #51. Each item maps to one of the
five sub-tasks in the implementation brief.

## 1. Webhook Idempotency

**Goal:** Up Bank can redeliver the same `TRANSACTION_CREATED` event
(network retry, manual replay). We must not create a duplicate row.

**How it's enforced**

- DB-level constraint:
  `transactions_account_id_up_transaction_id_key UNIQUE (account_id, up_transaction_id)`
  — see `supabase/migrations/00000000000000_initial_schema.sql:979`.
- App-level upsert:
  `processTransaction()` in `src/app/api/upbank/webhook/route.ts` calls
  `.upsert({...}, { onConflict: "account_id,up_transaction_id" })`.

**Automated regression**

- `src/app/api/upbank/webhook/__tests__/webhook.test.ts`
  → `Phase1 #51-1 — Webhook idempotency`. Fires the same payload twice
  and asserts the upsert is invoked with the same conflict target both
  times.

**Manual smoke test**

1. Connect dev DB (`kbdmwkhpzrkivzjzlzzr`).
2. Capture a real Up Bank `TRANSACTION_CREATED` payload + signature
   (use the `up_api_configs.webhook_secret` for the connected user).
3. POST it to `/api/upbank/webhook` twice in succession.
4. Verify in Supabase that exactly one row exists in
   `public.transactions` for that `up_transaction_id`.

## 2. HMAC Signature Verification

**Goal:** prove that signature verification is timing-safe, accepts
legitimate leading-zero hex outputs, and rejects altered bodies.

**How it's enforced**

- `verifySignature()` (`src/app/api/upbank/webhook/route.ts:119`) does:
  1. Pre-check `/^[0-9a-f]{64}$/i` (rejects malformed hex outright).
  2. `Buffer.from(sig, 'hex')` then asserts buffer length matches the
     expected 32 bytes.
  3. Compares using `crypto.timingSafeEqual(...)` — never `===`.

**Automated regression**

- `Phase1 #51-2 — HMAC verification edge cases` in
  `webhook.test.ts`:
  - Tampered body with valid-length sig → 401.
  - Sig with leading zeros (brute-forced via secret iteration) → 200.
  - Wrong-secret sig of valid 64-hex length → 401.

**Manual smoke test**

1. Take a valid payload+signature pair.
2. Append one space to the body, replay → expect 401.
3. Submit signature with all-zero hex string (`'0' * 64`) → expect 401
   (HMAC won't match) — confirms the buffer-length path doesn't crash.

## 3. `TRANSACTION_DELETED` Soft-Delete

**Goal:** when Up Bank fires `TRANSACTION_DELETED`, retain the row for
historical budget reports but exclude it from active queries.

**How it's enforced**

- New column `transactions.deleted_at` (migration
  `20260430140709_phase1_51_webhook_hardening.sql`).
- `processTransactionDeletion()` sets `deleted_at = now()` (only on
  the first delivery — redelivered events are no-ops).
- `/api/transactions` and `/activity` queries chain
  `.is("deleted_at", null)` so soft-deleted rows are hidden.

**Automated regression**

- `webhook.test.ts → Issue 4 — TRANSACTION_DELETED handling`:
  asserts the update payload contains a parseable `deleted_at` ISO
  timestamp.
- `webhook.test.ts → Phase1 #51-3` (redelivery): asserts the second
  delivery does NOT re-write `deleted_at`.
- `transactions.test.ts → Phase1 #51-5` includes the
  `is('deleted_at', null)` assertion.

**Manual smoke test**

1. Open `/activity`, note a transaction (call it T).
2. POST a synthetic `TRANSACTION_DELETED` event for T to the webhook.
3. Refresh `/activity` — T should not appear.
4. Run a budget query for the period containing T — historical totals
   should still include T.
5. Replay the same delete event — `deleted_at` should be unchanged.

## 4. Time Zone Handling

**Goal:** Up Bank emits UTC ISO timestamps; render them consistently in
the user's preferred Australian zone. Default to AEST/AEDT, allow
override via `profiles.timezone`.

**How it's enforced**

- New column `profiles.timezone` (text, IANA TZ name).
- New helpers in `src/lib/format-date.ts`:
  - `formatDate(input, { timezone, format })`
  - `formatDateTime(input, { timezone, includeSeconds, format })`
  - `formatTime(input, { timezone, includeSeconds })`
  - `resolveTimezone()` falls back to `Australia/Melbourne`.
- Settings UI: `/settings/profile` exposes a Timezone dropdown
  (Melbourne, Sydney, Brisbane, Adelaide, Darwin, Perth, Hobart).
- `updateProfile()` server action whitelists the allowed AU zones.

**Automated regression**

- `src/lib/__tests__/format-date.test.ts` (14 tests) — covers DST
  spring-forward & autumn-back boundaries, AEDT vs AWST same-instant,
  ACDT vs AWST, Brisbane (no DST), and the AEST/AEDT default fallback.

**Manual smoke test**

1. Connect a real Up Bank account; ensure recent transactions show
   reasonable AU local times (e.g., something at 09:00 UTC should
   display as 19:00 or 20:00 depending on AEDT/AEST).
2. Switch the profile timezone to `Australia/Perth` and reload the
   transaction list — same UTC instants should now render 3 hours
   earlier.
3. Test a transaction crossing the DST boundary (e.g., 5 April 2026
   16:30 UTC) and confirm it renders as 02:30 AEDT (still daylight).

## 5. Pagination on /activity

**Goal:** stay fast on partnerships with 10k+ transactions; avoid
OFFSET pagination, ensure indexed lookups, virtualise/paginate the
DOM.

**How it's enforced**

- New composite index
  `idx_transactions_account_created (account_id, created_at DESC) WHERE deleted_at IS NULL`
  — supports cursor pagination plus the existing
  `WHERE account_id IN (...) ORDER BY created_at DESC` pattern.
- `/api/transactions` accepts a `cursor` query param (an ISO
  timestamp). When present, it uses `lt('created_at', cursor)` +
  `limit(N)` (keyset) instead of `range(offset, offset+limit-1)`.
- `ActivityClient.tsx` tracks `nextCursor` state, sends it on each
  "load more" call, and resets it when filters change.
- The DOM only ever holds the rows the user has scrolled through (25
  per page); the underlying `IntersectionObserver` triggers more
  loads on scroll.

**Automated regression**

- `transactions.test.ts → Phase1 #51-5` asserts:
  - Invalid cursor → 400.
  - Cursor present → `.lt('created_at', cursor)` + `.limit(25)` (no
    `range` for the main page query).
  - `is('deleted_at', null)` is always applied.

**Manual smoke test**

1. Populate (or use existing) dev DB partnership with 10k+
   transactions.
2. Open `/activity`. Confirm the first page renders quickly (< 1s).
3. Scroll to load 30+ pages. Each "load more" should still respond
   in roughly the same time (cursor pagination is O(log N) per page,
   not O(N) like OFFSET).
4. In Supabase SQL editor, run `EXPLAIN` on a representative query:
   ```sql
   EXPLAIN SELECT * FROM transactions
   WHERE account_id IN ('<id>') AND deleted_at IS NULL
     AND created_at < '2026-01-01T00:00:00Z'
   ORDER BY created_at DESC LIMIT 25;
   ```
   The plan should show an Index Scan on
   `idx_transactions_account_created`, not a Seq Scan.
