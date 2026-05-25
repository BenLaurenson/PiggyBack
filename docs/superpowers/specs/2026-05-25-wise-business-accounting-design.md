# Wise Business Accounting Module — Design

**Status:** Draft — pending user review (revision 2)
**Date:** 2026-05-25
**Supersedes:** `piggyback-business-accounting-spec.md` (kept at repo root for reference until merged)

## 1. Goal

Add a parallel, fully isolated business accounting module to PiggyBack. Ingest transactions from a Wise Business profile. Allow personal Up Bank transactions to be claimed as business expenses via a read-only pointer. Surface a P&L, BAS summary, and transaction list under a new `/business` section.

Same Supabase instance, same auth, completely separate schema namespace (`business_*` tables). Two apps sharing a database.

## 2. Non-goals

- BAS lodgement (read-only summary only)
- Invoicing, payroll, double-entry journal
- Connecting personal Up transactions to business reporting **except** via explicit expense claims
- Multi-user / accountant / partnership access — business data is per-user only
- Two-way sync between personal and business (claims are a one-way pointer)
- Receipts / attachments storage (Phase 2)
- Contacts / suppliers table (Phase 2)
- **Partial expense claims** — one Up transaction is either claimed in full or not at all in v1 (see §10)

## 3. Architecture decision

All business data lives in tables prefixed `business_`. These tables are **never** joined into personal budget, FIRE, goals, analysis, or activity views. No `source` column on the existing `transactions` table. Strict isolation.

**Cross-domain rules:**
- The only allowed cross-domain pointer is `business_expense_claims.up_transaction_uuid → transactions(id)`, read-only from the business side.
- Business code may not import from `src/lib/budget-*`, `src/lib/fire-*`, `src/lib/expense-*`, `src/lib/match-expense-transactions.ts`, or any personal-finance-specific helper unless that helper is first extracted to a domain-agnostic location (e.g. `src/lib/shared/` for things like money formatting).
- The link from business to personal is one direction only. The personal `transactions` row is never mutated. Claimed Up transactions continue to appear unchanged in personal budget/FIRE/analysis views.

## 4. Conventions (align with existing PiggyBack)

- **Money: bigint cents.** All amount/balance columns are `bigint *_cents`. Matches `transactions.amount_cents`, `accounts.balance_cents`. All formatting helpers in the app already expect cents.
- **Enums: CHECK constraints.** Every text column that represents a finite enum has a Postgres `CHECK` constraint enumerating the legal values. No relying on TypeScript or the UI as the only guard. Listed inline in §5.
- **Timestamps:** every table has both `created_at` and `updated_at` (timestamptz, default `timezone('utc'::text, now())`).
- **Soft delete:** every table that represents a connection/account/config has `is_active boolean DEFAULT true`.
- **RLS:** every table has RLS enabled with `user_id = auth.uid()` policies — same shape as existing PiggyBack tables.
- **Webhook runtime:** any route that does crypto signature verification uses `runtime = "nodejs"`.
- **Demo mode:** all business write actions respect `demo-guard.ts` and are no-ops in demo mode.
- **Timezone:** per-user `reporting_timezone` on `business_wise_configs`, default `Australia/Sydney`. All `*_date` columns are derived from `*_at` timestamps using this timezone, never from server local time.

## 5. Database schema

All tables: `user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE`. RLS policy: `user_id = auth.uid()` for SELECT/INSERT/UPDATE/DELETE.

### 5.1 `business_wise_configs`

Stores the Wise API token, profile selection, webhook handle, and reporting timezone. One row per user.

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `user_id` | uuid | unique |
| `encrypted_token` | text | AES-256-GCM via `src/lib/token-encryption.ts` |
| `wise_profile_id` | text | the selected Business profile ID |
| `wise_profile_name` | text | display label |
| `wise_environment` | text | CHECK in (`'live'`, `'sandbox'`) |
| `reporting_timezone` | text | IANA tz string, default `'Australia/Sydney'` |
| `webhook_id` | text | subscription ID returned by Wise on register, nullable |
| `webhook_delivery_id` | text | nullable; secondary handle if needed |
| `is_active` | boolean | default true |
| `last_synced_at` | timestamptz | |
| `created_at` / `updated_at` | timestamptz | |

### 5.2 `business_accounts`

One row per **Wise balance** (one balance per currency in the profile).

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `user_id` | uuid | |
| `wise_balance_id` | text | Wise's balance ID |
| `display_name` | text | e.g. "AUD Balance", "USD Balance" |
| `currency_code` | text | ISO 4217 |
| `balance_cents` | bigint | in native currency |
| `is_active` | boolean | default true |
| `last_synced_at` | timestamptz | |
| `created_at` / `updated_at` | timestamptz | |

Unique: `(user_id, wise_balance_id)`.

### 5.3 `business_transactions`

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `user_id` | uuid | |
| `business_account_id` | uuid FK → `business_accounts(id) ON DELETE CASCADE` | |
| `wise_transaction_id` | text | nullable (null for CSV without one); per-leg idempotency key, composed as `${reference_number}\|${direction}` by `processWiseTransaction` (see §6.4) |
| `reference_number` | text | nullable; raw Wise `referenceNumber` for audit/display. Not unique on its own (refund pairs and FX legs share it). |
| `import_fingerprint` | text | computed dedupe key for CSV rows (see §6.5); null for API rows |
| `occurred_at` | timestamptz | **canonical** transaction timestamp from Wise |
| `reporting_date` | date | derived from `occurred_at` at the user's `reporting_timezone`; the column reports run on |
| `description` | text | |
| `amount_cents` | bigint | native currency; negative = debit, positive = credit |
| `currency_code` | text | matches the balance's currency |
| `direction` | text | CHECK in (`'credit'`, `'debit'`); derived from sign on ingest |
| `exchange_rate` | numeric(18, 8) | nullable; AUD per 1 unit of `currency_code` |
| `exchange_rate_source` | text | CHECK in (`'wise'`, `'spot_feed'`, `'manual'`); nullable |
| `exchange_rate_fetched_at` | timestamptz | nullable |
| `amount_aud_cents` | bigint | nullable until FX resolved |
| `fx_status` | text | CHECK in (`'resolved'`, `'missing'`, `'manual'`); default `'resolved'` for AUD-currency rows |
| `wise_category` | text | raw Wise category if any |
| `coa_id` | uuid FK → `chart_of_accounts(id)` | nullable |
| `gst_code` | text | CHECK in (`'G1'`, `'G10'`, `'G11'`, `'N-T'`, `'INP'`); nullable |
| `gst_amount_aud_cents` | bigint | nullable; computed on COA/code assignment |
| `is_reconciled` | boolean | default false |
| `notes` | text | nullable |
| `source` | text | CHECK in (`'wise_api'`, `'csv_import'`) |
| `raw_payload` | jsonb | original Wise response, nullable for CSV |
| `created_at` / `updated_at` | timestamptz | |

**Uniqueness:**
- Unique `(user_id, wise_transaction_id)` WHERE `wise_transaction_id IS NOT NULL` — Wise API idempotency.
- Unique `(user_id, import_fingerprint)` WHERE `import_fingerprint IS NOT NULL` — CSV idempotency.

**Why `wise_transaction_id` is composite:** Wise's raw `referenceNumber` is NOT globally unique — verified empirically against the live API. Two real patterns produce repeats:

1. **Refund pairs** — a charge (DEBIT) and its refund (CREDIT) on the same balance share the `referenceNumber`.
2. **FX legs** — a single CONVERSION emits two ledger rows (debit on the source-currency balance + credit on the target-currency balance), both carrying the same `referenceNumber`.

The ingestion layer composes `wise_transaction_id = ${reference_number}|${direction}` so the unique index `(user_id, wise_transaction_id)` survives both patterns. The raw value lives in `reference_number` for UI display, audit queries, and traceability back to the Wise dashboard.

**Indexes:** see §16. The composite-key model adds `business_transactions (user_id, reference_number)` for "show all legs of this reference" queries.

### 5.4 `business_expense_claims`

Personal Up Bank transactions declared as business expenses. Pointer table with **snapshot fields** so claims remain reportable even if the personal side later evolves (soft-delete, hidden state, schema changes).

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `user_id` | uuid | |
| `up_transaction_uuid` | uuid FK → `transactions(id) ON DELETE RESTRICT` | the personal transaction |
| `description_snapshot` | text | merchant/description at claim time |
| `amount_aud_cents_snapshot` | bigint | amount at claim time (always AUD; Up is AUD-only) |
| `occurred_at_snapshot` | timestamptz | canonical timestamp at claim time |
| `reporting_date_snapshot` | date | derived in user's `reporting_timezone` at claim time |
| `up_account_id_snapshot` | text | the Up account the personal txn was on |
| `personal_transaction_status_snapshot` | text | `transactions.status` value at claim time |
| `coa_id` | uuid FK → `chart_of_accounts(id)` | required |
| `gst_code` | text | CHECK in (`'G1'`, `'G10'`, `'G11'`, `'N-T'`, `'INP'`); required (typically `G11`) |
| `gst_amount_aud_cents` | bigint | computed |
| `reimbursement_status` | text | CHECK in (`'owner_absorbed'`, `'pending'`, `'reimbursed'`) |
| `notes` | text | nullable |
| `created_at` / `updated_at` | timestamptz | |

Unique: `(user_id, up_transaction_uuid)` — at most one claim per personal transaction. Partial claims are out of scope for v1 (see §10).

**ON DELETE RESTRICT** preserves referential integrity but reporting code reads snapshot fields, not the joined personal row. The FK exists for the audit/traceability link and to prevent silent orphaning — not as the primary data source for reports.

**Cross-table ownership check** (server-action only, not DB): on insert, verify `transactions.id` → `accounts.user_id = auth.uid()` before writing.

### 5.5 `chart_of_accounts`

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `user_id` | uuid | |
| `code` | text | e.g. `4000`, `6100` |
| `name` | text | |
| `type` | text | CHECK in (`'revenue'`, `'cogs'`, `'expense'`, `'asset'`, `'liability'`, `'equity'`) |
| `default_gst_code` | text | CHECK in (`'G1'`, `'G10'`, `'G11'`, `'N-T'`, `'INP'`) |
| `is_system` | boolean | true for seeded rows |
| `seed_version` | int | nullable; identifies which seed version inserted this row, null for user-created |
| `is_active` | boolean | default true; system rows can be deactivated, not deleted |
| `created_at` / `updated_at` | timestamptz | |

Unique: `(user_id, code)`.

**Seed policy** (see §13): system rows are inserted by a versioned seed function. `code` and `type` are immutable for system rows (enforced in server actions, not DB — UI prevents editing). `name` and `default_gst_code` of a system row may only be updated by a seed-migration function, never by user-facing actions. User-created rows are fully editable and deletable.

### 5.6 `business_categorisation_rules`

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `user_id` | uuid | |
| `match_field` | text | CHECK in (`'description'`, `'wise_category'`) |
| `match_type` | text | CHECK in (`'contains'`, `'exact'`, `'starts_with'`) |
| `match_value` | text | |
| `coa_id` | uuid FK → `chart_of_accounts(id)` | |
| `gst_code_override` | text | CHECK in (`'G1'`, `'G10'`, `'G11'`, `'N-T'`, `'INP'`); nullable |
| `priority` | int | lower = higher |
| `is_active` | boolean | default true |
| `created_at` / `updated_at` | timestamptz | |

### 5.7 `business_periods`

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `user_id` | uuid | |
| `label` | text | e.g. `Q3 FY2026 BAS` |
| `period_type` | text | CHECK in (`'monthly'`, `'quarterly'`, `'fy'`, `'custom'`) |
| `start_date` | date | |
| `end_date` | date | |
| `is_bas_period` | boolean | |
| `created_at` / `updated_at` | timestamptz | |

User-curated only — never auto-generated.

### 5.8 `business_sync_jobs`

Persisted sync-state for long-running historical imports and manual sync runs. UI polls this row instead of relying on SSE — simpler, retry-safe.

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `user_id` | uuid | |
| `kind` | text | CHECK in (`'initial'`, `'manual'`, `'webhook_replay'`, `'csv_import'`) |
| `status` | text | CHECK in (`'queued'`, `'running'`, `'completed'`, `'failed'`, `'cancelled'`) |
| `stage` | text | free-text, human-readable current stage |
| `processed_count` | int | default 0 |
| `total_estimate` | int | nullable; best-effort denominator for progress |
| `error_message` | text | nullable |
| `started_at` / `finished_at` | timestamptz | nullable |
| `created_at` / `updated_at` | timestamptz | |

Index `(user_id, status, created_at DESC)` to surface the latest active job.

### 5.9 `business_webhook_events`

Audit log for incoming Wise webhook deliveries. Helps with idempotency reasoning, debugging out-of-order delivery, and replay.

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `user_id` | uuid | nullable until we resolve the user from `webhook_id` |
| `wise_subscription_id` | text | from payload |
| `wise_event_id` | text | from payload |
| `event_name` | text | e.g. `balances#credit` |
| `signature_valid` | boolean | |
| `delivery_id` | text | Wise's delivery identifier if present |
| `payload` | jsonb | full raw body |
| `processed_at` | timestamptz | nullable until handler completes |
| `outcome` | text | CHECK in (`'pending'`, `'processed'`, `'duplicate'`, `'invalid_signature'`, `'error'`); nullable |
| `error_message` | text | nullable |
| `created_at` | timestamptz | |

Unique `(wise_subscription_id, wise_event_id)` — gives free idempotency on Wise's duplicate deliveries.

**RLS interaction with service-role writes:** the webhook handler runs without a user session and inserts the event row before `user_id` is resolved (step 2 of §6.3). The initial INSERT uses the service-role client (bypasses RLS). The subsequent UPDATE that populates `user_id` also uses the service-role client. End-user reads of this table go through the standard RLS policy `user_id = auth.uid()`, which correctly hides rows still in `user_id IS NULL` state from any end user — those rows are only visible via service-role/admin paths, which is the desired shape.

## 6. Wise integration

### 6.1 Authentication

Personal API token. Stored encrypted in `business_wise_configs.encrypted_token` via the existing `src/lib/token-encryption.ts` AES-256-GCM helper. Decrypted on demand.

### 6.2 API client (`src/lib/wise-api.ts`)

Mirror the shape of `src/lib/up-api.ts`:

- `createWiseApiClient(token, environment)` — base URL = `https://api.wise.com` or `https://api.wise-sandbox.com`.
- `ping()`, `getProfiles()`, `getBalances(profileId)`, `getStatementPage(...)`, `registerWebhook(profileId, payload)`, `deleteWebhook(profileId, subscriptionId)`.

**Statement endpoint path** (verified live, supersedes any prior reference in this spec): `GET /v1/profiles/{profileId}/balance-statements/{balanceId}/statement.json?currency=...&intervalStart=...&intervalEnd=...&type=FLAT`. The `borderless-accounts/{balanceId}/...` variant in earlier Wise docs returns 404 against the current live API. Activity endpoint (`/v1/profiles/{profileId}/activities`) returns display-formatted amount strings, not structured `{value, currency}` — unsuitable for ledger ingest, so we use statement.

**Pagination:** Wise's statement endpoint does NOT return `nextCursor`. The sync worker iterates by date-window chunking (max 469 days per call per Wise's documented limit). `MAX_PAGES = 500` is retained as a defensive cap for any future cursor path; on the statement path it is unused.
- `getAllPages<T>(initialResponse, fetchPage)` — cursor pagination via Wise's `nextCursor`. **`MAX_PAGES = 500`**.

Exact endpoint paths and param shapes verified during implementation against the live Wise API reference — captured as a step in the plan.

### 6.3 Webhook handler (`src/app/api/business/wise/webhook/route.ts`)

`runtime = "nodejs"`. Treats webhooks as **hints, not truth** — every event triggers an authoritative refetch from the Wise API.

**Pipeline:**

1. Read raw body and headers.
2. **Persist immediately** into `business_webhook_events` with `outcome = 'pending'`, `signature_valid = false` initially. This guarantees we have a record even if downstream processing crashes.
3. **Verify RSA signature** — `X-Signature-SHA256` is base64 RSA signature over the raw body. Verify against Wise's published public key (live or sandbox depending on the matched config). On success: update `signature_valid = true`, leave `outcome = 'pending'`, continue. On failure: update `signature_valid = false`, **set `outcome = 'invalid_signature'`**, return 200 (avoid Wise retrying garbage) and exit. The `outcome` column must never remain `'pending'` after the handler returns — that ambiguity defeats the audit table.
4. **Idempotency** — if `(wise_subscription_id, wise_event_id)` already exists with `outcome = 'processed'`, mark this delivery `'duplicate'` and return 200.
5. **Resolve user** — look up `business_wise_configs` by `webhook_id`. Update the event row with `user_id`.
6. **Refetch canonical state** — decrypt token, instantiate `WiseApiClient`, fetch the affected statement/balance window. Never trust amounts or IDs from the webhook payload as the source of truth.
7. **Process** — call `processWiseTransaction(client, txn)` for each transaction in the refetched window. Upsert on `(user_id, wise_transaction_id)`.
8. **Refresh balance** — refetch and update the affected `business_accounts.balance_cents`.
9. **Revalidate paths** — `/business`, `/business/transactions`, `/business/pl`, `/business/bas`.
10. **Mark processed** — update the event row `outcome = 'processed'`, `processed_at = now()`.

**Out-of-order tolerance:** because step 6 always refetches and step 7 upserts, late or duplicate deliveries converge to the same state.

**Signature scheme is RSA-SHA256, not HMAC.** Do not copy code from `src/app/api/upbank/webhook/route.ts` for verification — that uses HMAC with a shared secret, which is wrong for Wise.

### 6.4 Transaction processing pipeline (`processWiseTransaction`)

1. **Account lookup** — find `business_accounts` row by `(user_id, wise_balance_id)`.
2. **Date derivation** — `occurred_at` from Wise; `reporting_date = (occurred_at AT TIME ZONE config.reporting_timezone)::date`.
3. **FX resolution:**
   - If `currency_code = 'AUD'`: `amount_aud_cents = amount_cents`, `exchange_rate = NULL`, `exchange_rate_source = NULL`, `exchange_rate_fetched_at = NULL`, `fx_status = 'resolved'`.
   - Else if Wise payload provides a rate: use it. `exchange_rate_source = 'wise'`, `fx_status = 'resolved'`.
   - Else fetch from Frankfurter (`https://api.frankfurter.app`). `exchange_rate_source = 'spot_feed'`, `fx_status = 'resolved'`.
   - If the feed call fails: `amount_aud_cents = NULL`, `exchange_rate = NULL`, `fx_status = 'missing'`. Surfaced in UI for manual entry.
4. **Categorisation engine** — iterate `business_categorisation_rules` in `priority` ASC. First match sets `coa_id`; `gst_code = rule.gst_code_override ?? coa.default_gst_code`. No match: `coa_id = NULL`, `gst_code = NULL`.
5. **GST amount** — computed in TypeScript via `src/lib/business-gst.ts` (Postgres integer division truncates toward zero, wrong for negative debits). For codes in `('G1','G10','G11')`: `gst_amount_aud_cents = sign(amount_aud_cents) * Math.round(Math.abs(amount_aud_cents) / 11)`. Otherwise 0. Null if `amount_aud_cents` is null.
6. **Upsert** to `business_transactions` on conflict `(user_id, wise_transaction_id)`.

### 6.5 Manual sync + CSV import (fallback paths)

- **Manual sync button** — creates a `business_sync_jobs` row with `kind = 'manual'`; same processing pipeline.
- **CSV import** at `/business/settings/import-csv` — accepts Wise's exported CSV. Map columns → `business_transactions` (`source = 'csv_import'`).

**Source/kind correctness:** the processing pipeline propagates `source` from the job context. A job with `kind = 'csv_import'` writes rows with `source = 'csv_import'`; jobs with `kind ∈ ('initial', 'manual', 'webhook_replay')` write `source = 'wise_api'`. The pipeline takes `source` as an explicit input parameter rather than inferring it — caller responsibility, enforced by tests.

**Shared processing function.** `processWiseTransaction(client, txn, { source, businessAccountId, configId })` is the single ingestion entry point. Both the manual-sync worker (Phase 1A) and the webhook handler (Phase 1B) call it. Balance refresh (step 8 of §6.3) lives in this function and runs for the manual-sync path too — not just webhooks. No code duplication between paths.

**CSV idempotency via `import_fingerprint`** — computed at import time as a normalised composite:

```
import_fingerprint = sha1(
  normalize(date) + '|' +
  normalize_description(description) + '|' +  // collapse whitespace, lowercase
  amount_cents.toString() + '|' +
  currency_code + '|' +
  (reference ?? '') + '|' +
  (balance_name ?? '')
)
```

Stored on the row, with a partial unique index. Re-imports of the same CSV are no-ops. If a CSV row also includes Wise's transaction ID, use that as the primary idempotency key and set `import_fingerprint = NULL`.

## 7. Reporting library boundary

All BAS/P&L/GST math lives in dedicated library files. Page components and route handlers consume pre-aggregated typed report objects — **never** assemble tax logic inline.

**Files:**

- `src/lib/business-gst.ts` — `computeGstAmountCents(amountAudCents, gstCode)`; `isGstApplicable(gstCode)`; rounding helpers; unit-tested.
- `src/lib/business-pl.ts` — `buildPlReport(userId, { startDate, endDate, timezone })`: returns a typed object with revenue / COGS / gross profit / operating expenses / net profit, each broken down by COA and by **source** (`'wise'` | `'claim'` | `'csv'`). Includes a top-level `missingFxCount: number` field for rows excluded due to `fx_status = 'missing'`. Page components never compute this themselves.
- `src/lib/business-bas.ts` — `buildBasReport(userId, { startDate, endDate, timezone })`: returns `{ line1A, line1B, netGstPayable, contributingTransactions: [{ source, ... }], missingFxCount: number, hasSpotFeedRates: boolean }`. Source-tagged so the UI can show which line came from Wise vs personal claim. `hasSpotFeedRates` lets the page render the spot-feed provenance banner without re-querying.

**Reporting contract** — every aggregate exposes a `bySource` breakdown alongside the unified total. The default UI shows totals, but the user can split by source on demand. Wise transactions vs owner-funded claims must never be silently combined without an opt-in.

## 8. Server actions

`src/app/actions/business.ts`:

- `connectWise(plaintextToken, environment)` — validates via `ping()`, calls `getProfiles()`, stores encrypted token + `wise_profile_id`. Auto-picks the only business profile or surfaces a selector if multiple.
- `selectWiseProfile(profileId)`.
- `registerWiseWebhook()`, `deleteWiseWebhook()`, `disconnectWise()` (clears config; does not delete historical data).
- `enqueueInitialSync()` — inserts a `business_sync_jobs` row, kicks off the worker.
- `runManualSync()` — same shape, `kind = 'manual'`.
- `importWiseCsv(file)` — `kind = 'csv_import'`.
- `claimUpTransactionAsBusinessExpense(upTransactionId, coaId, gstCode, reimbursementStatus, notes?)` — server-side ownership check (`transactions.id → accounts.user_id = auth.uid()`), reads the live values from `transactions` to populate snapshot fields, inserts the claim. Rejects if a claim already exists for this `up_transaction_uuid`. Both `coaId` and `gstCode` are required arguments — the modal UI must enforce selection before submit (no DB DEFAULTs on these columns; the CHECK constraint is a backstop, not the UX guard).
- `updateBusinessTransaction(id, patch)`, `bulkUpdateBusinessTransactions(ids, patch)`.
- `setBusinessTransactionFxManual(id, rateAudPerUnit)` — sets `exchange_rate`, recomputes `amount_aud_cents`, sets `exchange_rate_source = 'manual'`, `fx_status = 'manual'`.
- `createCategorisationRule`, `updateCategorisationRule`, `deleteCategorisationRule`, `reorderCategorisationRules`.
- `createCoaLine`, `updateCoaLine`, `deactivateCoaLine`, `deleteCoaLine` (only if `is_system = false`).
- `savePeriod`, `deletePeriod`.

All actions wrap with `demo-guard.ts`.

## 9. Routes & pages

All under `src/app/(app)/business/`. The nav item is hidden until the user has an active `business_wise_configs` row OR at least one `business_accounts` row OR at least one `business_transactions` row.

### 9.1 `/business` — dashboard

- **Empty state** (no Wise connection, no business data): full onboarding moment, not a generic empty screen. Matches the visual treatment of existing onboarding wizards in `src/app/(onboarding)/`.
  - Short explanation of the business module (BAS-friendly P&L, expense tracking, Wise + Up claim support).
  - Primary CTA: "Connect Wise Business" → `/business/settings/wise-connection`.
  - Secondary link: "Import CSV instead" → `/business/settings/import-csv`.
- **Connected state:**
  - Period selector (this month / last month / this quarter / last quarter / this FY / custom / saved periods dropdown).
  - P&L summary card from `buildPlReport`: Revenue | Expenses | Net Profit | GST Payable. Toggle to split by source.
  - Uncategorised transaction count with CTA → `/business/transactions?filter=uncategorised`.
  - FX-missing count CTA if any.
  - Recent transactions list (Wise + claims, visually distinguished).
  - Active sync banner driven by latest `business_sync_jobs` row.

### 9.2 `/business/transactions`

- Combined view of `business_transactions` + `business_expense_claims`.
- Claims rendered with a **"Personal claim"** badge.
- Filters: source (Wise / claim / CSV), date range, direction, COA, GST code, reconciled status, balance, reimbursement status, **fx_status**, currency.
- Bulk actions: assign COA, assign GST code, mark reconciled.
- Inline edit: COA, GST code, notes; manual FX entry button when `fx_status != 'resolved'`.
- "Claim personal expense" button → modal (see §10).

### 9.3 `/business/claims`

Secondary entry point for claims, grouped by `reimbursement_status`.

### 9.4 `/business/pl`

- Renders `buildPlReport` output.
- Toggle: combined view vs source-split view (Wise + CSV + Claims).
- Period comparison toggle (this vs prior).
- Export to CSV.

### 9.5 `/business/bas`

- Quarter selector aligned to Australian BAS quarters (Q1 Jul–Sep, Q2 Oct–Dec, Q3 Jan–Mar, Q4 Apr–Jun).
- Renders `buildBasReport` output: 1A, 1B, net GST payable.
- Per-row breakdown showing the **source** (Wise / Claim / CSV) of each contributing transaction.
- **Spot-feed provenance warning** — if `report.hasSpotFeedRates`, surface a clear banner noting that BAS values incorporate non-authoritative FX rates that may differ from the rate used by your tax agent. Recommend manual FX entry for material transactions. **The warning does not block "Copy to clipboard"** — it accompanies it. Blocking creates friction without preventing the underlying problem; the user decides.
- "Copy to clipboard" formatted for manual BAS entry.
- "Save as period" — persists current range to `business_periods` with `is_bas_period = true`.

### 9.6 `/business/settings` — settings index

Thin index page linking to:

- `/business/settings/wise-connection` — token input, environment toggle, profile picker, reporting timezone, webhook status, manual sync, disconnect.
- `/business/settings/import-csv` — uploader.
- `/business/settings/coa` — view system COA, add custom lines.
- `/business/settings/rules` — categorisation rules.
- `/business/settings/periods` — saved periods.

## 10. Personal expense claims flow (Up → Business)

**Policy: full claims only in v1.** One Up transaction is either claimed in full or not at all. Partial claims (claiming $40 of an $85 transaction as business) are explicitly out of scope. The modal copy must state this clearly so users with mixed-use purchases know to split at point-of-sale or absorb the mismatch.

**Flow:**

1. User clicks "Claim personal expense" on `/business/transactions` or `/business/claims`.
2. Modal opens with searchable list of Up transactions (by date, description, amount).
3. **Excludes already-claimed transactions** via `LEFT JOIN business_expense_claims … WHERE bec.up_transaction_uuid IS NULL`. Already-claimed rows never appear.
4. User picks a transaction.
5. User assigns a COA. `gst_code` auto-populates from `coa.default_gst_code`; override allowed.
6. User sets `reimbursement_status`: `owner_absorbed` (default for sole traders) | `pending` | `reimbursed`.
7. Server action `claimUpTransactionAsBusinessExpense`:
   - Validates ownership.
   - Snapshots `description`, `amount_aud_cents`, `occurred_at`, `reporting_date`, `up_account_id`, `status` from the personal transaction.
   - Computes `gst_amount_aud_cents`.
   - Inserts the claim.
8. Claim immediately contributes to P&L and BAS for the relevant period via the snapshot fields.

**Snapshot rationale** — claims read from snapshot fields, not from the joined personal row. This means a personal transaction being soft-deleted, hidden, recategorised, or restructured later does not change the historical claim. The FK + `ON DELETE RESTRICT` exists for audit/traceability, not as the data path for reports.

**Strict isolation:**
- Personal `transactions` table is never mutated.
- Claimed Up transactions remain visible in personal activity unchanged — that's intentional, the user still spent that money personally.
- Link is read-only from the personal side.

## 11. Multi-currency reporting

- Store native `amount_cents` + `currency_code` always.
- `amount_aud_cents` populated when `fx_status = 'resolved'` or `'manual'`. Null when `fx_status = 'missing'`.
- All reports operate on `amount_aud_cents`. Missing-FX rows are excluded from totals **and surfaced as a separate count** so the user knows reports are incomplete.
- Transaction list UI shows native amount (currency) → AUD inline; spot-feed-sourced rates carry a small badge so provenance is visible.

## 12. Categorisation engine

Wise/CSV ingest only:

1. Iterate `business_categorisation_rules` WHERE `is_active = true` ORDER BY `priority` ASC.
2. First match sets `coa_id`. `gst_code = rule.gst_code_override ?? coa.default_gst_code`.
3. Compute `gst_amount_aud_cents` via `business-gst.ts`.
4. No match: `coa_id = NULL`, `gst_code = NULL`, surfaced as uncategorised.

Claims do **not** run through the rule engine — categorisation is always explicit at claim time.

## 13. Chart of accounts seed + versioning

**Seed function** — `seed_business_coa(user_id, target_version)` is a Postgres function (or TypeScript helper called from server action). Inserts/updates the rows below for the target user.

**Versioning model:**

- Each seed row has a `seed_version` int.
- On first connection, the latest version is applied. New users always get the newest seed set.
- For existing users when a new version ships, a migration step calls `seed_business_coa(user_id, latest)`. The seed function:
  - **Inserts** any rows whose `(user_id, code)` doesn't exist, marked `is_system = true`.
  - **Never updates** existing rows' `name`, `type`, or `default_gst_code` — preserves user customisations and avoids surprising live BAS reports.
  - **Never deletes** rows.
- Deprecated system rows are deactivated via a separate one-off migration only when there's a strong reason — never silently.

**Initial seed (seed_version = 1):**

| Code | Name | Type | Default GST |
|---|---|---|---|
| 4000 | Revenue | revenue | G1 |
| 4100 | Consulting Income | revenue | G1 |
| 4200 | Product Sales | revenue | G1 |
| 4900 | Other Income | revenue | G1 |
| 5000 | Direct Costs | cogs | G11 |
| 6000 | Advertising & Marketing | expense | G11 |
| 6100 | Software & Subscriptions | expense | G11 |
| 6200 | Professional Services | expense | G11 |
| 6300 | Bank & Transaction Fees | expense | N-T |
| 6400 | Travel & Transport | expense | G11 |
| 6500 | Office & Equipment | expense | G11 |
| 6600 | Insurance | expense | G11 |
| 6700 | Wages & Contractors | expense | N-T |
| 6800 | Rent & Facilities | expense | G11 |
| 6900 | Other Expenses | expense | G11 |
| 8000 | Owner's Draw | equity | N-T |
| 8100 | Tax Payments | equity | N-T |

## 14. Navigation

Add `Business` item to `src/components/navigation/sidebar.tsx` and `bottom-nav.tsx`. Icon: `Briefcase` (Lucide). Position: below `Plan`.

Visibility: render only if there's an active `business_wise_configs` row OR ≥1 `business_accounts` OR ≥1 `business_transactions`. Otherwise hidden — but `/business` is still routable and renders the onboarding empty state.

## 15. RLS policies

All `business_*` tables: `user_id = auth.uid()` for SELECT/INSERT/UPDATE/DELETE (one policy, four operations).

`business_expense_claims` additionally enforces ownership of the referenced Up transaction at the server-action layer.

No partnership scoping.

## 16. Indexes

Create explicitly in the migration (don't wait for query performance to discover them):

- `business_transactions (user_id, reporting_date DESC)`
- `business_transactions (user_id, source, reporting_date DESC)`
- `business_transactions (user_id, gst_code, reporting_date)` WHERE `gst_code IS NOT NULL`
- `business_transactions (user_id, currency_code, reporting_date)`
- `business_transactions (user_id, fx_status) WHERE fx_status != 'resolved'`
- `business_transactions (user_id, coa_id) WHERE coa_id IS NULL` — uncategorised hot path
- `business_transactions (user_id, reference_number) WHERE reference_number IS NOT NULL` — "show all legs of this Wise reference" queries
- `business_expense_claims (user_id, reporting_date_snapshot DESC)`
- `business_expense_claims (user_id, reimbursement_status, reporting_date_snapshot DESC)`
- `business_categorisation_rules (user_id, is_active, priority)`
- `chart_of_accounts (user_id, type, is_active)`
- `business_sync_jobs (user_id, status, created_at DESC)`
- `business_webhook_events (wise_subscription_id, wise_event_id)` — unique
- `business_webhook_events (user_id, created_at DESC)` — debugging hot path

## 17. Views and materialisation

**Not in v1.** Start with straightforward typed query functions in `business-pl.ts` / `business-bas.ts` running against the indexes above. If a real performance issue emerges, introduce a SQL view or materialised view deliberately — don't pre-optimise.

## 18. Files to create/modify

**New:**

- `supabase/migrations/<next-timestamp>_business_accounting_schema.sql` — tables, constraints, indexes, RLS, COA seed function.
- `src/lib/wise-api.ts`, `src/lib/wise-fx.ts`, `src/lib/business-categorise.ts`, `src/lib/business-gst.ts`, `src/lib/business-pl.ts`, `src/lib/business-bas.ts`.
- `src/app/actions/business.ts`.
- `src/app/api/business/wise/webhook/route.ts`.
- `src/app/(app)/business/` (all pages and sub-routes).
- `documentation/features/business-accounting.md`.
- `documentation/wise-api/README.md`.

**Modified:**

- `src/components/navigation/sidebar.tsx`, `bottom-nav.tsx` — add Business nav.
- `src/lib/env.ts` — `WISE_PUBLIC_KEY_LIVE`, `WISE_PUBLIC_KEY_SANDBOX`.

## 19. Implementation order (phasing)

This spec is one cohesive module but ships in two phases to let the data model prove itself before edge cases pile on.

**Phase 1A — minimum viable business module:**

1. Schema migration (all tables, constraints, indexes, RLS).
2. COA seed function + initial seed_version = 1.
3. Wise API client (`wise-api.ts`).
4. `/business/settings/wise-connection` — token entry, profile pick, manual sync.
5. Initial sync via `business_sync_jobs` polling.
6. `/business/transactions` — list, filter, inline edit, categorisation, manual FX.
7. Categorisation rules + `/business/settings/rules`.
8. Personal expense claim flow + `/business/claims`.
9. `business-pl.ts` + `/business/pl` — basic P&L report.
10. `/business` dashboard (empty state + connected state).
11. Sidebar/bottom-nav integration.

**Phase 1B — BAS, CSV, automation:**

12. `business-bas.ts` + `/business/bas` — BAS summary, period saving.
13. CSV import + `import_fingerprint` dedupe.
14. Bulk actions on transaction list.
15. Wise webhook automation — RSA verification, `business_webhook_events`, refetch-on-event pipeline.
16. Spot-feed FX integration (Frankfurter) + `fx_status = 'missing'` recovery UI.

Phase 1A delivers a useful module without webhooks (manual sync covers the gap). Phase 1B adds automation and BAS once the ingestion model is proven.

## 20. Open questions deferred to implementation

- **Verify Wise endpoint paths and cursor-pagination shape against the live API reference** before writing `wise-api.ts`. Wise's statement/activity endpoints have changed over time and LLM training data is unreliable here. The plan must include a "fetch live Wise API reference" step before any client code.
- Confirm Wise webhook event names — `balances#credit` vs newer naming.
- Confirm Wise's published public-key delivery format (env vars vs pinned constants).

**Resolved during spec review:**
- Spot-feed warning on `/business/bas` is informational, **does not** block "Copy to clipboard" (see §9.5).

## 21. Phase 2 (explicitly out of scope here)

- Receipts / attachments storage.
- Contacts / suppliers table.
- BAS lodgement integration with ATO.
- Invoicing.
- LLM categorisation parallel to `ai-categorize.ts`.
- Accountant share / read-only multi-user.
- Partial expense claims.
