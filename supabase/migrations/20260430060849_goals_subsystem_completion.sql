-- Phase 1 #52 — Goals subsystem completion
--
-- Existing application code already references several columns on
-- savings_goals (description, preparation_checklist, sort_order,
-- estimated_monthly_impact_cents) that were never actually added to the
-- table. Adding them defensively with IF NOT EXISTS so this migration is
-- safe to re-apply.
--
-- New columns specific to this phase:
--   * generated_tasks       — AI-suggested next-step task list (JSON array)
--   * tasks_generated_at    — last regen timestamp (drives 24h cache TTL)
--   * weekday_only_cadence  — settings toggle: skip weekends in deadline math
--   * tasks_input_signature — opaque hash of the goal-state inputs the last
--                             AI call used; lets us cheaply detect when state
--                             has drifted and force a regen.

ALTER TABLE public.savings_goals
  ADD COLUMN IF NOT EXISTS description text,
  ADD COLUMN IF NOT EXISTS preparation_checklist jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS estimated_monthly_impact_cents bigint NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS sort_order integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS generated_tasks jsonb,
  ADD COLUMN IF NOT EXISTS tasks_generated_at timestamp with time zone,
  ADD COLUMN IF NOT EXISTS tasks_input_signature text,
  ADD COLUMN IF NOT EXISTS weekday_only_cadence boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.savings_goals.generated_tasks IS
  'AI-suggested next-step task list. Array of {id,text,priority,done?}. Regenerated when state drifts or 24h has elapsed.';
COMMENT ON COLUMN public.savings_goals.tasks_generated_at IS
  'When generated_tasks was last refreshed. Drives 24h cache to avoid re-spending Anthropic credits on every page load.';
COMMENT ON COLUMN public.savings_goals.tasks_input_signature IS
  'Opaque hash of (current_amount_cents, target_amount_cents, deadline) used when generated_tasks was last produced. If the live signature differs, the cache is treated as stale.';
COMMENT ON COLUMN public.savings_goals.weekday_only_cadence IS
  'Per-goal toggle: when true, "days remaining" calculations skip weekends.';
