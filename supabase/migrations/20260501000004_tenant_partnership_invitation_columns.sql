-- 20260501000004_tenant_partnership_invitation_columns.sql
-- Spec: docs/superpowers/specs/2026-05-01-02-identity-and-partner-claims-design.md
--
-- Tenant-side migration. Adds the manual-partner invitation tracking columns
-- to the local partnerships table. The token here is a copy of the canonical
-- value held in the orchestrator's partner_claim_invitations row; storing it
-- locally lets the inviter cancel a pending invite without having to round-
-- trip through the orchestrator just to look it up.
--
-- Apply to dev tenant Supabase (kbdmwkhpzrkivzjzlzzr) ONLY. Never apply to
-- the orchestrator DB.

ALTER TABLE public.partnerships
  ADD COLUMN IF NOT EXISTS manual_partner_email text,
  ADD COLUMN IF NOT EXISTS manual_partner_invited_at timestamptz,
  ADD COLUMN IF NOT EXISTS manual_partner_claim_token uuid;

CREATE INDEX IF NOT EXISTS partnerships_manual_partner_email_idx
  ON public.partnerships(lower(manual_partner_email))
  WHERE manual_partner_email IS NOT NULL;

COMMENT ON COLUMN public.partnerships.manual_partner_email IS
  'Email entered by the inviter when sending a partner invitation. Stored locally so the inviter UI can show "pending invite to X@Y" without orchestrator round-trip.';

COMMENT ON COLUMN public.partnerships.manual_partner_invited_at IS
  'Timestamp the partner invitation email was last queued. NULL if no invite is outstanding.';

COMMENT ON COLUMN public.partnerships.manual_partner_claim_token IS
  'Token shared with orchestrator partner_claim_invitations. Local copy lets the inviter cancel without round-tripping.';
