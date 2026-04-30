-- =============================================================================
-- Phase 3.2 — Subdomain alias table for vanity-rename 301 redirects.
-- =============================================================================
--
-- When a user renames their subdomain (e.g. j7k2p9 → benl), we don't immediately
-- release the old hostname. Instead we record an alias row that points the old
-- name at the live provision for a 30-day grace window so links shared in the
-- wild (or browser history) keep working as a 301 redirect.
--
-- After the grace window expires, a cron sweep:
--   1. Calls Vercel's removeProjectDomain on the old hostname (via the user's
--      stored OAuth token).
--   2. Deletes the alias row.
--
-- We don't touch this table from middleware on every request — instead we look
-- the hostname up against piggyback_provisions.subdomain_short_id /
-- subdomain_vanity first (current names) and fall through to subdomain_aliases
-- only when the request is for an old name.
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.subdomain_aliases (
  -- The retired subdomain label (e.g. "j7k2p9" or an old vanity).
  -- We don't store the full hostname; the suffix is always .piggyback.finance.
  alias text PRIMARY KEY,

  -- The provision this alias is currently redirecting to. ON DELETE CASCADE so
  -- if we tear down a tenant, their old aliases vanish with them.
  provision_id uuid NOT NULL REFERENCES public.piggyback_provisions(id) ON DELETE CASCADE,

  -- When this alias was created (i.e. when the user renamed away from it).
  -- Used together with expires_at to compute the redirect window.
  created_at timestamptz NOT NULL DEFAULT now(),

  -- When the alias should be released by the cron sweep. Default: 30 days.
  -- Stored explicitly so we can extend or shorten the grace per-row if needed.
  expires_at timestamptz NOT NULL,

  -- "shortid" or "vanity" — not strictly necessary for redirects but nice for
  -- audit / admin display.
  kind text NOT NULL,

  CONSTRAINT subdomain_alias_format CHECK (
    alias ~ '^[a-z0-9]([a-z0-9-]{1,30}[a-z0-9])?$'
  ),
  CONSTRAINT subdomain_alias_kind_known CHECK (kind IN ('shortid', 'vanity'))
);

CREATE INDEX IF NOT EXISTS subdomain_aliases_provision_idx
  ON public.subdomain_aliases (provision_id);
CREATE INDEX IF NOT EXISTS subdomain_aliases_expires_idx
  ON public.subdomain_aliases (expires_at);

ALTER TABLE public.subdomain_aliases ENABLE ROW LEVEL SECURITY;
-- Service role only — no anon/authenticated policies. Reads happen from the
-- middleware via service-role client.
