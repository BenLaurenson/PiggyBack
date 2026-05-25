# Wise Business Accounting — Phase 1A Foundation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Land the schema, RLS, COA seed, and the pure-logic libraries (`business-gst`, `wise-fx`, `business-categorise`, `wise-api`, `processWiseTransaction`) needed to ingest Wise Business transactions. No UI in this plan — that lands in Plan 1A.2.

**Architecture:** All business data lives in `business_*` tables, isolated from personal finance tables. Money is `bigint *_cents`. CHECK constraints on every enum-shaped text column. RLS via `user_id = auth.uid()`. Ingestion logic is a single shared function `processWiseTransaction` that both the future webhook handler and the manual-sync worker will call.

**Tech Stack:** Next.js 16 / Supabase (Postgres 15) / TypeScript / Vitest. Migrations via the Supabase CLI. Wise API via `fetch` (no SDK). FX fallback via Frankfurter (free, ECB-backed).

**Source spec:** [docs/superpowers/specs/2026-05-25-wise-business-accounting-design.md](../specs/2026-05-25-wise-business-accounting-design.md).

**Follow-on plans (not in this one):**
- Plan 1A.2 — Connection page + manual sync worker + transactions list UI.
- Plan 1A.3 — Claim flow + claims page + P&L library + P&L page + dashboard + nav.
- Plan 1B — BAS, CSV import, Wise webhook automation.

---

## File structure (what this plan creates/modifies)

**New:**
- `supabase/migrations/20260525000000_business_accounting_schema.sql` — all `business_*` tables, constraints, indexes, RLS, COA seed function.
- `src/lib/business-gst.ts` — GST calculation helpers.
- `src/lib/__tests__/business-gst.test.ts`
- `src/lib/wise-fx.ts` — Frankfurter spot-rate helper.
- `src/lib/__tests__/wise-fx.test.ts`
- `src/lib/business-categorise.ts` — rule engine.
- `src/lib/__tests__/business-categorise.test.ts`
- `src/lib/wise-api.ts` — Wise API client (Phase 1A endpoints only).
- `src/lib/__tests__/wise-api.test.ts`
- `src/lib/business-ingest.ts` — `processWiseTransaction`, the shared ingestion entry point.
- `src/lib/__tests__/business-ingest.test.ts`
- `documentation/wise-api/README.md` — Wise API reference notes (token, environments, endpoints used, RSA verification deferred to 1B).

**Modified:**
- `src/lib/env.ts` — add optional `WISE_PUBLIC_KEY_LIVE` and `WISE_PUBLIC_KEY_SANDBOX` env vars (used in 1B; declared now for completeness).

---

## Task 1: Schema migration

**Files:**
- Create: `supabase/migrations/20260525000000_business_accounting_schema.sql`

This is one cohesive SQL artefact. Sub-steps split the file by section for readability; you write it as one file in step 1.

- [ ] **Step 1.1: Write the migration file**

Create `supabase/migrations/20260525000000_business_accounting_schema.sql` with the following exact contents:

```sql
-- PiggyBack: Business Accounting (Wise) — Phase 1A schema
-- See docs/superpowers/specs/2026-05-25-wise-business-accounting-design.md

-- ============================================================================
-- 1. TABLES
-- ============================================================================

-- ---- business_wise_configs ----
CREATE TABLE public.business_wise_configs (
  id uuid NOT NULL DEFAULT uuid_generate_v4(),
  user_id uuid NOT NULL,
  encrypted_token text NOT NULL,
  wise_profile_id text NOT NULL,
  wise_profile_name text,
  wise_environment text NOT NULL,
  reporting_timezone text NOT NULL DEFAULT 'Australia/Sydney',
  webhook_id text,
  webhook_delivery_id text,
  is_active boolean NOT NULL DEFAULT true,
  last_synced_at timestamp with time zone,
  created_at timestamp with time zone NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at timestamp with time zone NOT NULL DEFAULT timezone('utc'::text, now()),
  CONSTRAINT business_wise_configs_environment_check
    CHECK (wise_environment IN ('live', 'sandbox'))
);

-- ---- business_accounts (one row per Wise balance) ----
CREATE TABLE public.business_accounts (
  id uuid NOT NULL DEFAULT uuid_generate_v4(),
  user_id uuid NOT NULL,
  wise_balance_id text NOT NULL,
  display_name text NOT NULL,
  currency_code text NOT NULL,
  balance_cents bigint NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  last_synced_at timestamp with time zone,
  created_at timestamp with time zone NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at timestamp with time zone NOT NULL DEFAULT timezone('utc'::text, now())
);

-- ---- chart_of_accounts ----
CREATE TABLE public.chart_of_accounts (
  id uuid NOT NULL DEFAULT uuid_generate_v4(),
  user_id uuid NOT NULL,
  code text NOT NULL,
  name text NOT NULL,
  type text NOT NULL,
  default_gst_code text NOT NULL,
  is_system boolean NOT NULL DEFAULT false,
  seed_version integer,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamp with time zone NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at timestamp with time zone NOT NULL DEFAULT timezone('utc'::text, now()),
  CONSTRAINT chart_of_accounts_type_check
    CHECK (type IN ('revenue', 'cogs', 'expense', 'asset', 'liability', 'equity')),
  CONSTRAINT chart_of_accounts_default_gst_check
    CHECK (default_gst_code IN ('G1', 'G10', 'G11', 'N-T', 'INP'))
);

-- ---- business_transactions ----
CREATE TABLE public.business_transactions (
  id uuid NOT NULL DEFAULT uuid_generate_v4(),
  user_id uuid NOT NULL,
  business_account_id uuid NOT NULL,
  wise_transaction_id text,
  import_fingerprint text,
  occurred_at timestamp with time zone NOT NULL,
  reporting_date date NOT NULL,
  description text NOT NULL,
  amount_cents bigint NOT NULL,
  currency_code text NOT NULL,
  direction text NOT NULL,
  exchange_rate numeric(18, 8),
  exchange_rate_source text,
  exchange_rate_fetched_at timestamp with time zone,
  amount_aud_cents bigint,
  fx_status text NOT NULL DEFAULT 'resolved',
  wise_category text,
  coa_id uuid,
  gst_code text,
  gst_amount_aud_cents bigint,
  is_reconciled boolean NOT NULL DEFAULT false,
  notes text,
  source text NOT NULL,
  raw_payload jsonb,
  created_at timestamp with time zone NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at timestamp with time zone NOT NULL DEFAULT timezone('utc'::text, now()),
  CONSTRAINT business_transactions_direction_check
    CHECK (direction IN ('credit', 'debit')),
  CONSTRAINT business_transactions_exchange_rate_source_check
    CHECK (exchange_rate_source IS NULL OR exchange_rate_source IN ('wise', 'spot_feed', 'manual')),
  CONSTRAINT business_transactions_fx_status_check
    CHECK (fx_status IN ('resolved', 'missing', 'manual')),
  CONSTRAINT business_transactions_gst_code_check
    CHECK (gst_code IS NULL OR gst_code IN ('G1', 'G10', 'G11', 'N-T', 'INP')),
  CONSTRAINT business_transactions_source_check
    CHECK (source IN ('wise_api', 'csv_import'))
);

-- ---- business_expense_claims (Up → Business pointer with snapshots) ----
CREATE TABLE public.business_expense_claims (
  id uuid NOT NULL DEFAULT uuid_generate_v4(),
  user_id uuid NOT NULL,
  up_transaction_uuid uuid NOT NULL,
  description_snapshot text NOT NULL,
  amount_aud_cents_snapshot bigint NOT NULL,
  occurred_at_snapshot timestamp with time zone NOT NULL,
  reporting_date_snapshot date NOT NULL,
  up_account_id_snapshot text NOT NULL,
  personal_transaction_status_snapshot text NOT NULL,
  coa_id uuid NOT NULL,
  gst_code text NOT NULL,
  gst_amount_aud_cents bigint NOT NULL,
  reimbursement_status text NOT NULL DEFAULT 'owner_absorbed',
  notes text,
  created_at timestamp with time zone NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at timestamp with time zone NOT NULL DEFAULT timezone('utc'::text, now()),
  CONSTRAINT business_expense_claims_gst_code_check
    CHECK (gst_code IN ('G1', 'G10', 'G11', 'N-T', 'INP')),
  CONSTRAINT business_expense_claims_reimbursement_status_check
    CHECK (reimbursement_status IN ('owner_absorbed', 'pending', 'reimbursed'))
);

-- ---- business_categorisation_rules ----
CREATE TABLE public.business_categorisation_rules (
  id uuid NOT NULL DEFAULT uuid_generate_v4(),
  user_id uuid NOT NULL,
  match_field text NOT NULL,
  match_type text NOT NULL,
  match_value text NOT NULL,
  coa_id uuid NOT NULL,
  gst_code_override text,
  priority integer NOT NULL DEFAULT 100,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamp with time zone NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at timestamp with time zone NOT NULL DEFAULT timezone('utc'::text, now()),
  CONSTRAINT business_categorisation_rules_match_field_check
    CHECK (match_field IN ('description', 'wise_category')),
  CONSTRAINT business_categorisation_rules_match_type_check
    CHECK (match_type IN ('contains', 'exact', 'starts_with')),
  CONSTRAINT business_categorisation_rules_gst_override_check
    CHECK (gst_code_override IS NULL OR gst_code_override IN ('G1', 'G10', 'G11', 'N-T', 'INP'))
);

-- ---- business_periods ----
CREATE TABLE public.business_periods (
  id uuid NOT NULL DEFAULT uuid_generate_v4(),
  user_id uuid NOT NULL,
  label text NOT NULL,
  period_type text NOT NULL,
  start_date date NOT NULL,
  end_date date NOT NULL,
  is_bas_period boolean NOT NULL DEFAULT false,
  created_at timestamp with time zone NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at timestamp with time zone NOT NULL DEFAULT timezone('utc'::text, now()),
  CONSTRAINT business_periods_period_type_check
    CHECK (period_type IN ('monthly', 'quarterly', 'fy', 'custom'))
);

-- ---- business_sync_jobs ----
CREATE TABLE public.business_sync_jobs (
  id uuid NOT NULL DEFAULT uuid_generate_v4(),
  user_id uuid NOT NULL,
  kind text NOT NULL,
  status text NOT NULL DEFAULT 'queued',
  stage text,
  processed_count integer NOT NULL DEFAULT 0,
  total_estimate integer,
  error_message text,
  started_at timestamp with time zone,
  finished_at timestamp with time zone,
  created_at timestamp with time zone NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at timestamp with time zone NOT NULL DEFAULT timezone('utc'::text, now()),
  CONSTRAINT business_sync_jobs_kind_check
    CHECK (kind IN ('initial', 'manual', 'webhook_replay', 'csv_import')),
  CONSTRAINT business_sync_jobs_status_check
    CHECK (status IN ('queued', 'running', 'completed', 'failed', 'cancelled'))
);

-- ---- business_webhook_events ----
CREATE TABLE public.business_webhook_events (
  id uuid NOT NULL DEFAULT uuid_generate_v4(),
  user_id uuid,
  wise_subscription_id text NOT NULL,
  wise_event_id text NOT NULL,
  event_name text NOT NULL,
  signature_valid boolean NOT NULL DEFAULT false,
  delivery_id text,
  payload jsonb NOT NULL,
  processed_at timestamp with time zone,
  outcome text,
  error_message text,
  created_at timestamp with time zone NOT NULL DEFAULT timezone('utc'::text, now()),
  CONSTRAINT business_webhook_events_outcome_check
    CHECK (outcome IS NULL OR outcome IN ('pending', 'processed', 'duplicate', 'invalid_signature', 'error'))
);

-- ============================================================================
-- 2. PRIMARY KEYS
-- ============================================================================

ALTER TABLE public.business_wise_configs ADD CONSTRAINT business_wise_configs_pkey PRIMARY KEY (id);
ALTER TABLE public.business_accounts ADD CONSTRAINT business_accounts_pkey PRIMARY KEY (id);
ALTER TABLE public.chart_of_accounts ADD CONSTRAINT chart_of_accounts_pkey PRIMARY KEY (id);
ALTER TABLE public.business_transactions ADD CONSTRAINT business_transactions_pkey PRIMARY KEY (id);
ALTER TABLE public.business_expense_claims ADD CONSTRAINT business_expense_claims_pkey PRIMARY KEY (id);
ALTER TABLE public.business_categorisation_rules ADD CONSTRAINT business_categorisation_rules_pkey PRIMARY KEY (id);
ALTER TABLE public.business_periods ADD CONSTRAINT business_periods_pkey PRIMARY KEY (id);
ALTER TABLE public.business_sync_jobs ADD CONSTRAINT business_sync_jobs_pkey PRIMARY KEY (id);
ALTER TABLE public.business_webhook_events ADD CONSTRAINT business_webhook_events_pkey PRIMARY KEY (id);

-- ============================================================================
-- 3. UNIQUE CONSTRAINTS
-- ============================================================================

ALTER TABLE public.business_wise_configs
  ADD CONSTRAINT business_wise_configs_user_id_unique UNIQUE (user_id);

ALTER TABLE public.business_accounts
  ADD CONSTRAINT business_accounts_user_balance_unique UNIQUE (user_id, wise_balance_id);

ALTER TABLE public.chart_of_accounts
  ADD CONSTRAINT chart_of_accounts_user_code_unique UNIQUE (user_id, code);

ALTER TABLE public.business_expense_claims
  ADD CONSTRAINT business_expense_claims_user_up_uuid_unique UNIQUE (user_id, up_transaction_uuid);

ALTER TABLE public.business_webhook_events
  ADD CONSTRAINT business_webhook_events_subscription_event_unique UNIQUE (wise_subscription_id, wise_event_id);

-- Partial unique indexes for business_transactions idempotency keys
CREATE UNIQUE INDEX business_transactions_user_wise_id_unique
  ON public.business_transactions (user_id, wise_transaction_id)
  WHERE wise_transaction_id IS NOT NULL;

CREATE UNIQUE INDEX business_transactions_user_fingerprint_unique
  ON public.business_transactions (user_id, import_fingerprint)
  WHERE import_fingerprint IS NOT NULL;

-- ============================================================================
-- 4. FOREIGN KEYS
-- ============================================================================

ALTER TABLE public.business_wise_configs
  ADD CONSTRAINT business_wise_configs_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;

ALTER TABLE public.business_accounts
  ADD CONSTRAINT business_accounts_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;

ALTER TABLE public.chart_of_accounts
  ADD CONSTRAINT chart_of_accounts_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;

ALTER TABLE public.business_transactions
  ADD CONSTRAINT business_transactions_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;
ALTER TABLE public.business_transactions
  ADD CONSTRAINT business_transactions_account_fkey
  FOREIGN KEY (business_account_id) REFERENCES public.business_accounts(id) ON DELETE CASCADE;
ALTER TABLE public.business_transactions
  ADD CONSTRAINT business_transactions_coa_fkey
  FOREIGN KEY (coa_id) REFERENCES public.chart_of_accounts(id) ON DELETE SET NULL;

ALTER TABLE public.business_expense_claims
  ADD CONSTRAINT business_expense_claims_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;
ALTER TABLE public.business_expense_claims
  ADD CONSTRAINT business_expense_claims_up_transaction_fkey
  FOREIGN KEY (up_transaction_uuid) REFERENCES public.transactions(id) ON DELETE RESTRICT;
ALTER TABLE public.business_expense_claims
  ADD CONSTRAINT business_expense_claims_coa_fkey
  FOREIGN KEY (coa_id) REFERENCES public.chart_of_accounts(id) ON DELETE RESTRICT;

ALTER TABLE public.business_categorisation_rules
  ADD CONSTRAINT business_categorisation_rules_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;
ALTER TABLE public.business_categorisation_rules
  ADD CONSTRAINT business_categorisation_rules_coa_fkey
  FOREIGN KEY (coa_id) REFERENCES public.chart_of_accounts(id) ON DELETE CASCADE;

ALTER TABLE public.business_periods
  ADD CONSTRAINT business_periods_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;

ALTER TABLE public.business_sync_jobs
  ADD CONSTRAINT business_sync_jobs_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;

ALTER TABLE public.business_webhook_events
  ADD CONSTRAINT business_webhook_events_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;

-- ============================================================================
-- 5. INDEXES
-- ============================================================================

CREATE INDEX business_transactions_user_date_idx
  ON public.business_transactions (user_id, reporting_date DESC);
CREATE INDEX business_transactions_user_source_date_idx
  ON public.business_transactions (user_id, source, reporting_date DESC);
CREATE INDEX business_transactions_user_gst_date_idx
  ON public.business_transactions (user_id, gst_code, reporting_date)
  WHERE gst_code IS NOT NULL;
CREATE INDEX business_transactions_user_currency_date_idx
  ON public.business_transactions (user_id, currency_code, reporting_date);
CREATE INDEX business_transactions_user_fx_pending_idx
  ON public.business_transactions (user_id, fx_status)
  WHERE fx_status <> 'resolved';
CREATE INDEX business_transactions_user_uncategorised_idx
  ON public.business_transactions (user_id, coa_id)
  WHERE coa_id IS NULL;

CREATE INDEX business_expense_claims_user_date_idx
  ON public.business_expense_claims (user_id, reporting_date_snapshot DESC);
CREATE INDEX business_expense_claims_user_status_date_idx
  ON public.business_expense_claims (user_id, reimbursement_status, reporting_date_snapshot DESC);

CREATE INDEX business_categorisation_rules_user_active_priority_idx
  ON public.business_categorisation_rules (user_id, is_active, priority);

CREATE INDEX chart_of_accounts_user_type_active_idx
  ON public.chart_of_accounts (user_id, type, is_active);

CREATE INDEX business_sync_jobs_user_status_created_idx
  ON public.business_sync_jobs (user_id, status, created_at DESC);

CREATE INDEX business_webhook_events_user_created_idx
  ON public.business_webhook_events (user_id, created_at DESC);

-- ============================================================================
-- 6. ROW LEVEL SECURITY
-- ============================================================================

ALTER TABLE public.business_wise_configs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.business_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chart_of_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.business_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.business_expense_claims ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.business_categorisation_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.business_periods ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.business_sync_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.business_webhook_events ENABLE ROW LEVEL SECURITY;

-- Standard per-user policies. Service role bypasses RLS automatically.

DO $$
DECLARE
  t text;
  tables text[] := ARRAY[
    'business_wise_configs',
    'business_accounts',
    'chart_of_accounts',
    'business_transactions',
    'business_expense_claims',
    'business_categorisation_rules',
    'business_periods',
    'business_sync_jobs'
  ];
BEGIN
  FOREACH t IN ARRAY tables LOOP
    EXECUTE format($f$
      CREATE POLICY "Users can select own %1$s" ON public.%1$s
        FOR SELECT TO authenticated
        USING (user_id = (SELECT auth.uid()));
      CREATE POLICY "Users can insert own %1$s" ON public.%1$s
        FOR INSERT TO authenticated
        WITH CHECK (user_id = (SELECT auth.uid()));
      CREATE POLICY "Users can update own %1$s" ON public.%1$s
        FOR UPDATE TO authenticated
        USING (user_id = (SELECT auth.uid()))
        WITH CHECK (user_id = (SELECT auth.uid()));
      CREATE POLICY "Users can delete own %1$s" ON public.%1$s
        FOR DELETE TO authenticated
        USING (user_id = (SELECT auth.uid()));
    $f$, t);
  END LOOP;
END $$;

-- business_webhook_events: writes happen only via service-role (no policies for
-- authenticated writes). Reads are scoped by user_id; rows with user_id IS NULL
-- are not visible to any end user.
CREATE POLICY "Users can select own webhook events" ON public.business_webhook_events
  FOR SELECT TO authenticated
  USING (user_id IS NOT NULL AND user_id = (SELECT auth.uid()));

-- ============================================================================
-- 7. UPDATED_AT TRIGGERS
-- ============================================================================

CREATE TRIGGER set_updated_at_business_wise_configs
  BEFORE UPDATE ON public.business_wise_configs
  FOR EACH ROW EXECUTE FUNCTION handle_updated_at();
CREATE TRIGGER set_updated_at_business_accounts
  BEFORE UPDATE ON public.business_accounts
  FOR EACH ROW EXECUTE FUNCTION handle_updated_at();
CREATE TRIGGER set_updated_at_chart_of_accounts
  BEFORE UPDATE ON public.chart_of_accounts
  FOR EACH ROW EXECUTE FUNCTION handle_updated_at();
CREATE TRIGGER set_updated_at_business_transactions
  BEFORE UPDATE ON public.business_transactions
  FOR EACH ROW EXECUTE FUNCTION handle_updated_at();
CREATE TRIGGER set_updated_at_business_expense_claims
  BEFORE UPDATE ON public.business_expense_claims
  FOR EACH ROW EXECUTE FUNCTION handle_updated_at();
CREATE TRIGGER set_updated_at_business_categorisation_rules
  BEFORE UPDATE ON public.business_categorisation_rules
  FOR EACH ROW EXECUTE FUNCTION handle_updated_at();
CREATE TRIGGER set_updated_at_business_periods
  BEFORE UPDATE ON public.business_periods
  FOR EACH ROW EXECUTE FUNCTION handle_updated_at();
CREATE TRIGGER set_updated_at_business_sync_jobs
  BEFORE UPDATE ON public.business_sync_jobs
  FOR EACH ROW EXECUTE FUNCTION handle_updated_at();

-- ============================================================================
-- 8. CHART OF ACCOUNTS SEED FUNCTION
-- ============================================================================

CREATE OR REPLACE FUNCTION public.seed_business_coa(p_user_id uuid)
  RETURNS void
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = public
AS $$
DECLARE
  v_seed_version constant integer := 1;
BEGIN
  -- Only insert rows that don't already exist (preserves user customisations).
  INSERT INTO public.chart_of_accounts (user_id, code, name, type, default_gst_code, is_system, seed_version)
  VALUES
    (p_user_id, '4000', 'Revenue', 'revenue', 'G1', true, v_seed_version),
    (p_user_id, '4100', 'Consulting Income', 'revenue', 'G1', true, v_seed_version),
    (p_user_id, '4200', 'Product Sales', 'revenue', 'G1', true, v_seed_version),
    (p_user_id, '4900', 'Other Income', 'revenue', 'G1', true, v_seed_version),
    (p_user_id, '5000', 'Direct Costs', 'cogs', 'G11', true, v_seed_version),
    (p_user_id, '6000', 'Advertising & Marketing', 'expense', 'G11', true, v_seed_version),
    (p_user_id, '6100', 'Software & Subscriptions', 'expense', 'G11', true, v_seed_version),
    (p_user_id, '6200', 'Professional Services', 'expense', 'G11', true, v_seed_version),
    (p_user_id, '6300', 'Bank & Transaction Fees', 'expense', 'N-T', true, v_seed_version),
    (p_user_id, '6400', 'Travel & Transport', 'expense', 'G11', true, v_seed_version),
    (p_user_id, '6500', 'Office & Equipment', 'expense', 'G11', true, v_seed_version),
    (p_user_id, '6600', 'Insurance', 'expense', 'G11', true, v_seed_version),
    (p_user_id, '6700', 'Wages & Contractors', 'expense', 'N-T', true, v_seed_version),
    (p_user_id, '6800', 'Rent & Facilities', 'expense', 'G11', true, v_seed_version),
    (p_user_id, '6900', 'Other Expenses', 'expense', 'G11', true, v_seed_version),
    (p_user_id, '8000', 'Owner''s Draw', 'equity', 'N-T', true, v_seed_version),
    (p_user_id, '8100', 'Tax Payments', 'equity', 'N-T', true, v_seed_version)
  ON CONFLICT (user_id, code) DO NOTHING;
END;
$$;

REVOKE ALL ON FUNCTION public.seed_business_coa(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.seed_business_coa(uuid) TO authenticated, service_role;
```

- [ ] **Step 1.2: Apply the migration locally**

Run: `npx supabase db reset`
Expected: clean reset; all migrations apply without error; final message `Finished supabase db reset`.

If that command errors with "Supabase not started", run `npx supabase start` first, then re-run.

- [ ] **Step 1.3: Verify the schema landed**

Run:
```bash
npx supabase db diff --linked --schema public 2>/dev/null || true
psql "postgresql://postgres:postgres@localhost:54322/postgres" -c "\dt public.business_*"
```

Expected: lists 8 tables — `business_accounts`, `business_categorisation_rules`, `business_expense_claims`, `business_periods`, `business_sync_jobs`, `business_transactions`, `business_webhook_events`, `business_wise_configs`. Plus the existing `chart_of_accounts` table (not `business_`-prefixed but part of this module).

Run also:
```bash
psql "postgresql://postgres:postgres@localhost:54322/postgres" -c "\df public.seed_business_coa"
```

Expected: one row with `seed_business_coa | void | p_user_id uuid`.

- [ ] **Step 1.4: Commit**

```bash
git add supabase/migrations/20260525000000_business_accounting_schema.sql
git commit -m "feat(business): add business accounting schema (Phase 1A)

- 8 business_* tables + chart_of_accounts
- CHECK constraints on every enum-shaped column
- RLS policies (per-user) via DO-block; service-role bypass for webhook events
- Partial unique indexes for wise_transaction_id and import_fingerprint
- COA seed function (seed_version = 1) with 17 system rows
- Indexes on reporting/filter hot paths"
```

---

## Task 2: GST calculator (`src/lib/business-gst.ts`)

**Files:**
- Create: `src/lib/business-gst.ts`
- Create: `src/lib/__tests__/business-gst.test.ts`

Pure-logic module with no dependencies. TDD this one.

- [ ] **Step 2.1: Write the failing test**

Create `src/lib/__tests__/business-gst.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { computeGstAmountCents, isGstApplicable, type GstCode } from '@/lib/business-gst';

describe('isGstApplicable', () => {
  it('returns true for G1, G10, G11', () => {
    expect(isGstApplicable('G1')).toBe(true);
    expect(isGstApplicable('G10')).toBe(true);
    expect(isGstApplicable('G11')).toBe(true);
  });

  it('returns false for N-T and INP', () => {
    expect(isGstApplicable('N-T')).toBe(false);
    expect(isGstApplicable('INP')).toBe(false);
  });

  it('returns false for null', () => {
    expect(isGstApplicable(null)).toBe(false);
  });
});

describe('computeGstAmountCents', () => {
  it('returns null when amount is null', () => {
    expect(computeGstAmountCents(null, 'G1')).toBeNull();
  });

  it('returns 0 for non-applicable codes', () => {
    expect(computeGstAmountCents(11_000, 'N-T')).toBe(0);
    expect(computeGstAmountCents(11_000, 'INP')).toBe(0);
    expect(computeGstAmountCents(11_000, null)).toBe(0);
  });

  it('divides positive amounts by 11 with round-half-to-even', () => {
    // 11000 / 11 = 1000 exact
    expect(computeGstAmountCents(11_000, 'G1')).toBe(1000);
    // 10000 / 11 = 909.0909… → 909
    expect(computeGstAmountCents(10_000, 'G1')).toBe(909);
    // 8500 / 11 = 772.727… → 773
    expect(computeGstAmountCents(8_500, 'G11')).toBe(773);
  });

  it('preserves sign for negative debit amounts', () => {
    // -11000 / 11 = -1000
    expect(computeGstAmountCents(-11_000, 'G11')).toBe(-1000);
    // -8500 / 11 = -772.727… → magnitude 773 with sign preserved
    expect(computeGstAmountCents(-8_500, 'G11')).toBe(-773);
  });

  it('returns 0 for zero amount with applicable code', () => {
    expect(computeGstAmountCents(0, 'G1')).toBe(0);
  });

  it('rejects unsafe non-integer cents inputs', () => {
    expect(() => computeGstAmountCents(1.5 as unknown as number, 'G1')).toThrow();
  });
});
```

- [ ] **Step 2.2: Run the test to verify it fails**

Run: `npx vitest run src/lib/__tests__/business-gst.test.ts`
Expected: FAIL with `Cannot find module '@/lib/business-gst'`.

- [ ] **Step 2.3: Write the minimal implementation**

Create `src/lib/business-gst.ts`:

```ts
export type GstCode = 'G1' | 'G10' | 'G11' | 'N-T' | 'INP';

const GST_APPLICABLE: ReadonlySet<GstCode> = new Set(['G1', 'G10', 'G11']);

export function isGstApplicable(code: GstCode | null): boolean {
  if (code === null) return false;
  return GST_APPLICABLE.has(code);
}

export function computeGstAmountCents(
  amountAudCents: number | null,
  gstCode: GstCode | null,
): number | null {
  if (amountAudCents === null) return null;
  if (!Number.isInteger(amountAudCents)) {
    throw new Error(
      `computeGstAmountCents: amountAudCents must be an integer (cents), got ${amountAudCents}`,
    );
  }
  if (!isGstApplicable(gstCode)) return 0;

  const sign = Math.sign(amountAudCents);
  const magnitude = Math.round(Math.abs(amountAudCents) / 11);
  return sign * magnitude;
}
```

- [ ] **Step 2.4: Run the test to verify it passes**

Run: `npx vitest run src/lib/__tests__/business-gst.test.ts`
Expected: PASS, 9 tests.

- [ ] **Step 2.5: Commit**

```bash
git add src/lib/business-gst.ts src/lib/__tests__/business-gst.test.ts
git commit -m "feat(business): add GST calculator (business-gst.ts)

Pure-logic module — Australian GST math with sign-preserving
rounding. Used by ingestion and (later) BAS aggregation. No I/O."
```

---

## Task 3: Frankfurter FX helper (`src/lib/wise-fx.ts`)

**Files:**
- Create: `src/lib/wise-fx.ts`
- Create: `src/lib/__tests__/wise-fx.test.ts`

Fetches AUD-per-unit rate for a given currency and date. No API key. Caches per-process for the lifetime of a single sync run.

- [ ] **Step 3.1: Write the failing test**

Create `src/lib/__tests__/wise-fx.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fetchAudRateForCurrency, convertToAudCents, __clearFxCache } from '@/lib/wise-fx';

describe('wise-fx', () => {
  beforeEach(() => {
    __clearFxCache();
    vi.unstubAllGlobals();
  });

  it('returns 1 for AUD without calling the network', async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
    const rate = await fetchAudRateForCurrency('AUD', new Date('2026-05-25'));
    expect(rate).toBe(1);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('fetches AUD-per-unit rate from Frankfurter for non-AUD', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ amount: 1, base: 'USD', date: '2026-05-23', rates: { AUD: 1.5234 } }),
      }),
    );
    const rate = await fetchAudRateForCurrency('USD', new Date('2026-05-25'));
    expect(rate).toBe(1.5234);
  });

  it('throws when the feed returns a non-ok response', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: false, status: 502, statusText: 'Bad Gateway' }),
    );
    await expect(fetchAudRateForCurrency('USD', new Date('2026-05-25'))).rejects.toThrow(
      /Frankfurter/,
    );
  });

  it('caches a previously-fetched (currency, date) pair', async () => {
    const fetchSpy = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ amount: 1, base: 'EUR', date: '2026-05-23', rates: { AUD: 1.6500 } }),
    });
    vi.stubGlobal('fetch', fetchSpy);
    await fetchAudRateForCurrency('EUR', new Date('2026-05-25'));
    await fetchAudRateForCurrency('EUR', new Date('2026-05-25'));
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it('converts native cents to AUD cents using the provided rate', () => {
    // 100 USD * 1.5234 AUD/USD = 152.34 AUD → 15234 cents
    expect(convertToAudCents(10_000, 1.5234)).toBe(15_234);
    // negative preserved
    expect(convertToAudCents(-10_000, 1.5234)).toBe(-15_234);
    // rounding: 100 * 1.52345 = 152.345 → 15234 (banker's) or 15235 (half-up).
    // We pick half-away-from-zero: 15235.
    expect(convertToAudCents(10_000, 1.52345)).toBe(15_235);
  });
});
```

- [ ] **Step 3.2: Run the test to verify it fails**

Run: `npx vitest run src/lib/__tests__/wise-fx.test.ts`
Expected: FAIL — `Cannot find module '@/lib/wise-fx'`.

- [ ] **Step 3.3: Write the minimal implementation**

Create `src/lib/wise-fx.ts`:

```ts
const FRANKFURTER_BASE = 'https://api.frankfurter.app';

const cache = new Map<string, number>();

/** Test-only: clear the in-process rate cache. */
export function __clearFxCache(): void {
  cache.clear();
}

function isoDate(d: Date): string {
  // YYYY-MM-DD in UTC. Frankfurter accepts this and returns the closest weekday rate.
  return d.toISOString().slice(0, 10);
}

/**
 * Returns AUD per 1 unit of `currency` on (or closest weekday to) `at`.
 * Throws on network failure or non-200. Caller decides how to handle —
 * the ingestion pipeline treats failure as `fx_status = 'missing'`.
 */
export async function fetchAudRateForCurrency(
  currency: string,
  at: Date,
): Promise<number> {
  if (currency === 'AUD') return 1;

  const key = `${currency}|${isoDate(at)}`;
  const cached = cache.get(key);
  if (cached !== undefined) return cached;

  const url = `${FRANKFURTER_BASE}/${isoDate(at)}?from=${encodeURIComponent(currency)}&to=AUD`;
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Frankfurter fetch failed (${res.status} ${res.statusText}) for ${url}`);
  }
  const body = (await res.json()) as { rates?: { AUD?: number } };
  const rate = body?.rates?.AUD;
  if (typeof rate !== 'number' || !Number.isFinite(rate) || rate <= 0) {
    throw new Error(`Frankfurter returned invalid AUD rate for ${currency} at ${isoDate(at)}`);
  }
  cache.set(key, rate);
  return rate;
}

/**
 * Convert native-currency cents to AUD cents using `audPerUnit` (AUD per 1 unit
 * of the native currency). Rounds half-away-from-zero so −0.5 → −1, 0.5 → 1.
 */
export function convertToAudCents(amountCents: number, audPerUnit: number): number {
  if (!Number.isInteger(amountCents)) {
    throw new Error(`convertToAudCents: amountCents must be an integer, got ${amountCents}`);
  }
  if (!Number.isFinite(audPerUnit) || audPerUnit <= 0) {
    throw new Error(`convertToAudCents: audPerUnit must be a positive finite number`);
  }
  const sign = Math.sign(amountCents);
  const magnitude = Math.abs(amountCents) * audPerUnit;
  return sign * Math.round(magnitude);
}
```

- [ ] **Step 3.4: Run the test to verify it passes**

Run: `npx vitest run src/lib/__tests__/wise-fx.test.ts`
Expected: PASS, 5 tests.

- [ ] **Step 3.5: Commit**

```bash
git add src/lib/wise-fx.ts src/lib/__tests__/wise-fx.test.ts
git commit -m "feat(business): add Frankfurter FX helper (wise-fx.ts)

ECB-backed spot rates, in-process caching, AUD passthrough. Used by
ingestion when a Wise-supplied rate is absent. Throws on failure; the
ingestion pipeline catches and records fx_status='missing'."
```

---

## Task 4: Categorisation engine (`src/lib/business-categorise.ts`)

**Files:**
- Create: `src/lib/business-categorise.ts`
- Create: `src/lib/__tests__/business-categorise.test.ts`

Pure function over a list of rules and an input row. No I/O.

- [ ] **Step 4.1: Write the failing test**

Create `src/lib/__tests__/business-categorise.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { matchCategorisationRule, type CategorisationRule } from '@/lib/business-categorise';

const rule = (over: Partial<CategorisationRule>): CategorisationRule => ({
  id: 'r1',
  match_field: 'description',
  match_type: 'contains',
  match_value: 'AWS',
  coa_id: 'coa-aws',
  gst_code_override: null,
  priority: 100,
  is_active: true,
  ...over,
});

describe('matchCategorisationRule', () => {
  it('returns null when no rules match', () => {
    const result = matchCategorisationRule([rule({})], { description: 'Coffee', wise_category: null });
    expect(result).toBeNull();
  });

  it('returns the first matching rule by priority ASC', () => {
    const rules = [
      rule({ id: 'high', priority: 200, match_value: 'AWS' }),
      rule({ id: 'low', priority: 50, match_value: 'AWS' }),
    ];
    const result = matchCategorisationRule(rules, { description: 'AWS Sydney', wise_category: null });
    expect(result?.id).toBe('low');
  });

  it('ignores inactive rules', () => {
    const result = matchCategorisationRule(
      [rule({ is_active: false })],
      { description: 'AWS Sydney', wise_category: null },
    );
    expect(result).toBeNull();
  });

  it('matches case-insensitively', () => {
    const result = matchCategorisationRule(
      [rule({ match_value: 'aws' })],
      { description: 'AWS Sydney', wise_category: null },
    );
    expect(result?.id).toBe('r1');
  });

  it('exact matcher requires full-string equality', () => {
    const r = rule({ match_type: 'exact', match_value: 'AWS' });
    expect(matchCategorisationRule([r], { description: 'AWS Sydney', wise_category: null })).toBeNull();
    expect(matchCategorisationRule([r], { description: 'AWS', wise_category: null })?.id).toBe('r1');
  });

  it('starts_with matcher anchors at the beginning', () => {
    const r = rule({ match_type: 'starts_with', match_value: 'AWS' });
    expect(matchCategorisationRule([r], { description: 'AWS Sydney', wise_category: null })?.id).toBe('r1');
    expect(matchCategorisationRule([r], { description: 'Old AWS', wise_category: null })).toBeNull();
  });

  it('match_field=wise_category matches on the wise_category input', () => {
    const r = rule({ match_field: 'wise_category', match_value: 'utilities' });
    expect(matchCategorisationRule([r], { description: 'AGL', wise_category: 'utilities' })?.id).toBe('r1');
    expect(matchCategorisationRule([r], { description: 'AGL', wise_category: null })).toBeNull();
  });
});
```

- [ ] **Step 4.2: Run the test to verify it fails**

Run: `npx vitest run src/lib/__tests__/business-categorise.test.ts`
Expected: FAIL — `Cannot find module '@/lib/business-categorise'`.

- [ ] **Step 4.3: Write the minimal implementation**

Create `src/lib/business-categorise.ts`:

```ts
import type { GstCode } from '@/lib/business-gst';

export type MatchField = 'description' | 'wise_category';
export type MatchType = 'contains' | 'exact' | 'starts_with';

export interface CategorisationRule {
  id: string;
  match_field: MatchField;
  match_type: MatchType;
  match_value: string;
  coa_id: string;
  gst_code_override: GstCode | null;
  priority: number;
  is_active: boolean;
}

export interface CategorisationInput {
  description: string;
  wise_category: string | null;
}

function matches(rule: CategorisationRule, haystack: string | null): boolean {
  if (haystack === null) return false;
  const h = haystack.toLowerCase();
  const n = rule.match_value.toLowerCase();
  switch (rule.match_type) {
    case 'contains':
      return h.includes(n);
    case 'exact':
      return h === n;
    case 'starts_with':
      return h.startsWith(n);
  }
}

/**
 * Returns the first matching rule in priority ASC order (lowest priority
 * number wins), or null if no rule matches. Inactive rules are skipped.
 */
export function matchCategorisationRule(
  rules: readonly CategorisationRule[],
  input: CategorisationInput,
): CategorisationRule | null {
  const ordered = [...rules]
    .filter((r) => r.is_active)
    .sort((a, b) => a.priority - b.priority);
  for (const rule of ordered) {
    const haystack = rule.match_field === 'description' ? input.description : input.wise_category;
    if (matches(rule, haystack)) return rule;
  }
  return null;
}
```

- [ ] **Step 4.4: Run the test to verify it passes**

Run: `npx vitest run src/lib/__tests__/business-categorise.test.ts`
Expected: PASS, 7 tests.

- [ ] **Step 4.5: Commit**

```bash
git add src/lib/business-categorise.ts src/lib/__tests__/business-categorise.test.ts
git commit -m "feat(business): add categorisation rule engine

Pure-function matcher: takes a rule set + transaction description, returns
the first matching rule by priority ASC. Used by the ingestion pipeline."
```

---

## Task 5: Verify Wise API reference (no code)

This is a research task. The spec's open question #20 calls out that LLM training data on Wise's API is unreliable — verify endpoints before writing the client.

- [ ] **Step 5.1: Fetch the live Wise API reference**

Use the WebFetch tool (or visit in browser) and capture the current canonical paths and parameter shapes for these endpoints. Save findings to `documentation/wise-api/endpoints.md` (a new file you create as part of this step).

URLs to fetch:
- `https://docs.wise.com/api-reference` — index
- `https://docs.wise.com/api-reference/profile` — `GET /v2/profiles`
- `https://docs.wise.com/api-reference/balance` — list balances for a profile
- `https://docs.wise.com/api-reference/balance-statements` — statement endpoint (account-based)
- `https://docs.wise.com/api-reference/activities` — activity endpoint (newer; check if it supports cursor pagination)

For each, record in `documentation/wise-api/endpoints.md`:
- HTTP method + full path (including version segment, e.g. `/v4/profiles/{profileId}/balances`).
- Required path/query params.
- Response shape (field names you care about: balance id, currency, amount).
- Pagination shape (cursor field name, where in the response, how to pass back).
- Whether the endpoint requires a header beyond `Authorization: Bearer <token>`.

- [ ] **Step 5.2: Confirm `getStatement` vs `getActivity`**

Decide which one Plan 1A.2's sync worker will call. Default decision rule:
- If `GET /v1/profiles/{profileId}/activities` supports cursor pagination and returns transactions across all balances in one call → prefer it.
- Otherwise → use per-balance `GET /v3/profiles/{profileId}/borderless-accounts/{balanceId}/statement.json` (or the current path verified in step 5.1) and iterate per balance.

Record the decision and rationale at the bottom of `documentation/wise-api/endpoints.md`.

- [ ] **Step 5.3: Commit the reference**

```bash
git add documentation/wise-api/endpoints.md
git commit -m "docs(business): capture verified Wise API endpoint reference

Pre-implementation research per spec §20. Records the live endpoint
paths, pagination shape, and the getStatement-vs-getActivity decision
used by wise-api.ts and the sync worker."
```

---

## Task 6: Wise API client (`src/lib/wise-api.ts`)

**Files:**
- Create: `src/lib/wise-api.ts`
- Create: `src/lib/__tests__/wise-api.test.ts`

**Phase 1A subset only.** Methods needed now: `ping`, `getProfiles`, `getBalances`, plus the one chosen in Task 5.2 (`getStatement` OR `getActivity`). `registerWebhook` / `deleteWebhook` ship in Phase 1B.

The pseudocode below uses `getActivity` placeholder names. **Adjust to match the verified endpoint paths/shapes from Task 5.1** before writing.

- [ ] **Step 6.1: Write the failing test**

Create `src/lib/__tests__/wise-api.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createWiseApiClient } from '@/lib/wise-api';

const okResponse = (body: unknown) => ({
  ok: true,
  status: 200,
  json: async () => body,
  text: async () => JSON.stringify(body),
});

describe('createWiseApiClient', () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
  });

  it('uses the live base URL by default', () => {
    const client = createWiseApiClient('tok', 'live');
    expect(client.baseUrl).toBe('https://api.wise.com');
  });

  it('uses the sandbox base URL when requested', () => {
    const client = createWiseApiClient('tok', 'sandbox');
    expect(client.baseUrl).toBe('https://api.wise-sandbox.com');
  });

  it('ping sends Authorization header and returns the response body', async () => {
    const fetchSpy = vi.fn().mockResolvedValue(okResponse({ id: 1, email: 'a@b.com' }));
    vi.stubGlobal('fetch', fetchSpy);
    const client = createWiseApiClient('tok-123', 'live');
    const me = await client.ping();
    expect(me).toEqual({ id: 1, email: 'a@b.com' });
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [url, init] = fetchSpy.mock.calls[0];
    expect(url).toBe('https://api.wise.com/v1/me');
    expect((init as RequestInit).headers).toMatchObject({
      Authorization: 'Bearer tok-123',
    });
  });

  it('getProfiles returns the JSON array', async () => {
    const profiles = [
      { id: 1, type: 'PERSONAL' },
      { id: 2, type: 'BUSINESS' },
    ];
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(okResponse(profiles)));
    const client = createWiseApiClient('tok', 'live');
    const result = await client.getProfiles();
    expect(result).toEqual(profiles);
  });

  it('throws WiseApiError on non-ok response', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      statusText: 'Unauthorized',
      text: async () => '{"errors":[{"message":"bad token"}]}',
    }));
    const client = createWiseApiClient('tok', 'live');
    await expect(client.ping()).rejects.toMatchObject({
      name: 'WiseApiError',
      status: 401,
    });
  });

  it('getBalances calls the balances endpoint for a profile', async () => {
    const fetchSpy = vi.fn().mockResolvedValue(okResponse([{ id: 999, currency: 'AUD', amount: { value: 100, currency: 'AUD' } }]));
    vi.stubGlobal('fetch', fetchSpy);
    const client = createWiseApiClient('tok', 'live');
    await client.getBalances(42);
    const [url] = fetchSpy.mock.calls[0];
    // Path verified in Task 5.1 — update this assertion to the real path.
    expect(url).toContain('/v4/profiles/42/balances');
  });
});
```

- [ ] **Step 6.2: Run the test to verify it fails**

Run: `npx vitest run src/lib/__tests__/wise-api.test.ts`
Expected: FAIL — `Cannot find module '@/lib/wise-api'`.

- [ ] **Step 6.3: Write the minimal implementation**

Create `src/lib/wise-api.ts`. **Replace endpoint paths with the verified ones from Task 5.1 before running.**

```ts
/**
 * Wise Business API client (Phase 1A subset).
 *
 * Documentation: https://docs.wise.com/api-reference
 * Verified endpoints: documentation/wise-api/endpoints.md
 *
 * Adds webhook register/delete methods in Phase 1B.
 */

export type WiseEnvironment = 'live' | 'sandbox';

const BASE_URLS: Record<WiseEnvironment, string> = {
  live: 'https://api.wise.com',
  sandbox: 'https://api.wise-sandbox.com',
};

/** Safety limit for cursor pagination. Phase 1A pulls all history. */
export const MAX_PAGES = 500;

export interface WiseProfile {
  id: number;
  type: 'PERSONAL' | 'BUSINESS';
  // additional fields per verified reference (Task 5.1).
}

export interface WiseBalance {
  id: number;
  currency: string;
  amount: { value: number; currency: string };
  name?: string;
  // additional fields per verified reference.
}

export interface WiseStatementEntry {
  referenceNumber?: string;
  date: string;
  amount: { value: number; currency: string };
  totalFees?: { value: number; currency: string };
  details?: {
    description?: string;
    category?: string;
    type?: string;
  };
  exchangeDetails?: {
    rate?: number;
    fromCurrency?: string;
    toCurrency?: string;
  };
  // Shape per verified reference. The ingestion pipeline reads
  // referenceNumber as wise_transaction_id.
}

export class WiseApiError extends Error {
  name = 'WiseApiError';
  constructor(public readonly status: number, message: string, public readonly body?: string) {
    super(message);
  }
}

export interface WiseApiClient {
  readonly baseUrl: string;
  ping(): Promise<unknown>;
  getProfiles(): Promise<WiseProfile[]>;
  getBalances(profileId: number): Promise<WiseBalance[]>;
  /**
   * Returns one page of statement entries. Pagination shape verified in
   * Task 5.1. The sync worker (Plan 1A.2) iterates pages using the cursor.
   */
  getStatementPage(args: {
    profileId: number;
    balanceId: number;
    intervalStart: string; // ISO date
    intervalEnd: string;   // ISO date
    nextCursor?: string;
  }): Promise<{ entries: WiseStatementEntry[]; nextCursor: string | null }>;
}

export function createWiseApiClient(token: string, env: WiseEnvironment): WiseApiClient {
  const baseUrl = BASE_URLS[env];

  async function call<T>(path: string, init?: RequestInit): Promise<T> {
    const res = await fetch(`${baseUrl}${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/json',
        'Content-Type': 'application/json',
        ...(init?.headers ?? {}),
      },
    });
    if (!res.ok) {
      const body = await res.text().catch(() => undefined);
      throw new WiseApiError(res.status, `Wise API ${res.status} ${res.statusText} on ${path}`, body);
    }
    return res.json() as Promise<T>;
  }

  return {
    baseUrl,
    ping() {
      return call('/v1/me');
    },
    getProfiles() {
      return call<WiseProfile[]>('/v2/profiles');
    },
    getBalances(profileId: number) {
      // Path placeholder — replace with verified path from Task 5.1.
      return call<WiseBalance[]>(`/v4/profiles/${profileId}/balances?types=STANDARD`);
    },
    async getStatementPage({ profileId, balanceId, intervalStart, intervalEnd, nextCursor }) {
      // Path + pagination placeholder — replace with verified shape from Task 5.1.
      const params = new URLSearchParams({
        intervalStart,
        intervalEnd,
        type: 'COMPACT',
      });
      if (nextCursor) params.set('nextCursor', nextCursor);
      const body = await call<{
        transactions?: WiseStatementEntry[];
        nextCursor?: string | null;
      }>(`/v1/profiles/${profileId}/borderless-accounts/${balanceId}/statement.json?${params.toString()}`);
      return {
        entries: body.transactions ?? [],
        nextCursor: body.nextCursor ?? null,
      };
    },
  };
}
```

- [ ] **Step 6.4: Adjust endpoint paths and assertions if Task 5.1 found different shapes**

If the verified reference shows different paths or pagination shapes, edit both `wise-api.ts` and the test assertions in `__tests__/wise-api.test.ts` to match. Note: the test's path assertion (`/v4/profiles/42/balances`) is an example only.

- [ ] **Step 6.5: Run the test to verify it passes**

Run: `npx vitest run src/lib/__tests__/wise-api.test.ts`
Expected: PASS, 6 tests.

- [ ] **Step 6.6: Commit**

```bash
git add src/lib/wise-api.ts src/lib/__tests__/wise-api.test.ts
git commit -m "feat(business): add Wise API client (Phase 1A subset)

ping, getProfiles, getBalances, getStatementPage. Webhook
register/delete defer to Phase 1B. Endpoint paths verified
against documentation/wise-api/endpoints.md."
```

---

## Task 7: Shared ingestion entry point (`src/lib/business-ingest.ts`)

**Files:**
- Create: `src/lib/business-ingest.ts`
- Create: `src/lib/__tests__/business-ingest.test.ts`

This is the single ingestion function called by both the future webhook handler (Phase 1B) and the manual-sync worker (Plan 1A.2). It is deliberately I/O-injectable: callers pass a Supabase client and a Wise client, the function does no fetching by itself beyond `wise-fx` for FX. This makes it unit-testable without spinning up Supabase.

- [ ] **Step 7.1: Write the failing test**

Create `src/lib/__tests__/business-ingest.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { processWiseTransaction, type ProcessInput } from '@/lib/business-ingest';
import type { CategorisationRule } from '@/lib/business-categorise';
import { __clearFxCache } from '@/lib/wise-fx';

interface UpsertCall {
  table: string;
  row: Record<string, unknown>;
  onConflict?: string;
}

function makeSupabaseStub(opts?: { coa?: { id: string; default_gst_code: string } | null }) {
  const upsertCalls: UpsertCall[] = [];
  const client = {
    from(table: string) {
      return {
        upsert: async (row: Record<string, unknown>, options?: { onConflict?: string }) => {
          upsertCalls.push({ table, row, onConflict: options?.onConflict });
          return { data: { ...row, id: 'inserted-id' }, error: null };
        },
        select: () => ({
          eq: () => ({
            eq: () => ({
              maybeSingle: async () => ({ data: opts?.coa ?? null, error: null }),
            }),
          }),
        }),
      };
    },
  };
  return { client, upsertCalls };
}

const baseInput = (over: Partial<ProcessInput> = {}): ProcessInput => ({
  userId: 'user-1',
  businessAccountId: 'acct-1',
  source: 'wise_api',
  reportingTimezone: 'Australia/Sydney',
  rules: [],
  entry: {
    wise_transaction_id: 'wtx-1',
    occurred_at: new Date('2026-05-23T03:00:00Z'), // 13:00 Sydney
    description: 'AWS Sydney',
    amount_cents: -11_000, // -$110 expense
    currency_code: 'AUD',
    wise_category: null,
    exchange_rate_from_wise: null,
    raw_payload: { hi: 'world' },
  },
  ...over,
});

beforeEach(() => __clearFxCache());

describe('processWiseTransaction', () => {
  it('upserts an AUD transaction with fx_status=resolved and direction=debit', async () => {
    const { client, upsertCalls } = makeSupabaseStub();
    await processWiseTransaction(client as never, baseInput());
    expect(upsertCalls).toHaveLength(1);
    const row = upsertCalls[0].row;
    expect(row).toMatchObject({
      user_id: 'user-1',
      business_account_id: 'acct-1',
      wise_transaction_id: 'wtx-1',
      amount_cents: -11_000,
      currency_code: 'AUD',
      amount_aud_cents: -11_000,
      fx_status: 'resolved',
      direction: 'debit',
      source: 'wise_api',
      coa_id: null,
      gst_code: null,
      gst_amount_aud_cents: null,
    });
    expect(row.reporting_date).toBe('2026-05-23'); // Sydney-local date
    expect(upsertCalls[0].onConflict).toBe('user_id,wise_transaction_id');
  });

  it('applies a matching rule and sets coa_id + gst_code + gst_amount', async () => {
    const rule: CategorisationRule = {
      id: 'r1',
      match_field: 'description',
      match_type: 'contains',
      match_value: 'aws',
      coa_id: 'coa-software',
      gst_code_override: null,
      priority: 100,
      is_active: true,
    };
    const { client, upsertCalls } = makeSupabaseStub({
      coa: { id: 'coa-software', default_gst_code: 'G11' },
    });
    await processWiseTransaction(client as never, baseInput({ rules: [rule] }));
    expect(upsertCalls[0].row).toMatchObject({
      coa_id: 'coa-software',
      gst_code: 'G11',
      gst_amount_aud_cents: -1_000, // -11000 / 11
    });
  });

  it('uses Wise-supplied rate when present', async () => {
    const { client, upsertCalls } = makeSupabaseStub();
    await processWiseTransaction(
      client as never,
      baseInput({
        entry: {
          ...baseInput().entry,
          amount_cents: -10_000,
          currency_code: 'USD',
          exchange_rate_from_wise: 1.5,
        },
      }),
    );
    expect(upsertCalls[0].row).toMatchObject({
      amount_aud_cents: -15_000,
      exchange_rate: 1.5,
      exchange_rate_source: 'wise',
      fx_status: 'resolved',
    });
  });

  it('falls back to Frankfurter when Wise has no rate and currency is non-AUD', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ amount: 1, base: 'USD', date: '2026-05-23', rates: { AUD: 1.5 } }),
    }));
    const { client, upsertCalls } = makeSupabaseStub();
    await processWiseTransaction(
      client as never,
      baseInput({
        entry: {
          ...baseInput().entry,
          amount_cents: -10_000,
          currency_code: 'USD',
          exchange_rate_from_wise: null,
        },
      }),
    );
    expect(upsertCalls[0].row).toMatchObject({
      amount_aud_cents: -15_000,
      exchange_rate: 1.5,
      exchange_rate_source: 'spot_feed',
      fx_status: 'resolved',
    });
    vi.unstubAllGlobals();
  });

  it('marks fx_status=missing when Frankfurter fails', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 503, statusText: 'down' }));
    const { client, upsertCalls } = makeSupabaseStub();
    await processWiseTransaction(
      client as never,
      baseInput({
        entry: {
          ...baseInput().entry,
          amount_cents: -10_000,
          currency_code: 'USD',
          exchange_rate_from_wise: null,
        },
      }),
    );
    expect(upsertCalls[0].row).toMatchObject({
      amount_aud_cents: null,
      exchange_rate: null,
      exchange_rate_source: null,
      fx_status: 'missing',
    });
    vi.unstubAllGlobals();
  });

  it('uses import_fingerprint instead of wise_transaction_id for csv_import source', async () => {
    const { client, upsertCalls } = makeSupabaseStub();
    await processWiseTransaction(
      client as never,
      baseInput({
        source: 'csv_import',
        entry: {
          ...baseInput().entry,
          wise_transaction_id: null,
          import_fingerprint: 'fp-abc',
        },
      }),
    );
    expect(upsertCalls[0].row).toMatchObject({
      import_fingerprint: 'fp-abc',
      wise_transaction_id: null,
      source: 'csv_import',
    });
    expect(upsertCalls[0].onConflict).toBe('user_id,import_fingerprint');
  });
});
```

- [ ] **Step 7.2: Run the test to verify it fails**

Run: `npx vitest run src/lib/__tests__/business-ingest.test.ts`
Expected: FAIL — `Cannot find module '@/lib/business-ingest'`.

- [ ] **Step 7.3: Write the minimal implementation**

Create `src/lib/business-ingest.ts`:

```ts
import type { SupabaseClient } from '@supabase/supabase-js';
import { computeGstAmountCents, type GstCode } from '@/lib/business-gst';
import {
  matchCategorisationRule,
  type CategorisationRule,
} from '@/lib/business-categorise';
import { convertToAudCents, fetchAudRateForCurrency } from '@/lib/wise-fx';

export type IngestSource = 'wise_api' | 'csv_import';

/** Normalised input shape — adapter at the caller maps Wise/CSV rows to this. */
export interface IngestEntry {
  /** Wise's transaction id; null for CSV rows without one. */
  wise_transaction_id: string | null;
  /** CSV idempotency key (sha1 of normalised composite); null for API rows. */
  import_fingerprint?: string | null;
  occurred_at: Date;
  description: string;
  amount_cents: number;
  currency_code: string;
  wise_category: string | null;
  /** Wise-supplied AUD-per-unit rate when present (transfer/conversion legs). */
  exchange_rate_from_wise: number | null;
  raw_payload: unknown;
}

export interface ProcessInput {
  userId: string;
  businessAccountId: string;
  source: IngestSource;
  reportingTimezone: string;
  rules: CategorisationRule[];
  entry: IngestEntry;
}

interface CoaLookup {
  id: string;
  default_gst_code: GstCode;
}

/**
 * Single shared ingestion function for Wise statements and CSV imports.
 * Both the future webhook handler and the manual-sync worker call this.
 * Caller passes a Supabase client (anon, server, or service-role); this
 * function does not assume which.
 */
export async function processWiseTransaction(
  supabase: SupabaseClient,
  input: ProcessInput,
): Promise<void> {
  const { userId, businessAccountId, source, reportingTimezone, rules, entry } = input;

  // ---- 1. Date derivation (reporting_date in user's timezone) ----
  const reporting_date = formatInTimeZone(entry.occurred_at, reportingTimezone);

  // ---- 2. Direction ----
  const direction: 'credit' | 'debit' = entry.amount_cents >= 0 ? 'credit' : 'debit';

  // ---- 3. FX resolution ----
  let amount_aud_cents: number | null = null;
  let exchange_rate: number | null = null;
  let exchange_rate_source: 'wise' | 'spot_feed' | null = null;
  let exchange_rate_fetched_at: string | null = null;
  let fx_status: 'resolved' | 'missing' = 'resolved';

  if (entry.currency_code === 'AUD') {
    amount_aud_cents = entry.amount_cents;
  } else if (entry.exchange_rate_from_wise !== null) {
    exchange_rate = entry.exchange_rate_from_wise;
    exchange_rate_source = 'wise';
    amount_aud_cents = convertToAudCents(entry.amount_cents, exchange_rate);
  } else {
    try {
      const rate = await fetchAudRateForCurrency(entry.currency_code, entry.occurred_at);
      exchange_rate = rate;
      exchange_rate_source = 'spot_feed';
      exchange_rate_fetched_at = new Date().toISOString();
      amount_aud_cents = convertToAudCents(entry.amount_cents, rate);
    } catch {
      fx_status = 'missing';
    }
  }

  // ---- 4. Categorisation ----
  const matchedRule = matchCategorisationRule(rules, {
    description: entry.description,
    wise_category: entry.wise_category,
  });

  let coa_id: string | null = null;
  let gst_code: GstCode | null = null;

  if (matchedRule) {
    coa_id = matchedRule.coa_id;
    if (matchedRule.gst_code_override) {
      gst_code = matchedRule.gst_code_override;
    } else {
      const { data: coa } = await supabase
        .from('chart_of_accounts')
        .select('id, default_gst_code')
        .eq('id', matchedRule.coa_id)
        .eq('user_id', userId)
        .maybeSingle() as { data: CoaLookup | null };
      gst_code = (coa?.default_gst_code ?? null) as GstCode | null;
    }
  }

  // ---- 5. GST amount ----
  const gst_amount_aud_cents = computeGstAmountCents(amount_aud_cents, gst_code);

  // ---- 6. Build row + upsert with the correct conflict target ----
  const row = {
    user_id: userId,
    business_account_id: businessAccountId,
    wise_transaction_id: entry.wise_transaction_id,
    import_fingerprint: entry.import_fingerprint ?? null,
    occurred_at: entry.occurred_at.toISOString(),
    reporting_date,
    description: entry.description,
    amount_cents: entry.amount_cents,
    currency_code: entry.currency_code,
    direction,
    exchange_rate,
    exchange_rate_source,
    exchange_rate_fetched_at,
    amount_aud_cents,
    fx_status,
    wise_category: entry.wise_category,
    coa_id,
    gst_code,
    gst_amount_aud_cents,
    is_reconciled: false,
    source,
    raw_payload: entry.raw_payload,
  };

  const onConflict = source === 'csv_import' ? 'user_id,import_fingerprint' : 'user_id,wise_transaction_id';

  const { error } = await supabase
    .from('business_transactions')
    .upsert(row, { onConflict });

  if (error) {
    throw new Error(`processWiseTransaction: upsert failed: ${error.message}`);
  }
}

/**
 * Returns YYYY-MM-DD for `at` interpreted in the given IANA timezone.
 * Uses Intl.DateTimeFormat — no external date library needed.
 */
function formatInTimeZone(at: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(at);
  const year = parts.find((p) => p.type === 'year')?.value;
  const month = parts.find((p) => p.type === 'month')?.value;
  const day = parts.find((p) => p.type === 'day')?.value;
  return `${year}-${month}-${day}`;
}
```

- [ ] **Step 7.4: Run the test to verify it passes**

Run: `npx vitest run src/lib/__tests__/business-ingest.test.ts`
Expected: PASS, 6 tests.

- [ ] **Step 7.5: Commit**

```bash
git add src/lib/business-ingest.ts src/lib/__tests__/business-ingest.test.ts
git commit -m "feat(business): add shared ingestion entry point

processWiseTransaction(): single function used by both manual sync
(Plan 1A.2) and the Wise webhook handler (Plan 1B). I/O-injectable —
caller passes a Supabase client. Handles direction, FX (Wise rate →
Frankfurter fallback → fx_status='missing'), categorisation, GST
amount, and source-driven upsert conflict target."
```

---

## Task 8: env additions

**Files:**
- Modify: `src/lib/env.ts`

Declares the Wise public-key env vars now even though they're used in Phase 1B — so Phase 1B's plan doesn't have to touch env validation.

- [ ] **Step 8.1: Edit `src/lib/env.ts`**

Find the `z.object({` block and add the two new lines before the closing `})`. The file becomes:

```ts
import { z } from "zod/v4";

const envSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.url(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1).optional(),
  UP_API_ENCRYPTION_KEY: z
    .string()
    .length(64)
    .regex(/^[0-9a-f]+$/i, "Must be a 64-character hex string")
    .optional(),
  CRON_SECRET: z.string().min(1).optional(),
  WISE_PUBLIC_KEY_LIVE: z.string().min(1).optional(),
  WISE_PUBLIC_KEY_SANDBOX: z.string().min(1).optional(),
});
```

Leave the rest of the file unchanged.

- [ ] **Step 8.2: Run the type check to confirm no regressions**

Run: `npx tsc --noEmit`
Expected: PASS with no new errors. If existing unrelated errors exist, confirm they pre-date this change by checking `git stash && npx tsc --noEmit && git stash pop`.

- [ ] **Step 8.3: Commit**

```bash
git add src/lib/env.ts
git commit -m "chore(business): declare Wise webhook public-key env vars

WISE_PUBLIC_KEY_LIVE and WISE_PUBLIC_KEY_SANDBOX are used by Phase 1B's
webhook handler. Declared optional now so the env schema is complete
before that work lands."
```

---

## Task 9: Wise API reference doc

**Files:**
- Create: `documentation/wise-api/README.md`

Companion to `endpoints.md` (created in Task 5). High-level summary.

- [ ] **Step 9.1: Write the doc**

Create `documentation/wise-api/README.md`:

```markdown
# Wise Business API integration

PiggyBack ingests Business profile transactions from Wise into the
`business_*` tables. This directory documents the integration surface.

## Files

- `endpoints.md` — verified endpoint paths, pagination shape, and the
  `getStatement` vs `getActivity` decision. Pre-implementation research
  output (see plan task 5).

## Authentication

Personal API token. Generated by the user in their Wise Business account
under Settings → API tokens. Stored encrypted in
`business_wise_configs.encrypted_token` via the existing AES-256-GCM
helper in `src/lib/token-encryption.ts`. Decrypted on demand.

## Environments

- Live: `https://api.wise.com`
- Sandbox: `https://api.wise-sandbox.com`

Selected per-user via `business_wise_configs.wise_environment`.

## Pagination

Cursor-based via `nextCursor` (verify shape in `endpoints.md`).
`MAX_PAGES = 500` safety cap in `src/lib/wise-api.ts`.

## Phase 1A subset

The Phase 1A `WiseApiClient` (`src/lib/wise-api.ts`) covers:

- `ping()` — token validation.
- `getProfiles()` — pick the Business profile on connection.
- `getBalances(profileId)` — one row per currency balance.
- `getStatementPage(...)` — paginated history.

## Phase 1B (not yet implemented)

- `registerWebhook(profileId, payload)` / `deleteWebhook(...)` — Wise
  Subscriptions API.
- Webhook signature verification — Wise signs payloads with **RSA-SHA256**
  (newer subscriptions: RSA-SHA512). The shared HMAC pattern used by the
  Up Bank webhook (`src/app/api/upbank/webhook/route.ts`) is wrong for
  Wise; do not reuse that code path.
- Public keys: env vars `WISE_PUBLIC_KEY_LIVE` and `WISE_PUBLIC_KEY_SANDBOX`
  (PEM strings). Declared in `src/lib/env.ts` at Phase 1A.

## Related docs

- Spec: `docs/superpowers/specs/2026-05-25-wise-business-accounting-design.md`
- Wise official: `https://docs.wise.com/api-reference`
```

- [ ] **Step 9.2: Commit**

```bash
git add documentation/wise-api/README.md
git commit -m "docs(business): add Wise API integration overview"
```

---

## Verification: full test run

After all tasks pass, run the full test suite to confirm nothing else regressed.

- [ ] **Final step: Run the entire vitest suite**

Run: `npx vitest run`
Expected: all previously-passing tests still pass; the 33 new tests added in this plan also pass (9 GST + 5 FX + 7 categorise + 6 API + 6 ingest = 33).

If any pre-existing test fails, investigate before declaring Phase 1A foundation done. The new modules are pure-logic-with-injection — they should not affect existing behaviour.

---

## What Phase 1A foundation does NOT include

The following are intentionally deferred:

- **UI:** no `/business` route, no settings page, no transactions view. That's Plan 1A.2.
- **Manual sync worker:** the function that loops `getStatementPage` and calls `processWiseTransaction` for each row. That's Plan 1A.2.
- **Server actions:** `connectWise`, `enqueueInitialSync`, etc. That's Plan 1A.2.
- **Sidebar / nav integration:** Plan 1A.3.
- **Claim flow + P&L + dashboard:** Plan 1A.3.
- **BAS, CSV import, Wise webhook:** Plan 1B.

When this plan completes, the database has the right shape, the COA seed is callable from SQL, and every library function used by ingestion is unit-tested. The next plan can build the worker + UI on top with confidence that the foundation won't shift under it.
