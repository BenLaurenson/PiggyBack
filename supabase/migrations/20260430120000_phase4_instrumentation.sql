-- Phase 4 instrumentation: funnel events, cancellation feedback, retention tracking
-- Adds the analytics tables that back the in-app funnel dashboard so the data is
-- self-hostable without depending on a third-party (PostHog) being available.

-- ============================================================================
-- funnel_events: every provisioning + activation event we mirror locally
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.funnel_events (
  id          uuid        NOT NULL DEFAULT extensions.uuid_generate_v4() PRIMARY KEY,
  event_name  text        NOT NULL,
  -- Either user_id OR anonymous_id is set. user_id is preferred once known.
  user_id     uuid        REFERENCES auth.users(id) ON DELETE SET NULL,
  anonymous_id text,
  -- For multi-tenant funnel analytics. Nullable until tenant_ready fires.
  tenant_id   uuid,
  properties  jsonb       NOT NULL DEFAULT '{}'::jsonb,
  created_at  timestamptz NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS funnel_events_event_name_created_at_idx
  ON public.funnel_events(event_name, created_at DESC);

CREATE INDEX IF NOT EXISTS funnel_events_user_id_idx
  ON public.funnel_events(user_id) WHERE user_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS funnel_events_anonymous_id_idx
  ON public.funnel_events(anonymous_id) WHERE anonymous_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS funnel_events_created_at_idx
  ON public.funnel_events(created_at DESC);

ALTER TABLE public.funnel_events ENABLE ROW LEVEL SECURITY;

-- No SELECT policy by default: funnel data is admin-only and is read via the
-- service role from /admin/funnel and /api/admin/*. Inserts go through the
-- service role too (server-side track() helper), but we still allow the user
-- to insert their own row for client-fired events.
CREATE POLICY "users_insert_own_funnel_events"
  ON public.funnel_events
  FOR INSERT
  WITH CHECK (
    -- Allow the row if user_id matches the authenticated user, OR if the row
    -- is purely anonymous (no user_id set). Anonymous landing-page events
    -- don't have an authenticated session yet.
    (auth.uid() IS NOT NULL AND user_id = auth.uid())
    OR (auth.uid() IS NULL AND user_id IS NULL)
  );

COMMENT ON TABLE public.funnel_events IS
  'Phase 4 instrumentation: provisioning funnel + activation events. '
  'Mirrors what we send to PostHog so /admin/funnel works without a third party.';


-- ============================================================================
-- cancellation_feedback: free-text feedback from /account/cancel
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.cancellation_feedback (
  id           uuid        NOT NULL DEFAULT extensions.uuid_generate_v4() PRIMARY KEY,
  user_id      uuid        REFERENCES auth.users(id) ON DELETE SET NULL,
  email        text,
  -- Stripe-style reason code (matches Stripe Customer Portal cancellation_reason
  -- enum: 'too_expensive' | 'missing_features' | 'switched_service' | 'unused' |
  -- 'customer_service' | 'too_complex' | 'low_quality' | 'other'). Free text
  -- when reason isn't one of the canned options.
  reason       text,
  feedback     text        NOT NULL,
  created_at   timestamptz NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS cancellation_feedback_created_at_idx
  ON public.cancellation_feedback(created_at DESC);

CREATE INDEX IF NOT EXISTS cancellation_feedback_user_id_idx
  ON public.cancellation_feedback(user_id) WHERE user_id IS NOT NULL;

ALTER TABLE public.cancellation_feedback ENABLE ROW LEVEL SECURITY;

-- Users can insert their own feedback.
CREATE POLICY "users_insert_own_cancellation_feedback"
  ON public.cancellation_feedback
  FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL AND user_id = auth.uid());

-- Users can read their own feedback (so the cancel-confirmation page can
-- show "we got it" without leaking other users' rows).
CREATE POLICY "users_read_own_cancellation_feedback"
  ON public.cancellation_feedback
  FOR SELECT
  USING (auth.uid() IS NOT NULL AND user_id = auth.uid());

COMMENT ON TABLE public.cancellation_feedback IS
  'Phase 4 instrumentation: free-text "anything we should know?" feedback '
  'captured at the /account/cancel confirmation page.';


-- ============================================================================
-- last_seen_at on profiles: powers cron-computed returned_d1/d7/d30 events
-- ============================================================================
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS last_seen_at timestamptz;

CREATE INDEX IF NOT EXISTS profiles_last_seen_at_idx
  ON public.profiles(last_seen_at DESC) WHERE last_seen_at IS NOT NULL;

COMMENT ON COLUMN public.profiles.last_seen_at IS
  'Phase 4 instrumentation: bumped by middleware on each authenticated '
  'request. Cron uses this to compute returned_d1/d7/d30 retention events.';
