-- 20260501000003_tenant_partnership_members_remote_mirror.sql
-- Spec: docs/superpowers/specs/2026-05-01-02-identity-and-partner-claims-design.md
--
-- Tenant-side migration. When a real-partner claim completes, the orchestrator
-- fans out to BOTH tenant Supabases and inserts a partnership_members row that
-- mirrors the partner who lives in the OTHER tenant. The actual partner data
-- lives in their tenant; this row exists for FK integrity so partnership-id
-- scoped queries continue to work locally.
--
-- Apply to dev tenant Supabase (kbdmwkhpzrkivzjzlzzr) ONLY. Never apply to
-- the orchestrator DB (trwmouxmrlwasxxdlntq is prod and not in scope here).

ALTER TABLE public.partnership_members
  ADD COLUMN IF NOT EXISTS is_remote_mirror boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS remote_provision_id uuid;

CREATE INDEX IF NOT EXISTS partnership_members_remote_idx
  ON public.partnership_members(remote_provision_id)
  WHERE is_remote_mirror = true;

COMMENT ON COLUMN public.partnership_members.is_remote_mirror IS
  'When true, this row mirrors a partner who lives in a different tenant Supabase. The actual data lives in their tenant; this row exists for FK integrity. remote_provision_id points to orchestrator piggyback_provisions.id.';

COMMENT ON COLUMN public.partnership_members.remote_provision_id IS
  'When is_remote_mirror=true, points to orchestrator piggyback_provisions.id for fan-out lookups. NULL for local non-mirror rows.';
