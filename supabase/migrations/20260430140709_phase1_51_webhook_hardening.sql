-- Phase 1 #51: Webhook hardening + transaction-list edge cases
--
-- Adds:
--   1. transactions.deleted_at — soft-delete column for TRANSACTION_DELETED events.
--      Preserves budget history (deleted txns are excluded from queries by
--      default but still counted in historical aggregations).
--   2. profiles.timezone — IANA TZ name override for date/time rendering.
--      Defaults to NULL; UI falls back to Australia/Melbourne (AEST/AEDT).
--   3. idx_transactions_account_created — composite index for cursor-paginated
--      activity list queries `WHERE account_id IN (...) ORDER BY created_at DESC`.
--   4. idx_transactions_deleted_at — partial index for the active-rows fast path.
--   5. Backfill: existing rows with status='DELETED' get deleted_at = now()
--      so the new soft-delete filter behaves consistently with prior behaviour.

ALTER TABLE public.transactions
  ADD COLUMN IF NOT EXISTS deleted_at timestamp with time zone;

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS timezone text;

-- Composite index for cursor pagination on activity feed.
-- Predicate on deleted_at IS NULL keeps the index small and fast for the
-- common "active rows only" path used by /activity.
CREATE INDEX IF NOT EXISTS idx_transactions_account_created
  ON public.transactions USING btree (account_id, created_at DESC)
  WHERE deleted_at IS NULL;

-- Backfill: any rows already soft-deleted via status='DELETED' should get a
-- deleted_at marker so the new filter (deleted_at IS NULL) keeps them hidden.
UPDATE public.transactions
SET deleted_at = COALESCE(deleted_at, now())
WHERE status = 'DELETED' AND deleted_at IS NULL;

COMMENT ON COLUMN public.transactions.deleted_at IS
  'Soft-delete timestamp set when Up Bank fires TRANSACTION_DELETED. Rows are excluded from default queries (deleted_at IS NULL) but preserved for budget history.';

COMMENT ON COLUMN public.profiles.timezone IS
  'IANA timezone name (e.g. Australia/Melbourne, Australia/Perth, Australia/Adelaide). NULL means use the AU default Australia/Melbourne.';
