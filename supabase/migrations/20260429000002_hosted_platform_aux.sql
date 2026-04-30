-- Auxiliary tables for the hosted-platform launch.

-- 1. launch_subscribers — landing-page email-capture form
CREATE TABLE IF NOT EXISTS public.launch_subscribers (
  email text PRIMARY KEY,
  source text NOT NULL DEFAULT 'landing-hero',
  subscribed_at timestamptz NOT NULL DEFAULT now(),
  notified_at timestamptz
);

ALTER TABLE public.launch_subscribers ENABLE ROW LEVEL SECURITY;
-- Service role only (no user-facing reads/writes).

-- 2. activity_overrides — generic field-level overrides for transaction display
--    fields beyond the dedicated category/share/note tables. Used when a user
--    wants to rename a merchant, add a custom subtitle, mark "exclude from
--    budget", etc. — anywhere we want overrides to survive a webhook re-sync.
--
--    The existing schema already has:
--      transaction_category_overrides — category overrides
--      transaction_share_overrides    — partner-share overrides
--      transaction_notes              — markdown notes
--    so this table covers the long tail.
CREATE TABLE IF NOT EXISTS public.activity_overrides (
  transaction_id uuid PRIMARY KEY REFERENCES public.transactions(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  -- Override fields. Each is nullable; null means "use the bank value".
  merchant_display_name text,
  subtitle text,
  exclude_from_budget boolean,
  exclude_from_net_worth boolean,
  custom_color text,
  custom_emoji text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS activity_overrides_user_idx
  ON public.activity_overrides (user_id);

ALTER TABLE public.activity_overrides ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users read their own activity overrides"
  ON public.activity_overrides FOR SELECT USING (user_id = auth.uid());
CREATE POLICY "Users insert their own activity overrides"
  ON public.activity_overrides FOR INSERT WITH CHECK (user_id = auth.uid());
CREATE POLICY "Users update their own activity overrides"
  ON public.activity_overrides FOR UPDATE USING (user_id = auth.uid());
CREATE POLICY "Users delete their own activity overrides"
  ON public.activity_overrides FOR DELETE USING (user_id = auth.uid());

-- Auto-update updated_at when the row changes
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'activity_overrides_updated_at') THEN
    CREATE TRIGGER activity_overrides_updated_at
      BEFORE UPDATE ON public.activity_overrides
      FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
  END IF;
END $$;
