# Wise Business Accounting Module — Design

**Status:** Draft — pending user review
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

## 3. Architecture decision

All business data lives in tables prefixed `business_`. These tables are **never** joined into personal budget, FIRE, goals, analysis, or activity views. No `source` column on the existing `transactions` table. Strict isolation.

The link from business to personal is one direction only: `business_expense_claims.up_transaction_id` is a uuid FK referencing `transactions.id`. The personal `transactions` row is never mutated. Claimed Up transactions continue to appear unchanged in personal budget/FIRE/analysis views.

## 4. Conventions (align with existing PiggyBack)

- **Money: bigint cents.** All amount/balance columns are `bigint *_cents`, never `numeric`. Matches `transactions.amount_cents`, `accounts.balance_cents`, `goals.current_amount_cents`. All formatting helpers in the app already expect cents.
- **Timestamps:** every table has both `created_at` and `updated_at` (timestamptz, default `timezone('utc'::text, now())`).
- **Soft delete:** every table that represents a connection/account/config has `is_active boolean DEFAULT true`.
- **RLS:** every table has RLS enabled with `user_id = auth.uid()` policies — same shape as existing PiggyBack tables.
- **Webhook runtime:** any route that does crypto signature verification uses `runtime = "nodejs"`.
- **Demo mode:** all business write actions respect `demo-guard.ts` and are no-ops in demo mode.

## 5. Database schema

All tables: `user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE`. RLS policy: `user_id = auth.uid()` for SELECT/INSERT/UPDATE/DELETE.

### 5.1 `business_wise_configs`

Stores the Wise API token, profile selection, and webhook handle. One row per user.

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `user_id` | uuid | unique |
| `encrypted_token` | text | AES-256-GCM via existing `src/lib/token-encryption.ts` |
| `wise_profile_id` | text | The selected Business profile ID |
| `wise_profile_name` | text | Display label, e.g. "MyCo Pty Ltd" |
| `wise_environment` | text | `'live'` or `'sandbox'` |
| `webhook_id` | text | Subscription ID returned by Wise on register |
| `webhook_delivery_id` | text | nullable; secondary handle if needed |
| `is_active` | boolean | default true |
| `last_synced_at` | timestamptz | |
| `created_at` | timestamptz | |
| `updated_at` | timestamptz | |

Same encryption pattern as `up_api_configs`. Token decrypted on demand via `getPlaintextToken()`.

### 5.2 `business_accounts`

One row per **Wise balance** (one balance per currency in the profile).

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `user_id` | uuid | |
| `wise_balance_id` | text | Wise's balance ID, unique within profile |
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
| `wise_transaction_id` | text | unique with user_id, idempotency key |
| `occurred_at` | timestamptz | transaction timestamp |
| `date` | date | local-date convenience (Australia/Sydney) for reporting |
| `description` | text | |
| `amount_cents` | bigint | native currency; negative = debit, positive = credit |
| `currency_code` | text | matches the balance's currency |
| `exchange_rate` | numeric(18, 8) | nullable; AUD per 1 unit of `currency_code` |
| `exchange_rate_source` | text | `'wise'` \| `'spot_feed'` \| `'manual'` \| null |
| `exchange_rate_fetched_at` | timestamptz | nullable |
| `amount_aud_cents` | bigint | nullable until FX known; always populated for AUD-currency rows |
| `direction` | text | `'credit'` \| `'debit'` (derived from sign on ingest) |
| `wise_category` | text | nullable; raw Wise category if any |
| `coa_id` | uuid FK → `chart_of_accounts(id)` | nullable |
| `gst_code` | text | `G1` \| `G10` \| `G11` \| `N-T` \| `INP`, nullable |
| `gst_amount_aud_cents` | bigint | nullable; computed on COA/code assignment |
| `is_reconciled` | boolean | default false |
| `notes` | text | nullable |
| `source` | text | `'wise_api'` \| `'csv_import'` |
| `raw_payload` | jsonb | original Wise response, nullable for CSV |
| `created_at` / `updated_at` | timestamptz | |

Unique: `(user_id, wise_transaction_id)`. Indexes on `(user_id, date)`, `(user_id, coa_id)`, `(user_id, is_reconciled)`.

### 5.4 `business_expense_claims`

Personal Up Bank transactions declared as business expenses. Pointer table.

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `user_id` | uuid | |
| `up_transaction_uuid` | uuid FK → `transactions(id) ON DELETE RESTRICT` | the personal transaction |
| `amount_aud_cents` | bigint | snapshot at claim time |
| `date` | date | snapshot |
| `description` | text | snapshot |
| `coa_id` | uuid FK → `chart_of_accounts(id)` | required |
| `gst_code` | text | required (often G11) |
| `gst_amount_aud_cents` | bigint | computed |
| `reimbursement_status` | text | `'owner_absorbed'` \| `'pending'` \| `'reimbursed'` |
| `notes` | text | nullable |
| `created_at` / `updated_at` | timestamptz | |

Unique: `(user_id, up_transaction_uuid)` — a single Up transaction can only be claimed once.

**Cross-table RLS check:** on insert, server-side check that the referenced `transactions.id` belongs to a row whose `account_id` resolves to an `accounts.user_id = auth.uid()`. Enforced in the server action, not at the DB layer (DB-level cross-table RLS is awkward).

`ON DELETE RESTRICT` on the FK: if a personal transaction is being deleted (e.g. webhook TRANSACTION_DELETED) while it has an active claim, the delete fails loudly. The Up webhook handler should be extended to detect this and either soft-delete the personal row (already does this — sets `status='DELETED'`) which keeps the FK intact, or surface a warning.

### 5.5 `chart_of_accounts`

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `user_id` | uuid | |
| `code` | text | e.g. `4000`, `6100` |
| `name` | text | |
| `type` | text | `'revenue'` \| `'cogs'` \| `'expense'` \| `'asset'` \| `'liability'` \| `'equity'` |
| `default_gst_code` | text | |
| `is_system` | boolean | true for seeded; user cannot delete |
| `is_active` | boolean | default true; system rows can be deactivated, not deleted |
| `created_at` / `updated_at` | timestamptz | |

Unique: `(user_id, code)`.

### 5.6 `business_categorisation_rules`

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `user_id` | uuid | |
| `match_field` | text | `'description'` \| `'wise_category'` |
| `match_type` | text | `'contains'` \| `'exact'` \| `'starts_with'` |
| `match_value` | text | |
| `coa_id` | uuid FK → `chart_of_accounts(id)` | |
| `gst_code_override` | text | nullable |
| `priority` | int | lower = higher |
| `is_active` | boolean | default true |
| `created_at` / `updated_at` | timestamptz | |

Functionally similar to `merchant_category_rules` for personal data — kept entirely separate by design (isolation > DRY).

### 5.7 `business_periods`

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `user_id` | uuid | |
| `label` | text | e.g. `Q3 FY2026 BAS` |
| `period_type` | text | `'monthly'` \| `'quarterly'` \| `'fy'` |
| `start_date` | date | |
| `end_date` | date | |
| `is_bas_period` | boolean | |
| `created_at` / `updated_at` | timestamptz | |

User-curated only — never auto-generated. Used as a named-date-range registry surfaced in dropdowns on `/business`, `/business/pl`, `/business/bas`.

## 6. Wise integration

### 6.1 Authentication

Personal API token (same shape as Up Bank). Token generated by user in Wise Business Settings → API tokens. Stored encrypted in `business_wise_configs.encrypted_token` via the existing `src/lib/token-encryption.ts` AES-256-GCM helper. Decrypted on demand.

### 6.2 API client (`src/lib/wise-api.ts`)

Mirror the shape of `src/lib/up-api.ts`:

- `createWiseApiClient(token, environment)` returns a `WiseApiClient` with bound base URL (`https://api.wise.com` or `https://api.wise-sandbox.com`).
- `ping()` — `GET /v1/me` to validate token.
- `getProfiles()` — `GET /v2/profiles`. Returns both personal + business; the connection flow filters to business.
- `getBalances(profileId)` — `GET /v4/profiles/{profileId}/balances?types=STANDARD`. One row per currency.
- `getStatement(profileId, balanceId, params)` — `GET /v1/profiles/{profileId}/borderless-accounts/{balanceId}/statement.json` with `intervalStart`, `intervalEnd`, optional `nextCursor`.
- `getActivity(profileId, params)` — `GET /v1/profiles/{profileId}/activities` (newer endpoint, may be preferred if it supports cursor pagination cleanly).
- `registerWebhook(profileId, payload)` — `POST /v3/profiles/{profileId}/subscriptions`.
- `deleteWebhook(profileId, subscriptionId)` — `DELETE` on the same path.
- `getAllPages<T>(initialResponse, fetchPage)` — generic cursor pagination helper. **`MAX_PAGES = 500`** safety cap (vs Up's 100, because we're pulling all history). Same pattern as Up's `getAllPages`.

Exported types: `WiseProfile`, `WiseBalance`, `WiseTransaction`, `WiseStatement`, `WiseSubscription`, `WiseApiError`, `WiseApiClient`.

Endpoint URLs and exact param shapes should be re-verified against the live Wise API reference during implementation — the plan will include this as a step.

### 6.3 Webhook handler (`src/app/api/business/wise/webhook/route.ts`)

`runtime = "nodejs"`. Receives Wise webhook events; uses service-role client to bypass RLS (events arrive without a user session).

**Signature verification — different from Up:**

- Up uses HMAC-SHA256 with a per-webhook shared secret. **Do NOT copy the Up verification code.**
- Wise signs with **RSA-SHA256** (newer subscriptions: RSA-SHA512). Wise publishes a public key per environment.
- Verification: `X-Signature-SHA256` header is a base64 RSA signature over the raw request body. Verify against Wise's published public key using Node's `crypto.verify('RSA-SHA256', body, publicKey, signatureBuf)`.
- Wise's public keys (live + sandbox) are bundled into the repo or loaded from env. Document this in the connection setup README.

**Events we subscribe to** (per Wise docs — to be confirmed during implementation):

- `balances#credit` — incoming transaction
- `balances#update` — balance changed
- Optionally `transfers#state-change` for outbound transfer events.

**Payload is thin.** Like Up Bank, Wise webhook events deliver an event id + resource id, not the full transaction. The handler:

1. Verify RSA signature; reject if invalid.
2. Look up `business_wise_configs` by `webhook_id` to identify the user.
3. Decrypt the user's token and instantiate a `WiseApiClient`.
4. Fetch the canonical transaction(s) via `getStatement` or `getActivity` for the affected balance/time window.
5. Call `processWiseTransaction(client, payload)` for each new/updated transaction.
6. Revalidate paths: `/business`, `/business/transactions`, `/business/pl`, `/business/bas`.

**Idempotency:** upsert on `(user_id, wise_transaction_id)`. Duplicate webhook deliveries are no-ops.

### 6.4 Transaction processing pipeline (`processWiseTransaction`)

1. **Account lookup** — find `business_accounts` row by `(user_id, wise_balance_id)`.
2. **FX resolution** — if `currency_code = 'AUD'`, `amount_aud_cents = amount_cents` and `exchange_rate`, `exchange_rate_source`, `exchange_rate_fetched_at` are all null. Otherwise:
   - If the Wise payload provides a rate (transfers/conversions), use it (`exchange_rate_source = 'wise'`).
   - Else fetch a spot rate from a free feed (default: **Frankfurter** — `https://api.frankfurter.app`, ECB-backed, no API key). `exchange_rate_source = 'spot_feed'`.
   - If the feed call fails: store the transaction with `amount_aud_cents = NULL`, `exchange_rate = NULL`, and surface in the uncategorised UI with an "FX missing" badge for manual entry.
3. **Categorisation engine** — run `business_categorisation_rules` in `priority` order (ascending). First match sets `coa_id`, and `gst_code = rule.gst_code_override ?? coa.default_gst_code`. No rule match: `coa_id = NULL`, `gst_code = NULL`, surface as uncategorised.
4. **GST amount** — if `gst_code IN ('G1','G10','G11')`: compute in TypeScript (not in SQL — Postgres integer division truncates toward zero, which is wrong for negative debits). `gst_amount_aud_cents = Math.round(Math.abs(amount_aud_cents) / 11) * Math.sign(amount_aud_cents)`. Else 0. Wrap in a helper in `src/lib/business-gst.ts` so the rounding rule is testable.
5. **Reconciled flag** — always starts `false`.
6. **Upsert** to `business_transactions` on conflict `(user_id, wise_transaction_id)`.
7. **Balance refresh** — refetch the balance via `getBalances()` and update `business_accounts.balance_cents` for the affected balance.

### 6.5 Manual sync + CSV import (fallback paths)

- **Manual sync button** on `/business/settings/wise-connection` — runs a batch `getStatement` for each active balance, ingesting any transactions not already present. Same `processWiseTransaction` pipeline.
- **CSV import** at `/business/settings/import-csv` — accepts Wise's exported CSV. Map columns → `business_transactions` (`source = 'csv_import'`). Dedupe on `wise_transaction_id` if present in CSV, else composite `(user_id, date, description, amount_cents)`. CSV-only rows still run through the categorisation engine.

## 7. Server actions

`src/app/actions/business.ts` — new file.

- `connectWise(plaintextToken, environment)` — validates via `ping()`, then `getProfiles()`, stores encrypted token + `wise_profile_id` (auto-pick the only business profile, or surface a selector if multiple).
- `selectWiseProfile(profileId)` — sets the active business profile.
- `registerWiseWebhook()` — registers subscription against Wise, stores `webhook_id`.
- `deleteWiseWebhook()` — deletes the subscription and clears the handle.
- `disconnectWise()` — deletes webhook + clears `business_wise_configs` for this user (does not delete historical transactions).
- `runInitialSync()` — fetches all profiles → balances → all statement history (paginated), populates `business_accounts` + `business_transactions`. Reports progress via Server-Sent Events or a `business_sync_status` row (TBD during implementation; default: progress row).
- `importWiseCsv(file)` — CSV import action.
- `claimUpTransactionAsBusinessExpense(upTransactionId, coaId, gstCode, reimbursementStatus, notes?)` — server-side ownership check, then insert into `business_expense_claims`.
- `updateBusinessTransaction(id, { coa_id?, gst_code?, notes?, is_reconciled? })`.
- `bulkUpdateBusinessTransactions(ids, patch)`.
- `createCategorisationRule`, `updateCategorisationRule`, `deleteCategorisationRule`, `reorderCategorisationRules`.
- `createCoaLine`, `updateCoaLine`, `deactivateCoaLine` (no hard delete on system rows).
- `savePeriod({ label, period_type, start_date, end_date, is_bas_period })`.
- `deletePeriod(id)`.

All actions wrap with `demo-guard.ts` to no-op in demo mode.

## 8. Routes & pages

All under `src/app/(app)/business/`. The nav item is hidden until `business_wise_configs.is_active = true` OR `business_accounts` count > 0.

### 8.1 `/business` — dashboard

- **Empty state (no Wise connection yet):** real onboarding moment, not a generic "nothing here." Matches the visual treatment of existing onboarding wizards in `src/app/(onboarding)/`. Content:
  - Short explanation of what the business module does (BAS-friendly P&L, expense tracking, Wise + Up claim support).
  - Primary CTA button: "Connect Wise Business" → `/business/settings/wise-connection`.
  - Secondary link: "Import CSV instead" → `/business/settings/import-csv`.
- **Connected state:**
  - Period selector (this month / last month / this quarter / last quarter / this FY / custom / saved periods dropdown).
  - P&L summary card: Revenue | Expenses | Net Profit | GST Payable.
  - Uncategorised transactions count with CTA → `/business/transactions?filter=uncategorised`.
  - Recent transactions list (Wise + claims, visually distinguished).
  - Initial sync progress banner if a sync is in progress.

### 8.2 `/business/transactions`

- Combined view of `business_transactions` + `business_expense_claims`.
- Claims rendered with a **"Personal claim"** badge.
- Filters: source (Wise / claim / CSV), date range, direction, COA, GST code, reconciled status, balance (account), reimbursement status, "FX missing".
- Bulk actions: assign COA, assign GST code, mark reconciled.
- Inline edit: COA, GST code, notes.
- "Claim personal expense" button → modal (see §9).

### 8.3 `/business/claims`

Secondary entry point for claims, grouped by `reimbursement_status`. Same claim modal.

### 8.4 `/business/pl` — P&L report

- Revenue by COA → Gross profit → COGS → Operating expenses by COA → Net profit.
- Combines `business_transactions` debits + `business_expense_claims`.
- Period comparison toggle (this vs prior).
- Export to CSV.

### 8.5 `/business/bas` — BAS summary

Read-only, not lodgement.

- Quarter selector aligned to Australian BAS quarters (Q1 Jul–Sep, Q2 Oct–Dec, Q3 Jan–Mar, Q4 Apr–Jun).
- **1A** (GST collected) = `SUM(gst_amount_aud_cents)` from `business_transactions` WHERE `direction='credit'` AND `gst_code='G1'`.
- **1B** (GST credits) = `SUM(gst_amount_aud_cents)` from `business_transactions` (debits, `gst_code IN ('G10','G11')`) **+** `business_expense_claims` (same GST codes).
- **Net GST payable** = 1A − 1B.
- Per-row breakdown with source indicator (Wise / Claim).
- "Copy to clipboard" formatted for manual BAS entry.
- **"Save as period"** action persists current range to `business_periods` with `is_bas_period = true`.

### 8.6 `/business/settings` — settings index

`/business/settings` itself is a thin index page that links to the five sub-pages below. Mirrors the existing `/settings` page pattern (which has tile-like links to `/settings/profile`, `/settings/up-connection`, etc.). Each setting is its own route, not a tab inside one page.

- `/business/settings/wise-connection` — token input, environment toggle (sandbox/live), profile picker if multiple businesses, webhook status, manual sync button, disconnect.
- `/business/settings/import-csv` — uploader.
- `/business/settings/coa` — view system COA, add custom lines.
- `/business/settings/rules` — create/edit/delete/reorder categorisation rules.
- `/business/settings/periods` — manage saved periods.

## 9. Personal expense claims flow (Up → Business)

Claimed Up transactions are personal purchases made on behalf of the business. They appear in P&L, BAS, and `/business/transactions` alongside Wise transactions, distinguished with a **"Personal claim"** badge.

**Flow:**

1. User clicks "Claim personal expense" on `/business/transactions` or `/business/claims`.
2. Modal opens with searchable list of Up transactions (searchable by date, description, amount).
3. **Search excludes already-claimed transactions** via `LEFT JOIN business_expense_claims … WHERE bec.up_transaction_uuid IS NULL`. Already-claimed rows never appear in the picker — duplicate claims are prevented at the UI layer, not via runtime unique-constraint errors.
4. User picks a transaction.
5. User assigns a COA. `gst_code` auto-populates from `coa.default_gst_code`; override allowed.
6. User sets `reimbursement_status`:
   - `owner_absorbed` (default for sole traders) — no cash movement, just a business cost.
   - `pending` — business owes the owner, not yet repaid.
   - `reimbursed` — owner has been repaid (record only).
7. Server action `claimUpTransactionAsBusinessExpense` performs the ownership check (the Up transaction's account belongs to this user) and inserts the row.
8. Claim immediately contributes to P&L and BAS for the relevant period.

**Strict isolation rules:**

- Do NOT modify the personal `transactions` table.
- Do NOT include claimed Up transactions in personal budget / FIRE / analysis (they remain visible in personal activity unchanged — that's intentional, the user still spent that money personally).
- Link is read-only from the personal side.
- One Up transaction → at most one claim (unique constraint).
- Deleting a personal transaction with an active claim: blocked by `ON DELETE RESTRICT`. Webhook `TRANSACTION_DELETED` soft-deletes (sets `status='DELETED'`), which doesn't trigger the FK, so this is a non-issue under the current Up webhook flow.

## 10. Multi-currency reporting

- Store native `amount_cents` + `currency_code` always.
- `amount_aud_cents` always populated for AUD-currency rows; for non-AUD rows, populated via Wise-provided rate or Frankfurter spot rate at ingest. Null only if both fail — surfaced in UI for manual entry.
- All reports (P&L, BAS) operate on `amount_aud_cents`.
- Transaction list UI shows: native amount (currency code) → AUD equivalent inline.

## 11. Categorisation engine — summary

Wise/CSV ingest:

1. Iterate `business_categorisation_rules` in `priority` order (lower = higher priority).
2. First match sets `coa_id`. `gst_code = rule.gst_code_override ?? coa.default_gst_code`. Calculate `gst_amount_aud_cents`.
3. No match: `coa_id = NULL`, `gst_code = NULL`. Surfaced as uncategorised.

Claims **do not** run through the rule engine — categorisation is always explicit at claim time.

## 12. Chart of accounts seed

Inserted on first connection (per-user, `is_system = true`):

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

System rows can be deactivated but not deleted (UI prevents). Custom rows can be deleted.

## 13. Navigation

Add `Business` item to the main sidebar (`src/components/navigation/sidebar.tsx`) and bottom nav. Icon: `Briefcase` (Lucide, already in the dep tree). Position: below `Plan`.

Visibility rule: only render if the user has an active `business_wise_configs` row OR at least one `business_accounts` row OR at least one `business_transactions` row (handles the CSV-first path). Otherwise hidden from nav — but `/business` is still routable and shows the onboarding empty state for users who type the URL.

## 14. RLS policies

All `business_*` tables: `user_id = auth.uid()` for SELECT/INSERT/UPDATE/DELETE (single policy, four operations).

`business_expense_claims` additionally enforces ownership of the referenced Up transaction at the server-action layer (not DB) — checked by joining `transactions` → `accounts` and verifying `accounts.user_id = auth.uid()` before insert.

No partnership scoping anywhere — business data is strictly per-user.

## 15. Files to create/modify

**New:**

- `supabase/migrations/<next-timestamp>_business_accounting_schema.sql` — all tables, RLS, COA seed function.
- `src/lib/wise-api.ts` — Wise API client.
- `src/lib/wise-fx.ts` — Frankfurter spot-rate helper with caching.
- `src/lib/business-categorise.ts` — rule engine.
- `src/lib/business-gst.ts` — GST code → amount helpers, BAS aggregation.
- `src/app/actions/business.ts` — all server actions.
- `src/app/api/business/wise/webhook/route.ts` — webhook handler.
- `src/app/(app)/business/` — all pages (`page.tsx`, `transactions/`, `claims/`, `pl/`, `bas/`, `settings/wise-connection/`, `settings/import-csv/`, `settings/coa/`, `settings/rules/`, `settings/periods/`).
- `documentation/features/business-accounting.md` — feature doc.
- `documentation/wise-api/README.md` — API reference notes (auth, environments, signature verification, endpoints used).

**Modified:**

- `src/components/navigation/sidebar.tsx` — add `Business` nav item with visibility gate.
- `src/components/navigation/bottom-nav.tsx` — same.
- `src/lib/env.ts` — add `WISE_PUBLIC_KEY_LIVE`, `WISE_PUBLIC_KEY_SANDBOX` (or bundle keys into repo if Wise publishes them as constants).

## 16. Open questions deferred to implementation

- Confirm exact Wise endpoint paths and pagination shape against the live API reference (drift is common between LLM training data and current Wise docs).
- Pick Server-Sent Events vs a `business_sync_status` polling row for the initial sync progress indicator.
- Confirm Wise's currently-supported webhook event names (`balances#credit` vs newer naming).

## 17. Phase 2 (explicitly out of this spec)

- Receipts / attachments storage.
- Contacts / suppliers table.
- BAS lodgement integration with ATO.
- Invoicing.
- Bank-to-COA learning via LLM (parallel to existing `ai-categorize.ts` for personal).
- Accountant share / read-only multi-user.
