-- 20260501000001_orchestrator_partner_links.sql
-- Spec: docs/superpowers/specs/2026-05-01-01-data-architecture-design.md
-- + docs/superpowers/specs/2026-05-01-02-identity-and-partner-claims-design.md
--
-- Pairs of provisions that share a 2Up partnership. Lives ONLY on the
-- orchestrator DB. Never apply to tenant Supabases — there's no
-- piggyback_provisions there to FK against.
--
-- Note: piggyback_provisions identifies users via google_sub/email (Google
-- OAuth on the orchestrator), NOT via auth.uid(). Reads happen only through
-- service-role-authorized API routes that resolve the caller's provision
-- via google_sub. We therefore enable RLS but rely on service-role grants —
-- matching the pattern used by piggyback_provisions itself.

CREATE TABLE IF NOT EXISTS public.partner_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  initiator_provision_id uuid NOT NULL REFERENCES public.piggyback_provisions(id) ON DELETE CASCADE,
  acceptor_provision_id  uuid NOT NULL REFERENCES public.piggyback_provisions(id) ON DELETE CASCADE,
  status text NOT NULL CHECK (status IN ('pending','active','severed','rejected')),
  initiated_at timestamptz NOT NULL DEFAULT now(),
  active_at timestamptz,
  severed_at timestamptz,
  severed_by_provision_id uuid REFERENCES public.piggyback_provisions(id) ON DELETE SET NULL,
  consent_aggregate_view boolean NOT NULL DEFAULT true,
  consent_transaction_view boolean NOT NULL DEFAULT false,
  CHECK (initiator_provision_id <> acceptor_provision_id)
);

-- Only one active or pending link per pair, regardless of who initiated.
CREATE UNIQUE INDEX IF NOT EXISTS partner_links_unique_pair
  ON public.partner_links (
    LEAST(initiator_provision_id, acceptor_provision_id),
    GREATEST(initiator_provision_id, acceptor_provision_id)
  )
  WHERE status IN ('pending', 'active');

CREATE INDEX IF NOT EXISTS partner_links_initiator_idx ON public.partner_links(initiator_provision_id);
CREATE INDEX IF NOT EXISTS partner_links_acceptor_idx  ON public.partner_links(acceptor_provision_id);

ALTER TABLE public.partner_links ENABLE ROW LEVEL SECURITY;

-- Only service-role reads/writes. No authenticated/anon policies — direct
-- reads go via admin/orchestrator API routes that authorize against the
-- caller's google_sub + matching piggyback_provisions row.
GRANT ALL ON public.partner_links TO service_role;
REVOKE ALL ON public.partner_links FROM anon;
REVOKE ALL ON public.partner_links FROM authenticated;

COMMENT ON TABLE public.partner_links IS
  'Pairs of provisions sharing a 2Up partnership. Orchestrator-only — do NOT apply to tenant Supabases.';
