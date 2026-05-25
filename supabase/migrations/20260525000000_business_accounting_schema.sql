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
  reference_number text,
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
--
-- FK target: public.profiles(id), NOT auth.users(id).
-- profiles is the app-level extension of auth.users (one row per user, created
-- by the handle_new_user trigger). All existing PiggyBack tables (accounts,
-- transactions, up_api_configs, etc.) FK to public.profiles(id) and we follow
-- that convention here. Mixing auth.users and profiles FK targets would cause
-- RLS headaches because policies key off profiles ids.
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
-- ON DELETE CASCADE: snapshot fields carry the data needed for reports, so we
-- don't depend on the pointer surviving. CASCADE avoids profile-delete failing
-- due to evaluation order between the user_id->profiles and up_transaction_uuid
-- ->transactions cascade paths. The Up webhook never hard-deletes transactions
-- in normal operation (it soft-deletes via status='DELETED'), so this path is
-- only exercised on user deletion or admin action.
ALTER TABLE public.business_expense_claims
  ADD CONSTRAINT business_expense_claims_up_transaction_fkey
  FOREIGN KEY (up_transaction_uuid) REFERENCES public.transactions(id) ON DELETE CASCADE;
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

-- ON DELETE SET NULL: webhook events are an immutable audit log; preserve
-- the records when a user is deleted, just de-associate them. The SELECT
-- policy already filters out user_id IS NULL rows from authenticated reads,
-- so orphaned events become invisible to end users (correct behaviour for
-- audit/admin-only data).
ALTER TABLE public.business_webhook_events
  ADD CONSTRAINT business_webhook_events_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE SET NULL;

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
CREATE INDEX business_transactions_user_reference_idx
  ON public.business_transactions (user_id, reference_number)
  WHERE reference_number IS NOT NULL;

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
        USING (user_id = auth.uid());
      CREATE POLICY "Users can insert own %1$s" ON public.%1$s
        FOR INSERT TO authenticated
        WITH CHECK (user_id = auth.uid());
      CREATE POLICY "Users can update own %1$s" ON public.%1$s
        FOR UPDATE TO authenticated
        USING (user_id = auth.uid())
        WITH CHECK (user_id = auth.uid());
      CREATE POLICY "Users can delete own %1$s" ON public.%1$s
        FOR DELETE TO authenticated
        USING (user_id = auth.uid());
    $f$, t);
  END LOOP;
END $$;

-- business_webhook_events: writes happen only via service-role (no policies for
-- authenticated writes). Reads are scoped by user_id; rows with user_id IS NULL
-- are not visible to any end user.
CREATE POLICY "Users can select own webhook events" ON public.business_webhook_events
  FOR SELECT TO authenticated
  USING (user_id IS NOT NULL AND user_id = auth.uid());

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
  SET search_path TO ''
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
GRANT EXECUTE ON FUNCTION public.seed_business_coa(uuid) TO service_role;
