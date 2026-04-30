-- Phase 1 #48: Surface global merchant -> category default rules.
--
-- Introduces a `merchant_default_rules` table that stores admin-curated
-- default category mappings for common merchant descriptions. Sync and
-- webhook ingestion paths consult this table when a transaction has no
-- per-user merchant rule and no override.
--
-- Also extends `merchant_category_rules` with:
--   - last_applied_at: updated whenever a sync applies the rule
--   - share_with_everyone: opt-in flag for promoting personal rules to the
--     global default set via the admin queue.

-- ---------------------------------------------------------------------------
-- merchant_default_rules: global, admin-managed defaults
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.merchant_default_rules (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  merchant_pattern text NOT NULL,
  category_id text NOT NULL,
  parent_category_id text,
  source text NOT NULL DEFAULT 'curated',
  -- 'curated' | 'user-suggested' | 'promoted'
  suggested_by_user_id uuid,
  notes text,
  is_active boolean NOT NULL DEFAULT true,
  last_applied_at timestamp with time zone,
  applied_count integer NOT NULL DEFAULT 0,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT merchant_default_rules_pattern_unique UNIQUE (merchant_pattern),
  CONSTRAINT merchant_default_rules_category_fkey
    FOREIGN KEY (category_id) REFERENCES public.categories(id) ON DELETE CASCADE,
  CONSTRAINT merchant_default_rules_parent_category_fkey
    FOREIGN KEY (parent_category_id) REFERENCES public.categories(id),
  CONSTRAINT merchant_default_rules_suggested_by_fkey
    FOREIGN KEY (suggested_by_user_id) REFERENCES public.profiles(id) ON DELETE SET NULL,
  CONSTRAINT merchant_default_rules_source_check
    CHECK (source IN ('curated', 'user-suggested', 'promoted'))
);

CREATE INDEX IF NOT EXISTS idx_merchant_default_rules_active_pattern
  ON public.merchant_default_rules (is_active, merchant_pattern);

CREATE INDEX IF NOT EXISTS idx_merchant_default_rules_source
  ON public.merchant_default_rules (source);

ALTER TABLE public.merchant_default_rules ENABLE ROW LEVEL SECURITY;

-- Anyone authenticated can READ active rules (sync flow needs them).
DROP POLICY IF EXISTS "merchant_default_rules read active"
  ON public.merchant_default_rules;
CREATE POLICY "merchant_default_rules read active"
  ON public.merchant_default_rules
  FOR SELECT
  TO authenticated
  USING (is_active = true);

-- All write operations require service_role; admin gating happens in app code.
-- (Default RLS denies non-service-role writes.)

CREATE TRIGGER set_updated_at_merchant_default_rules
  BEFORE UPDATE ON public.merchant_default_rules
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- ---------------------------------------------------------------------------
-- merchant_category_rules: opt-in sharing + last applied tracking
-- ---------------------------------------------------------------------------
ALTER TABLE public.merchant_category_rules
  ADD COLUMN IF NOT EXISTS share_with_everyone boolean NOT NULL DEFAULT false;

ALTER TABLE public.merchant_category_rules
  ADD COLUMN IF NOT EXISTS last_applied_at timestamp with time zone;

CREATE INDEX IF NOT EXISTS idx_merchant_category_rules_shared
  ON public.merchant_category_rules (share_with_everyone)
  WHERE share_with_everyone = true;

-- ---------------------------------------------------------------------------
-- Function: bump last_applied_at and applied_count for a batch of rules.
-- Called from the sync flow once per sync run (not per transaction) so we
-- don't melt the DB on large syncs.
-- Payload format: jsonb array of {rule_id: uuid, count: integer}.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.increment_merchant_default_rule_applied(
  p_payload jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.merchant_default_rules AS r
     SET last_applied_at = now(),
         applied_count = r.applied_count + COALESCE(p.count, 1)
    FROM jsonb_to_recordset(p_payload) AS p(rule_id uuid, count integer)
   WHERE r.id = p.rule_id;
END;
$$;

REVOKE ALL ON FUNCTION public.increment_merchant_default_rule_applied(jsonb)
  FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.increment_merchant_default_rule_applied(jsonb)
  TO service_role;

-- Mirror function for per-user merchant_category_rules so the admin UI
-- can show which user-defined rules are actively catching transactions.
CREATE OR REPLACE FUNCTION public.touch_merchant_category_rules_applied(
  p_rule_ids uuid[]
)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE public.merchant_category_rules
     SET last_applied_at = now()
   WHERE id = ANY(p_rule_ids);
$$;

REVOKE ALL ON FUNCTION public.touch_merchant_category_rules_applied(uuid[])
  FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.touch_merchant_category_rules_applied(uuid[])
  TO service_role;
