-- 20260501000006_sync_state_machine.sql
--
-- Per-account sync state machine + audit tables.
-- Replaces ad-hoc sync logic with a durable per-account state model
-- that supports reconciliation cron + admin observability.

ALTER TABLE public.accounts
  ADD COLUMN IF NOT EXISTS sync_state text NOT NULL DEFAULT 'IDLE'
    CHECK (sync_state IN ('IDLE','SYNCING','CURRENT','STALE_PARTIAL','SYNC_FAILED_PERMANENT')),
  ADD COLUMN IF NOT EXISTS sync_started_at timestamptz,
  ADD COLUMN IF NOT EXISTS sync_error_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS sync_last_error text;

-- Backfill existing accounts: if last_synced_at IS NULL → IDLE,
-- else CURRENT. Idempotent — only touches rows still in the default IDLE.
UPDATE public.accounts
SET sync_state = CASE
  WHEN last_synced_at IS NULL THEN 'IDLE'
  ELSE 'CURRENT'
END
WHERE sync_state = 'IDLE';

-- Partial index: only the unhealthy states are interesting for cron + admin.
CREATE INDEX IF NOT EXISTS accounts_sync_state_idx ON public.accounts(sync_state)
  WHERE sync_state IN ('STALE_PARTIAL','SYNC_FAILED_PERMANENT');

CREATE TABLE IF NOT EXISTS public.sync_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  trigger text NOT NULL CHECK (trigger IN ('manual','first_connect','reconciliation_cron','webhook_failover')),
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  duration_ms integer,
  total_txns_inserted integer DEFAULT 0,
  total_txns_updated integer DEFAULT 0,
  accounts_succeeded integer DEFAULT 0,
  accounts_partial integer DEFAULT 0,
  accounts_failed integer DEFAULT 0,
  errors jsonb NOT NULL DEFAULT '[]'::jsonb
);
CREATE INDEX IF NOT EXISTS sync_runs_user_started_idx ON public.sync_runs(user_id, started_at DESC);
ALTER TABLE public.sync_runs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users read own sync_runs" ON public.sync_runs;
CREATE POLICY "Users read own sync_runs" ON public.sync_runs
  FOR SELECT TO authenticated USING (user_id = auth.uid());
GRANT SELECT ON public.sync_runs TO authenticated;
GRANT ALL ON public.sync_runs TO service_role;

CREATE TABLE IF NOT EXISTS public.sync_account_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sync_run_id uuid NOT NULL REFERENCES public.sync_runs(id) ON DELETE CASCADE,
  account_id uuid NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  since timestamptz NOT NULL,
  until timestamptz NOT NULL,
  attempt_number integer NOT NULL,
  outcome text NOT NULL CHECK (outcome IN ('success','partial','skipped_window_5xx','persistent_failure','unauthorized')),
  error_message text,
  http_status integer,
  windows_skipped integer DEFAULT 0,
  windows_total integer DEFAULT 0,
  txns_inserted integer DEFAULT 0,
  txns_updated integer DEFAULT 0,
  duration_ms integer
);
CREATE INDEX IF NOT EXISTS sync_account_attempts_account_run_idx
  ON public.sync_account_attempts(account_id, sync_run_id);
ALTER TABLE public.sync_account_attempts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users read own sync_account_attempts" ON public.sync_account_attempts;
CREATE POLICY "Users read own sync_account_attempts"
  ON public.sync_account_attempts FOR SELECT TO authenticated
  USING (
    account_id IN (SELECT id FROM public.accounts WHERE user_id = auth.uid())
  );
GRANT SELECT ON public.sync_account_attempts TO authenticated;
GRANT ALL ON public.sync_account_attempts TO service_role;
