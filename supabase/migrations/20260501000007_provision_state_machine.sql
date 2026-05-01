-- =============================================================================
-- Provision state machine: expanded states + retry tracking + usage counters
-- =============================================================================
--
-- Plan #5 (multi-tenant provisioning) adds new state-machine vocabulary on
-- `piggyback_provisions` for the Stripe-paid + OAuth-driven worker pipeline,
-- and introduces a daily resource-usage counter to keep us under Supabase /
-- Vercel mgmt API quotas.
--
-- Note on state-name compatibility: the original spec from
-- 20260429000001_hosted_platform.sql used a slightly different vocabulary
-- (SIGNED_IN, SUPABASE_AUTHED, ...). The CHECK constraint below is the union
-- of both vocabularies so historical rows + new rows both validate. The new
-- worker uses only the Plan #5 vocabulary.
-- =============================================================================

ALTER TABLE public.piggyback_provisions
  DROP CONSTRAINT IF EXISTS state_in_known_set;
ALTER TABLE public.piggyback_provisions
  DROP CONSTRAINT IF EXISTS piggyback_provisions_state_check;
ALTER TABLE public.piggyback_provisions
  ADD CONSTRAINT piggyback_provisions_state_check
  CHECK (state IN (
    -- Plan #5 vocabulary (preferred for new provisions)
    'NEW','STRIPE_CHECKOUT_OPEN','STRIPE_PAID',
    'AWAITING_SUPABASE_OAUTH','AWAITING_VERCEL_OAUTH',
    'SUPABASE_CREATING','MIGRATIONS_RUNNING',
    'VERCEL_CREATING','VERCEL_ENV_SET','DOMAIN_ATTACHING','INITIAL_DEPLOY',
    'READY','FAILED_RETRYABLE','FAILED_PERMANENT','CANCELLED',
    -- Legacy vocabulary (retained for back-compat with existing rows)
    'SIGNED_IN','SUPABASE_AUTHED','VERCEL_AUTHED',
    'SUPABASE_PROVISIONED','MIGRATIONS_RUN','VERCEL_PROVISIONED',
    'ENV_VARS_SET','DOMAIN_ATTACHED','UP_PAT_PROVIDED','WEBHOOK_REGISTERED',
    'FAILED'
  ));

ALTER TABLE public.piggyback_provisions
  ADD COLUMN IF NOT EXISTS state_data jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS state_changed_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS retry_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS next_retry_at timestamptz;

COMMENT ON COLUMN public.piggyback_provisions.state_data IS
  'Transient context for the current state — e.g. {supabase_project_ref, vercel_deployment_id, stripe_session_id}. Populated by the worker as the provision advances.';
COMMENT ON COLUMN public.piggyback_provisions.retry_count IS
  'Number of times the worker has retried this provision after a transient failure.';
COMMENT ON COLUMN public.piggyback_provisions.next_retry_at IS
  'Earliest time the worker will pick this provision up again. NULL means immediate.';

-- Worker pickup index — covers the worker's batch query.
CREATE INDEX IF NOT EXISTS provision_state_pickup_idx
  ON public.piggyback_provisions(state, next_retry_at)
  WHERE state IN (
    'FAILED_RETRYABLE','SUPABASE_CREATING','MIGRATIONS_RUNNING',
    'VERCEL_CREATING','VERCEL_ENV_SET','DOMAIN_ATTACHING','INITIAL_DEPLOY'
  );

-- Daily resource-usage counters for cost / quota tracking.
CREATE TABLE IF NOT EXISTS public.provision_resource_usage (
  date date NOT NULL,
  resource_type text NOT NULL,
  call_count integer NOT NULL DEFAULT 0,
  PRIMARY KEY (date, resource_type)
);

ALTER TABLE public.provision_resource_usage ENABLE ROW LEVEL SECURITY;
GRANT ALL ON public.provision_resource_usage TO service_role;

COMMENT ON TABLE public.provision_resource_usage IS
  'Daily counters for Supabase Mgmt API calls, Vercel API calls, and new provisions created. Surfaced in the admin dashboard with quota alerts at 80%.';
