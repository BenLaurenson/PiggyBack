-- 20260501000005_onboarding_state_machine.sql
-- Spec:  docs/superpowers/specs/2026-05-01-03-onboarding-state-machine-design.md
-- Plan:  docs/superpowers/plans/2026-05-01-03-onboarding-state-machine-plan.md
--
-- Replaces the FE-managed `profiles.onboarding_steps_completed` array with a
-- BE-driven state machine on `profiles.onboarding_state`. The old column is
-- kept around as a deprecated derived field for one release so other surfaces
-- (admin/funnel queries, anything still reading the array) don't break.

-- 1. New columns on profiles ---------------------------------------------------
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS onboarding_state text NOT NULL DEFAULT 'PROVISIONING'
    CHECK (onboarding_state IN (
      'PROVISIONING','PROFILE','BANK','INCOME','AI','PARTNER','READY','ABANDONED'
    )),
  ADD COLUMN IF NOT EXISTS onboarding_started_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS onboarding_state_changed_at timestamptz NOT NULL DEFAULT now();

-- 2. Audit table ---------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.onboarding_state_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  from_state text,
  to_state text NOT NULL,
  reason text NOT NULL,
  occurred_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS onboarding_state_audit_user_id_idx
  ON public.onboarding_state_audit(user_id, occurred_at DESC);

ALTER TABLE public.onboarding_state_audit ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can read their own onboarding audit" ON public.onboarding_state_audit;
CREATE POLICY "Users can read their own onboarding audit"
  ON public.onboarding_state_audit
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

GRANT SELECT ON public.onboarding_state_audit TO authenticated;
GRANT ALL    ON public.onboarding_state_audit TO service_role;

-- 3. Optimistic-concurrency state transition function -------------------------
-- Two devices racing to advance state both call this; only the call where
-- onboarding_state still equals p_from will win. The losing call sees the
-- (already-advanced) current state and the FE just renders the truth.
CREATE OR REPLACE FUNCTION public.advance_onboarding_state(
  p_user_id uuid,
  p_from    text,
  p_to      text,
  p_reason  text DEFAULT 'user_action'
)
RETURNS text   -- the resulting state (could be the original if WHERE didn't match)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  current_state text;
BEGIN
  UPDATE public.profiles
  SET onboarding_state            = p_to,
      onboarding_state_changed_at = now()
  WHERE id                = p_user_id
    AND onboarding_state  = p_from
  RETURNING onboarding_state INTO current_state;

  IF current_state IS NOT NULL THEN
    INSERT INTO public.onboarding_state_audit (user_id, from_state, to_state, reason)
    VALUES (p_user_id, p_from, p_to, p_reason);
    RETURN current_state;
  END IF;

  -- WHERE clause didn't match — return whatever the actual state is so the
  -- caller can reconcile on the FE.
  SELECT onboarding_state INTO current_state
  FROM public.profiles
  WHERE id = p_user_id;
  RETURN current_state;
END;
$$;

REVOKE ALL ON FUNCTION public.advance_onboarding_state(uuid, text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.advance_onboarding_state(uuid, text, text, text)
  TO authenticated, service_role;

-- 4. Forced-set transition (for cron / admin) ---------------------------------
-- The optimistic-concurrency function above requires the caller to know the
-- current state. The abandonment cron doesn't care about the prior state —
-- if the row sat untouched for 7+ days, force it to ABANDONED. Same for an
-- admin "reset onboarding" button.
CREATE OR REPLACE FUNCTION public.force_set_onboarding_state(
  p_user_id uuid,
  p_to      text,
  p_reason  text
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  old_state text;
BEGIN
  SELECT onboarding_state INTO old_state
  FROM public.profiles
  WHERE id = p_user_id;

  IF old_state IS NULL THEN
    RETURN NULL;
  END IF;

  UPDATE public.profiles
  SET onboarding_state            = p_to,
      onboarding_state_changed_at = now()
  WHERE id = p_user_id;

  INSERT INTO public.onboarding_state_audit (user_id, from_state, to_state, reason)
  VALUES (p_user_id, old_state, p_to, p_reason);

  RETURN p_to;
END;
$$;

REVOKE ALL ON FUNCTION public.force_set_onboarding_state(uuid, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.force_set_onboarding_state(uuid, text, text)
  TO service_role;

-- 5. Backfill existing rows ---------------------------------------------------
-- Map current state to the new enum.  has_onboarded=true takes precedence —
-- those users are already in the app and shouldn't see the wizard.  Otherwise
-- the highest completed step in the legacy array determines the next step.
UPDATE public.profiles
SET onboarding_state = CASE
  WHEN has_onboarded = true THEN 'READY'
  WHEN 'ai'      = ANY(onboarding_steps_completed) THEN 'PARTNER'
  WHEN 'income'  = ANY(onboarding_steps_completed) THEN 'AI'
  WHEN 'bank'    = ANY(onboarding_steps_completed) THEN 'INCOME'
  WHEN 'profile' = ANY(onboarding_steps_completed) THEN 'BANK'
  WHEN display_name IS NOT NULL AND display_name <> '' THEN 'BANK'
  ELSE 'PROFILE'
END
WHERE onboarding_state = 'PROVISIONING';  -- only freshly-defaulted rows

COMMENT ON COLUMN public.profiles.onboarding_steps_completed IS
  'DEPRECATED — kept for one release for backwards compat with admin/funnel queries. New code should read profiles.onboarding_state instead.';
