-- 20260501000002_orchestrator_partner_claim_invitations.sql
-- Spec: docs/superpowers/specs/2026-05-01-02-identity-and-partner-claims-design.md
--
-- Pending partner-claim invitations issued by an existing user. When the
-- invitee signs up at piggyback.finance with the matching email, the
-- orchestrator detects the invitation and prompts them to accept.
-- Orchestrator-only.

CREATE TABLE IF NOT EXISTS public.partner_claim_invitations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invitee_email text NOT NULL CHECK (invitee_email ~ '^[^@]+@[^@]+\.[^@]+$'),
  invited_by_provision_id uuid NOT NULL REFERENCES public.piggyback_provisions(id) ON DELETE CASCADE,
  invited_by_partnership_id uuid NOT NULL,
  manual_partner_name text,
  token uuid NOT NULL UNIQUE DEFAULT gen_random_uuid(),
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '7 days'),
  claimed_at timestamptz,
  claimed_provision_id uuid REFERENCES public.piggyback_provisions(id) ON DELETE SET NULL,
  rejected_at timestamptz,
  CHECK (claimed_at IS NULL OR rejected_at IS NULL)
);

CREATE INDEX IF NOT EXISTS partner_claim_invitations_token_idx
  ON public.partner_claim_invitations(token)
  WHERE claimed_at IS NULL AND rejected_at IS NULL;

CREATE INDEX IF NOT EXISTS partner_claim_invitations_pending_by_email_idx
  ON public.partner_claim_invitations(lower(invitee_email))
  WHERE claimed_at IS NULL AND rejected_at IS NULL;

CREATE INDEX IF NOT EXISTS partner_claim_invitations_inviter_idx
  ON public.partner_claim_invitations(invited_by_provision_id);

ALTER TABLE public.partner_claim_invitations ENABLE ROW LEVEL SECURITY;

-- Service-role-only access. The orchestrator identifies users via google_sub
-- (Google OAuth), not auth.uid(); reads happen through orchestrator API
-- routes that authorize against the caller's provision row. Same pattern as
-- piggyback_provisions / partner_links.
GRANT ALL ON public.partner_claim_invitations TO service_role;
REVOKE ALL ON public.partner_claim_invitations FROM anon;
REVOKE ALL ON public.partner_claim_invitations FROM authenticated;

COMMENT ON TABLE public.partner_claim_invitations IS
  'Pending partner-claim invitations. Orchestrator-only.';
