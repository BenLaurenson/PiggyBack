-- =============================================================================
-- Hosted-platform tables: provisioning state machine, OAuth token vault,
-- Stripe subscription tracking, subdomain assignment.
-- =============================================================================
--
-- These tables exist on the **piggyback.finance marketing/orchestrator**
-- Supabase project — NOT on each hosted user's per-tenant Supabase project.
-- A single row per hosted user lives here; the actual app data lives in their
-- own Supabase project that we provision for them.
--
-- All OAuth tokens (Vercel + Supabase OAuth refresh tokens) are encrypted at
-- rest with PROVISIONER_ENCRYPTION_KEY (separate from UP_API_ENCRYPTION_KEY,
-- because rotating one shouldn't blow up the other).
--
-- The Up Bank PAT is *never* stored here. It's pasted into the user's own
-- deployment in their own Supabase, encrypted with their app's key.
-- =============================================================================

-- 1. piggyback_provisions — one row per signup attempt, tracks state machine
CREATE TABLE IF NOT EXISTS public.piggyback_provisions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Identity (from Google sign-in)
  google_sub text NOT NULL,                  -- subject claim from Google ID token
  email text NOT NULL,
  display_name text,
  avatar_url text,

  -- State machine — see src/lib/provisioner/state-machine.ts
  -- States: NEW, SIGNED_IN, SUPABASE_AUTHED, VERCEL_AUTHED,
  --         SUPABASE_PROVISIONED, MIGRATIONS_RUN, VERCEL_PROVISIONED,
  --         ENV_VARS_SET, DOMAIN_ATTACHED, UP_PAT_PROVIDED,
  --         WEBHOOK_REGISTERED, READY, FAILED, CANCELLED
  state text NOT NULL DEFAULT 'NEW',
  state_detail text,                          -- last error or status message
  state_updated_at timestamptz NOT NULL DEFAULT now(),

  -- Subdomain assignment
  subdomain_short_id text UNIQUE,             -- e.g. "j7k2p9" → j7k2p9.piggyback.finance
  subdomain_vanity text UNIQUE,               -- optional user-chosen name
  subdomain_vanity_set_at timestamptz,        -- rate-limit changes (max 1/30d)

  -- Per-tenant provisioned resources (we only need refs, not secrets)
  supabase_org_id text,                       -- the user's Supabase org we authorized into
  supabase_project_ref text,                  -- the project we created for them
  supabase_project_url text,
  vercel_team_id text,                        -- the user's Vercel team
  vercel_project_id text,                     -- the project we created for them
  vercel_deployment_url text,                 -- their *.vercel.app URL (pre-domain-attach)

  -- Stripe subscription
  stripe_customer_id text UNIQUE,
  stripe_subscription_id text UNIQUE,
  subscription_status text,                   -- active, past_due, canceled, etc.
  subscription_canceled_at timestamptz,
  subscription_current_period_end timestamptz,
  -- Grace period for subdomain teardown after cancel (default 14 days)
  subdomain_teardown_at timestamptz,

  -- Audit
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT subdomain_short_id_format CHECK (
    subdomain_short_id IS NULL OR subdomain_short_id ~ '^[a-z0-9]{4,12}$'
  ),
  CONSTRAINT subdomain_vanity_format CHECK (
    subdomain_vanity IS NULL OR subdomain_vanity ~ '^[a-z0-9]([a-z0-9-]{1,30}[a-z0-9])?$'
  ),
  CONSTRAINT state_in_known_set CHECK (
    state IN (
      'NEW', 'SIGNED_IN',
      'SUPABASE_AUTHED', 'VERCEL_AUTHED',
      'SUPABASE_PROVISIONED', 'MIGRATIONS_RUN',
      'VERCEL_PROVISIONED', 'ENV_VARS_SET', 'DOMAIN_ATTACHED',
      'UP_PAT_PROVIDED', 'WEBHOOK_REGISTERED',
      'READY', 'FAILED', 'CANCELLED'
    )
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS piggyback_provisions_google_sub_idx
  ON public.piggyback_provisions (google_sub);
CREATE INDEX IF NOT EXISTS piggyback_provisions_email_idx
  ON public.piggyback_provisions (email);
CREATE INDEX IF NOT EXISTS piggyback_provisions_state_idx
  ON public.piggyback_provisions (state);

-- 2. provision_oauth_tokens — encrypted vault of OAuth refresh tokens
CREATE TABLE IF NOT EXISTS public.provision_oauth_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provision_id uuid NOT NULL REFERENCES public.piggyback_provisions(id) ON DELETE CASCADE,

  -- Provider: 'supabase' | 'vercel'
  provider text NOT NULL,

  -- Encrypted with PROVISIONER_ENCRYPTION_KEY. Format: iv:authTag:ciphertext (hex).
  encrypted_access_token text NOT NULL,
  encrypted_refresh_token text,
  access_token_expires_at timestamptz,

  -- For Vercel, the integration_configuration_id from the Connect URL.
  external_config_id text,
  -- Scopes granted (whitespace-separated).
  scopes text,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  UNIQUE (provision_id, provider),
  CONSTRAINT provider_known CHECK (provider IN ('supabase', 'vercel'))
);

CREATE INDEX IF NOT EXISTS provision_oauth_tokens_provision_idx
  ON public.provision_oauth_tokens (provision_id);

-- 3. provision_audit — append-only event log for support / debugging
CREATE TABLE IF NOT EXISTS public.provision_audit (
  id bigserial PRIMARY KEY,
  provision_id uuid NOT NULL REFERENCES public.piggyback_provisions(id) ON DELETE CASCADE,
  event text NOT NULL,
  detail jsonb,
  occurred_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS provision_audit_provision_idx
  ON public.provision_audit (provision_id, occurred_at DESC);

-- 4. provision_health_checks — per-deployment health status
CREATE TABLE IF NOT EXISTS public.provision_health_checks (
  provision_id uuid PRIMARY KEY REFERENCES public.piggyback_provisions(id) ON DELETE CASCADE,
  last_checked_at timestamptz NOT NULL DEFAULT now(),
  last_status_code integer,
  last_response_time_ms integer,
  last_error text,
  consecutive_failures integer NOT NULL DEFAULT 0
);

-- 5. RLS
ALTER TABLE public.piggyback_provisions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.provision_oauth_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.provision_audit ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.provision_health_checks ENABLE ROW LEVEL SECURITY;

-- Only the service role (provisioner backend + admin page) reads/writes these.
-- No anon/authenticated policies — direct dashboard reads should go via admin
-- API routes that authorize against an admin allow-list.

-- Helpful trigger to auto-update updated_at
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'piggyback_provisions_updated_at'
  ) THEN
    CREATE TRIGGER piggyback_provisions_updated_at
      BEFORE UPDATE ON public.piggyback_provisions
      FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'provision_oauth_tokens_updated_at'
  ) THEN
    CREATE TRIGGER provision_oauth_tokens_updated_at
      BEFORE UPDATE ON public.provision_oauth_tokens
      FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
  END IF;
END $$;
