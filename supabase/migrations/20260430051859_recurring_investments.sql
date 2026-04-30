-- recurring_investments — user-defined rules that auto-detect investment
-- contributions when a matching transaction lands via the Up Bank webhook.
--
-- Each row says "every {frequency} starting {anchor_date} I send
-- {amount_cents} to {asset_id} (an investments row), and the matching
-- transaction.description will contain {merchant_pattern}". Detection in
-- src/app/api/upbank/webhook/route.ts performs a case-insensitive substring
-- match and inserts an investment_contributions row with rule_id set.
--
-- Idempotent: re-runnable. Uses CREATE TABLE IF NOT EXISTS, ADD COLUMN IF
-- NOT EXISTS, IF NOT EXISTS on indexes, and DROP-then-CREATE on policies.
-- ON CONFLICT DO NOTHING is not relevant for the table itself (no seed
-- data) but the existing investment_contributions.rule_id column add must
-- also be safe to re-run.

BEGIN;

-- 1. Table -----------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.recurring_investments (
  id              uuid        NOT NULL DEFAULT gen_random_uuid(),
  partnership_id  uuid        NOT NULL,
  asset_id        uuid        NOT NULL,
  amount_cents    integer     NOT NULL CHECK (amount_cents > 0),
  frequency       text        NOT NULL CHECK (
    frequency IN ('weekly', 'fortnightly', 'monthly', 'quarterly', 'yearly')
  ),
  anchor_date     date        NOT NULL,
  merchant_pattern text       NOT NULL CHECK (length(trim(merchant_pattern)) > 0),
  is_active       boolean     NOT NULL DEFAULT true,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT recurring_investments_pkey PRIMARY KEY (id),
  CONSTRAINT recurring_investments_partnership_fkey
    FOREIGN KEY (partnership_id) REFERENCES public.partnerships(id) ON DELETE CASCADE,
  CONSTRAINT recurring_investments_asset_fkey
    FOREIGN KEY (asset_id) REFERENCES public.investments(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_recurring_investments_partnership
  ON public.recurring_investments (partnership_id);

CREATE INDEX IF NOT EXISTS idx_recurring_investments_active_lookup
  ON public.recurring_investments (partnership_id, is_active)
  WHERE is_active = true;

-- 2. Add rule_id to investment_contributions so we can attribute matches ---

ALTER TABLE public.investment_contributions
  ADD COLUMN IF NOT EXISTS rule_id uuid REFERENCES public.recurring_investments(id) ON DELETE SET NULL;

ALTER TABLE public.investment_contributions
  ADD COLUMN IF NOT EXISTS source_transaction_id uuid REFERENCES public.transactions(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_investment_contributions_rule
  ON public.investment_contributions (rule_id, contributed_at DESC)
  WHERE rule_id IS NOT NULL;

-- Prevent duplicate detection inserts: one contribution row per
-- (rule, source transaction) pair. If a webhook re-fires for the same
-- transaction, we want INSERT ON CONFLICT DO NOTHING semantics in code.
CREATE UNIQUE INDEX IF NOT EXISTS uniq_investment_contributions_rule_txn
  ON public.investment_contributions (rule_id, source_transaction_id)
  WHERE rule_id IS NOT NULL AND source_transaction_id IS NOT NULL;

-- 3. updated_at trigger ----------------------------------------------------
-- Reuse the standard "set timestamp" pattern. The function may already
-- exist from earlier migrations; recreate it so this file is standalone.

CREATE OR REPLACE FUNCTION public.set_updated_at_recurring_investments()
RETURNS trigger
LANGUAGE plpgsql
AS $fn$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$fn$;

DROP TRIGGER IF EXISTS trg_recurring_investments_updated_at
  ON public.recurring_investments;

CREATE TRIGGER trg_recurring_investments_updated_at
  BEFORE UPDATE ON public.recurring_investments
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at_recurring_investments();

-- 4. RLS -------------------------------------------------------------------

ALTER TABLE public.recurring_investments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Members can view recurring investments"   ON public.recurring_investments;
DROP POLICY IF EXISTS "Members can insert recurring investments" ON public.recurring_investments;
DROP POLICY IF EXISTS "Members can update recurring investments" ON public.recurring_investments;
DROP POLICY IF EXISTS "Members can delete recurring investments" ON public.recurring_investments;

CREATE POLICY "Members can view recurring investments" ON public.recurring_investments
  FOR SELECT TO authenticated
  USING (partnership_id IN (
    SELECT partnership_id FROM public.partnership_members WHERE user_id = auth.uid()
  ));

CREATE POLICY "Members can insert recurring investments" ON public.recurring_investments
  FOR INSERT TO authenticated
  WITH CHECK (partnership_id IN (
    SELECT partnership_id FROM public.partnership_members WHERE user_id = auth.uid()
  ));

CREATE POLICY "Members can update recurring investments" ON public.recurring_investments
  FOR UPDATE TO authenticated
  USING (partnership_id IN (
    SELECT partnership_id FROM public.partnership_members WHERE user_id = auth.uid()
  ))
  WITH CHECK (partnership_id IN (
    SELECT partnership_id FROM public.partnership_members WHERE user_id = auth.uid()
  ));

CREATE POLICY "Members can delete recurring investments" ON public.recurring_investments
  FOR DELETE TO authenticated
  USING (partnership_id IN (
    SELECT partnership_id FROM public.partnership_members WHERE user_id = auth.uid()
  ));

-- 5. Supabase role grants --------------------------------------------------
-- Mirror the access patterns used by the existing investment tables:
-- service_role (webhook) needs full DML, authenticated needs CRUD for the
-- /invest UI, anon should never touch this table.

GRANT SELECT, INSERT, UPDATE, DELETE ON public.recurring_investments TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.recurring_investments TO service_role;
REVOKE ALL ON public.recurring_investments FROM anon;

COMMIT;
