-- =============================================================================
-- Goals: track start_amount_cents for delta-aware progress
-- =============================================================================
-- The plan calls for (current - start) / (target - start) instead of
-- current / target. This matters when a user links an existing Saver to a
-- goal — without the start amount, progress shows ~100% from day one
-- because current_amount_cents = the existing balance.
--
-- Strategy:
--   - Add start_amount_cents (bigint, NOT NULL, default 0).
--   - Existing rows get 0 (formula degrades to current/target — same as today).
--   - New goals created via the action capture the linked-account balance
--     at the moment of creation.
-- =============================================================================

ALTER TABLE public.savings_goals
  ADD COLUMN IF NOT EXISTS start_amount_cents bigint NOT NULL DEFAULT 0;

COMMENT ON COLUMN public.savings_goals.start_amount_cents
  IS 'Amount in the goal (or its linked account) at goal creation. Used as the denominator anchor in progress calc: (current - start) / (target - start). 0 means "use current/target instead" for back-compat.';
