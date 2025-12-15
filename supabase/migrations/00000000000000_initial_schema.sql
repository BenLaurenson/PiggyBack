-- PiggyBack: Consolidated Initial Schema Migration
-- Generated from the live database on 2026-02-25
-- Security hardened on 2026-02-27 (14 migrations consolidated)

-- ============================================================================
-- 1. EXTENSIONS
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS "pgcrypto" WITH SCHEMA extensions;

-- ============================================================================
-- 2. PRIVATE SCHEMA
-- ============================================================================

CREATE SCHEMA IF NOT EXISTS private;

-- ============================================================================
-- 3. PUBLIC FUNCTIONS
-- ============================================================================

CREATE OR REPLACE FUNCTION public.handle_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
begin
  new.updated_at = timezone('utc'::text, now());
  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  insert into public.profiles (id, email, display_name)
  values (new.id, new.email, new.raw_user_meta_data->>'display_name');
  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION public.handle_new_profile()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  new_partnership_id uuid;
  existing_partnership_id uuid;
BEGIN
  SELECT pm.partnership_id INTO existing_partnership_id
  FROM public.partnership_members pm
  WHERE pm.user_id = new.id
  LIMIT 1;

  IF existing_partnership_id IS NOT NULL THEN
    RETURN new;
  END IF;

  INSERT INTO public.partnerships (name)
  VALUES ('My Budget')
  RETURNING id INTO new_partnership_id;

  INSERT INTO public.partnership_members (partnership_id, user_id, role)
  VALUES (new_partnership_id, new.id, 'owner');

  RETURN new;
END;
$function$;

CREATE OR REPLACE FUNCTION public.update_share_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.update_user_budgets_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$function$;

-- Partnership-scoped trigger: only deletes expense_matches where the
-- transaction owner is in the same partnership as the expense_definition.
CREATE OR REPLACE FUNCTION public.invalidate_expense_match_on_recategorize()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
BEGIN
  IF NEW.category_id IS DISTINCT FROM OLD.category_id OR
     NEW.parent_category_id IS DISTINCT FROM OLD.parent_category_id THEN
    DELETE FROM public.expense_matches em
    WHERE em.transaction_id = NEW.id
      AND em.expense_definition_id IN (
        SELECT ed.id
        FROM public.expense_definitions ed
        INNER JOIN public.partnership_members pm
          ON pm.partnership_id = ed.partnership_id
        INNER JOIN public.accounts a
          ON a.user_id = pm.user_id
        WHERE a.id = NEW.account_id
      );
  END IF;
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.upsert_up_api_config(p_user_id uuid, p_encrypted_token text)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_config_id UUID;
BEGIN
  IF auth.uid() IS NULL OR auth.uid() != p_user_id THEN
    RAISE EXCEPTION 'Unauthorized: Can only update own config';
  END IF;

  INSERT INTO public.up_api_configs (user_id, encrypted_token, is_active)
  VALUES (p_user_id, p_encrypted_token, true)
  ON CONFLICT (user_id)
  DO UPDATE SET
    encrypted_token = EXCLUDED.encrypted_token,
    is_active = true,
    updated_at = now()
  RETURNING id INTO v_config_id;

  RETURN json_build_object(
    'success', true,
    'config_id', v_config_id
  );
EXCEPTION WHEN OTHERS THEN
  RETURN json_build_object(
    'success', false,
    'error', SQLERRM
  );
END;
$function$;

-- NOTE: merge_partnerships function removed (dead code with data loss bugs).
-- If partnership merging is needed in the future, it must be reimplemented
-- with full table coverage.

-- ============================================================================
-- 4. TABLES (in dependency order)
-- ============================================================================

-- profiles (referenced by many tables)
-- NOTE: alpha_vantage_* columns removed (dead code, replaced by Yahoo Finance + CoinGecko)
CREATE TABLE public.profiles (
  id uuid NOT NULL,
  email text NOT NULL,
  display_name text,
  avatar_url text,
  theme_preference text DEFAULT 'light'::text,
  created_at timestamp with time zone NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at timestamp with time zone NOT NULL DEFAULT timezone('utc'::text, now()),
  budget_view_preference text DEFAULT 'shared'::text,
  budget_period_preference text DEFAULT 'monthly'::text,
  budget_methodology text DEFAULT 'zero-based'::text,
  ai_provider text DEFAULT 'google'::text,
  ai_api_key text,
  ai_model text,
  has_onboarded boolean NOT NULL DEFAULT false,
  onboarded_at timestamp with time zone,
  onboarding_steps_completed _text DEFAULT '{}'::text[],
  tour_completed boolean NOT NULL DEFAULT false,
  tour_dismissed boolean NOT NULL DEFAULT false,
  date_of_birth date,
  target_retirement_age integer,
  super_balance_cents bigint DEFAULT 0,
  super_contribution_rate numeric DEFAULT 11.5,
  expected_return_rate numeric DEFAULT 7.0,
  fire_variant text DEFAULT 'regular'::text,
  annual_expense_override_cents bigint,
  fire_onboarded boolean DEFAULT false,
  notification_preferences jsonb DEFAULT '{"price_changes": {"enabled": true}, "weekly_summary": {"enabled": false, "timezone": "Australia/Melbourne", "send_time": "08:00", "day_of_week": "sunday"}, "goal_milestones": {"enabled": true}, "payment_reminders": {"enabled": true, "timezone": "Australia/Melbourne", "lead_days": 3, "send_time": "09:00"}}'::jsonb,
  outside_super_return_rate numeric,
  income_growth_rate numeric DEFAULT 0,
  spending_growth_rate numeric DEFAULT 0
);

-- partnerships
CREATE TABLE public.partnerships (
  id uuid NOT NULL DEFAULT uuid_generate_v4(),
  name text NOT NULL DEFAULT 'Our Budget'::text,
  created_at timestamp with time zone NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at timestamp with time zone NOT NULL DEFAULT timezone('utc'::text, now()),
  budget_setup_completed_at timestamp with time zone,
  manual_partner_name text,
  manual_partner_dob date,
  manual_partner_target_retirement_age integer,
  manual_partner_super_balance_cents bigint DEFAULT 0,
  manual_partner_super_contribution_rate numeric DEFAULT 11.5
);

-- partnership_members
CREATE TABLE public.partnership_members (
  id uuid NOT NULL DEFAULT uuid_generate_v4(),
  partnership_id uuid NOT NULL,
  user_id uuid NOT NULL,
  role text DEFAULT 'member'::text,
  joined_at timestamp with time zone NOT NULL DEFAULT timezone('utc'::text, now())
);

-- categories
CREATE TABLE public.categories (
  id text NOT NULL,
  name text NOT NULL,
  parent_category_id text,
  created_at timestamp with time zone NOT NULL DEFAULT timezone('utc'::text, now())
);

-- tags
CREATE TABLE public.tags (
  name text NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT timezone('utc'::text, now())
);

-- category_mappings
CREATE TABLE public.category_mappings (
  id uuid NOT NULL DEFAULT uuid_generate_v4(),
  up_category_id text NOT NULL,
  new_parent_name text NOT NULL,
  new_child_name text NOT NULL,
  icon text NOT NULL,
  display_order integer DEFAULT 0,
  created_at timestamp with time zone NOT NULL DEFAULT timezone('utc'::text, now())
);

-- accounts
CREATE TABLE public.accounts (
  id uuid NOT NULL DEFAULT uuid_generate_v4(),
  user_id uuid NOT NULL,
  up_account_id text NOT NULL,
  display_name text NOT NULL,
  account_type text NOT NULL,
  ownership_type text NOT NULL,
  balance_cents bigint NOT NULL DEFAULT 0,
  currency_code text NOT NULL DEFAULT 'AUD'::text,
  is_active boolean DEFAULT true,
  last_synced_at timestamp with time zone,
  created_at timestamp with time zone NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at timestamp with time zone NOT NULL DEFAULT timezone('utc'::text, now())
);

-- transactions
CREATE TABLE public.transactions (
  id uuid NOT NULL DEFAULT uuid_generate_v4(),
  account_id uuid NOT NULL,
  up_transaction_id text NOT NULL,
  description text NOT NULL,
  raw_text text,
  message text,
  amount_cents bigint NOT NULL,
  currency_code text NOT NULL DEFAULT 'AUD'::text,
  status text NOT NULL,
  category_id text,
  parent_category_id text,
  settled_at timestamp with time zone,
  created_at timestamp with time zone NOT NULL DEFAULT timezone('utc'::text, now()),
  hold_info_amount_cents bigint,
  hold_info_foreign_amount_cents bigint,
  hold_info_foreign_currency_code text,
  round_up_amount_cents bigint,
  round_up_boost_cents bigint,
  cashback_amount_cents bigint,
  cashback_description text,
  foreign_amount_cents bigint,
  foreign_currency_code text,
  card_purchase_method text,
  card_number_suffix text,
  transfer_account_id uuid,
  is_categorizable boolean DEFAULT true,
  transaction_type text,
  deep_link_url text,
  is_income boolean DEFAULT false,
  income_type text,
  linked_pay_schedule_id uuid,
  is_one_off_income boolean DEFAULT false,
  is_internal_transfer boolean DEFAULT false,
  internal_transfer_type text,
  performing_customer text,
  is_shared boolean DEFAULT false
);

-- transaction_tags
CREATE TABLE public.transaction_tags (
  id uuid NOT NULL DEFAULT uuid_generate_v4(),
  transaction_id uuid NOT NULL,
  tag_name text NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT timezone('utc'::text, now())
);

-- transaction_notes
CREATE TABLE public.transaction_notes (
  id uuid NOT NULL DEFAULT uuid_generate_v4(),
  transaction_id uuid NOT NULL,
  user_id uuid NOT NULL,
  note text NOT NULL,
  is_partner_visible boolean DEFAULT true,
  created_at timestamp with time zone NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at timestamp with time zone NOT NULL DEFAULT timezone('utc'::text, now())
);

-- transaction_references
CREATE TABLE public.transaction_references (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  up_transaction_id text NOT NULL,
  reference_type text NOT NULL,
  reference_id uuid NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT timezone('utc'::text, now())
);

-- transaction_category_overrides
CREATE TABLE public.transaction_category_overrides (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  transaction_id uuid NOT NULL,
  original_category_id text,
  original_parent_category_id text,
  override_category_id text,
  override_parent_category_id text,
  changed_by uuid,
  changed_at timestamp with time zone DEFAULT now(),
  notes text,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now()
);

-- transaction_share_overrides
CREATE TABLE public.transaction_share_overrides (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  transaction_id text NOT NULL,
  partnership_id uuid NOT NULL,
  share_percentage integer NOT NULL,
  is_shared boolean NOT NULL DEFAULT true,
  notes text,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now()
);

-- budgets
CREATE TABLE public.budgets (
  id uuid NOT NULL DEFAULT uuid_generate_v4(),
  partnership_id uuid NOT NULL,
  category_id text,
  category_name text NOT NULL,
  monthly_limit_cents bigint NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at timestamp with time zone NOT NULL DEFAULT timezone('utc'::text, now())
);

-- savings_goals
CREATE TABLE public.savings_goals (
  id uuid NOT NULL DEFAULT uuid_generate_v4(),
  partnership_id uuid NOT NULL,
  name text NOT NULL,
  target_amount_cents bigint NOT NULL,
  current_amount_cents bigint NOT NULL DEFAULT 0,
  deadline date,
  linked_account_id uuid,
  icon text DEFAULT 'piggy-bank'::text,
  color text DEFAULT '#8884d8'::text,
  is_completed boolean DEFAULT false,
  completed_at timestamp with time zone,
  created_at timestamp with time zone NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at timestamp with time zone NOT NULL DEFAULT timezone('utc'::text, now())
);

-- investments
CREATE TABLE public.investments (
  id uuid NOT NULL DEFAULT uuid_generate_v4(),
  partnership_id uuid NOT NULL,
  asset_type text NOT NULL,
  name text NOT NULL,
  ticker_symbol text,
  quantity numeric,
  purchase_value_cents bigint,
  current_value_cents bigint NOT NULL,
  currency_code text NOT NULL DEFAULT 'AUD'::text,
  notes text,
  created_at timestamp with time zone NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at timestamp with time zone NOT NULL DEFAULT timezone('utc'::text, now())
);

-- investment_history
CREATE TABLE public.investment_history (
  id uuid NOT NULL DEFAULT uuid_generate_v4(),
  investment_id uuid NOT NULL,
  value_cents bigint NOT NULL,
  recorded_at timestamp with time zone NOT NULL DEFAULT timezone('utc'::text, now())
);

-- investment_contributions
CREATE TABLE public.investment_contributions (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  investment_id uuid NOT NULL,
  partnership_id uuid NOT NULL,
  amount_cents integer NOT NULL,
  contributed_at timestamp with time zone NOT NULL DEFAULT now(),
  notes text,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

-- user_budgets
-- NOTE: total_budget is stored in cents (e.g. 500000 = $5,000)
CREATE TABLE public.user_budgets (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  partnership_id uuid NOT NULL,
  name text NOT NULL,
  emoji text DEFAULT '💰'::text,
  budget_type text NOT NULL DEFAULT 'personal'::text,
  methodology text NOT NULL DEFAULT 'zero-based'::text,
  budget_view text NOT NULL DEFAULT 'shared'::text,
  period_type text NOT NULL DEFAULT 'monthly'::text,
  is_active boolean DEFAULT true,
  is_default boolean DEFAULT false,
  color text,
  template_source text,
  category_filter jsonb,
  created_by uuid,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  total_budget numeric,
  start_date date,
  end_date date,
  carryover_mode text NOT NULL DEFAULT 'spending-based'::text,
  slug text NOT NULL
);
COMMENT ON COLUMN public.user_budgets.total_budget IS 'Total budget cap in cents (e.g. 500000 = $5,000)';

-- budget_assignments
CREATE TABLE public.budget_assignments (
  id uuid NOT NULL DEFAULT uuid_generate_v4(),
  partnership_id uuid NOT NULL,
  month date NOT NULL,
  category_name text NOT NULL,
  assigned_cents bigint NOT NULL DEFAULT 0,
  notes text,
  created_by uuid,
  created_at timestamp with time zone NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at timestamp with time zone NOT NULL DEFAULT timezone('utc'::text, now()),
  assignment_type text DEFAULT 'category'::text,
  goal_id uuid,
  asset_id uuid,
  subcategory_name text,
  stored_period_type text DEFAULT 'monthly'::text,
  rollover boolean DEFAULT true,
  budget_view text DEFAULT 'shared'::text,
  budget_id uuid
);

-- budget_months
CREATE TABLE public.budget_months (
  id uuid NOT NULL DEFAULT uuid_generate_v4(),
  partnership_id uuid NOT NULL,
  month date NOT NULL,
  income_total_cents bigint NOT NULL DEFAULT 0,
  assigned_total_cents bigint NOT NULL DEFAULT 0,
  carryover_from_previous_cents bigint NOT NULL DEFAULT 0,
  notes text,
  created_at timestamp with time zone NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at timestamp with time zone NOT NULL DEFAULT timezone('utc'::text, now()),
  budget_id uuid
);

-- budget_category_shares
CREATE TABLE public.budget_category_shares (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  partnership_id uuid NOT NULL,
  category_name text NOT NULL,
  share_percentage integer NOT NULL DEFAULT 50,
  is_shared boolean NOT NULL DEFAULT false,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now()
);

-- budget_item_preferences
CREATE TABLE public.budget_item_preferences (
  id uuid NOT NULL DEFAULT uuid_generate_v4(),
  partnership_id uuid NOT NULL,
  user_id uuid NOT NULL,
  category_name text NOT NULL,
  is_visible boolean DEFAULT true,
  display_order integer,
  created_at timestamp with time zone NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at timestamp with time zone NOT NULL DEFAULT timezone('utc'::text, now()),
  item_type text DEFAULT 'category'::text,
  goal_id uuid,
  asset_id uuid,
  budget_id uuid
);

-- budget_layout_presets
CREATE TABLE public.budget_layout_presets (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  partnership_id uuid NOT NULL,
  name text NOT NULL DEFAULT 'My Layout'::text,
  description text,
  is_active boolean DEFAULT false,
  is_template boolean DEFAULT false,
  template_author_id uuid,
  layout_config jsonb NOT NULL DEFAULT '{"columns": [{"id": "item", "name": "Item", "width": 300, "locked": true, "visible": true, "displayOrder": 0}, {"id": "assigned", "name": "Assigned", "width": 120, "visible": true, "displayOrder": 1}, {"id": "spent", "name": "Spent", "width": 120, "visible": true, "displayOrder": 2}, {"id": "progress", "name": "Progress", "width": 150, "visible": true, "displayOrder": 3}], "density": "comfortable", "groupBy": "none", "sections": []}'::jsonb,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  last_used_at timestamp with time zone DEFAULT now(),
  budget_view text DEFAULT 'shared'::text,
  budget_id uuid
);

-- income_sources
CREATE TABLE public.income_sources (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  partnership_id uuid,
  name text NOT NULL,
  source_type text NOT NULL,
  one_off_type text,
  amount_cents integer NOT NULL,
  frequency text,
  last_pay_date date,
  next_pay_date date,
  expected_date date,
  received_date date,
  is_received boolean DEFAULT false,
  linked_transaction_id uuid,
  match_pattern text,
  notes text,
  is_active boolean DEFAULT true,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  linked_up_transaction_id text,
  is_manual_partner_income boolean DEFAULT false
);

-- expense_definitions
CREATE TABLE public.expense_definitions (
  id uuid NOT NULL DEFAULT uuid_generate_v4(),
  partnership_id uuid NOT NULL,
  name text NOT NULL,
  category_name text NOT NULL,
  expected_amount_cents bigint NOT NULL,
  recurrence_type text NOT NULL,
  next_due_date date NOT NULL,
  auto_detected boolean DEFAULT false,
  match_pattern text,
  is_active boolean DEFAULT true,
  emoji text DEFAULT '💰'::text,
  notes text,
  created_by uuid,
  created_at timestamp with time zone NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at timestamp with time zone NOT NULL DEFAULT timezone('utc'::text, now()),
  linked_up_transaction_id text,
  merchant_name text
);

-- expense_matches
CREATE TABLE public.expense_matches (
  id uuid NOT NULL DEFAULT uuid_generate_v4(),
  expense_definition_id uuid NOT NULL,
  transaction_id uuid NOT NULL,
  match_confidence numeric DEFAULT 1.0,
  matched_at timestamp with time zone NOT NULL DEFAULT timezone('utc'::text, now()),
  matched_by uuid,
  for_period date
);

-- couple_split_settings
CREATE TABLE public.couple_split_settings (
  id uuid NOT NULL DEFAULT uuid_generate_v4(),
  partnership_id uuid NOT NULL,
  category_name text,
  expense_definition_id uuid,
  split_type text NOT NULL,
  owner_percentage numeric,
  notes text,
  created_at timestamp with time zone NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at timestamp with time zone NOT NULL DEFAULT timezone('utc'::text, now())
);

-- up_api_configs
CREATE TABLE public.up_api_configs (
  id uuid NOT NULL DEFAULT uuid_generate_v4(),
  user_id uuid NOT NULL,
  encrypted_token text NOT NULL,
  is_active boolean DEFAULT true,
  last_synced_at timestamp with time zone,
  created_at timestamp with time zone NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at timestamp with time zone NOT NULL DEFAULT timezone('utc'::text, now()),
  webhook_id text,
  webhook_secret text,
  webhook_url text
);

-- user_dashboard_charts
CREATE TABLE public.user_dashboard_charts (
  id uuid NOT NULL DEFAULT uuid_generate_v4(),
  user_id uuid NOT NULL,
  chart_type text NOT NULL,
  title text NOT NULL,
  category_filter _text DEFAULT '{}'::text[],
  time_period text NOT NULL DEFAULT 'this-month'::text,
  display_order integer NOT NULL DEFAULT 0,
  created_at timestamp with time zone NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at timestamp with time zone NOT NULL DEFAULT timezone('utc'::text, now()),
  grid_width integer DEFAULT 6,
  grid_height integer DEFAULT 3,
  grid_x integer DEFAULT 0,
  grid_y integer DEFAULT 0
);

-- milestones
CREATE TABLE public.milestones (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  partnership_id uuid NOT NULL,
  title text NOT NULL,
  description text,
  target_date date NOT NULL,
  estimated_cost_cents bigint DEFAULT 0,
  estimated_monthly_impact_cents bigint DEFAULT 0,
  icon text DEFAULT 'target'::text,
  color text DEFAULT 'var(--pastel-blue)'::text,
  is_completed boolean DEFAULT false,
  completed_at timestamp with time zone,
  preparation_checklist jsonb DEFAULT '[]'::jsonb,
  sort_order integer DEFAULT 0,
  created_by uuid,
  created_at timestamp with time zone NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at timestamp with time zone NOT NULL DEFAULT timezone('utc'::text, now())
);

-- annual_checkups
CREATE TABLE public.annual_checkups (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  partnership_id uuid NOT NULL,
  financial_year integer NOT NULL,
  current_step integer DEFAULT 1,
  step_data jsonb DEFAULT '{}'::jsonb,
  action_items jsonb DEFAULT '[]'::jsonb,
  started_at timestamp with time zone NOT NULL DEFAULT timezone('utc'::text, now()),
  completed_at timestamp with time zone,
  created_by uuid,
  created_at timestamp with time zone NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at timestamp with time zone NOT NULL DEFAULT timezone('utc'::text, now())
);

-- net_worth_snapshots
CREATE TABLE public.net_worth_snapshots (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  partnership_id uuid NOT NULL,
  snapshot_date date NOT NULL,
  total_balance_cents bigint NOT NULL DEFAULT 0,
  account_breakdown jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  investment_total_cents bigint DEFAULT 0
);

-- target_allocations
CREATE TABLE public.target_allocations (
  id uuid NOT NULL DEFAULT uuid_generate_v4(),
  partnership_id uuid NOT NULL,
  asset_type text NOT NULL,
  target_percentage numeric NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at timestamp with time zone NOT NULL DEFAULT timezone('utc'::text, now())
);

-- watchlist_items
CREATE TABLE public.watchlist_items (
  id uuid NOT NULL DEFAULT uuid_generate_v4(),
  partnership_id uuid NOT NULL,
  asset_type text NOT NULL,
  name text NOT NULL,
  ticker_symbol text,
  notes text,
  last_price_cents bigint,
  last_price_updated_at timestamp with time zone,
  created_at timestamp with time zone NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at timestamp with time zone NOT NULL DEFAULT timezone('utc'::text, now())
);

-- partner_link_requests
CREATE TABLE public.partner_link_requests (
  id uuid NOT NULL DEFAULT uuid_generate_v4(),
  shared_up_account_id text NOT NULL,
  requester_user_id uuid NOT NULL,
  target_user_id uuid NOT NULL,
  status text NOT NULL DEFAULT 'pending'::text,
  primary_partnership_id uuid,
  created_at timestamp with time zone NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at timestamp with time zone NOT NULL DEFAULT timezone('utc'::text, now())
);

-- notifications
CREATE TABLE public.notifications (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  type text NOT NULL,
  title text NOT NULL,
  message text NOT NULL,
  metadata jsonb DEFAULT '{}'::jsonb,
  read boolean NOT NULL DEFAULT false,
  actioned boolean NOT NULL DEFAULT false,
  created_at timestamp with time zone NOT NULL DEFAULT timezone('utc'::text, now())
);

-- merchant_category_rules
CREATE TABLE public.merchant_category_rules (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  merchant_description text NOT NULL,
  category_id text NOT NULL,
  parent_category_id text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- methodology_customizations
CREATE TABLE public.methodology_customizations (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  partnership_id uuid NOT NULL,
  user_id uuid,
  methodology_name text NOT NULL,
  custom_categories jsonb NOT NULL DEFAULT '[]'::jsonb,
  hidden_subcategories jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now()
);

-- category_pin_states
CREATE TABLE public.category_pin_states (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  partnership_id uuid NOT NULL,
  user_id uuid NOT NULL,
  methodology_name text NOT NULL,
  pinned_categories jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now()
);

-- goal_contributions (tracks fund additions to savings goals)
CREATE TABLE public.goal_contributions (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  goal_id uuid NOT NULL,
  amount_cents bigint NOT NULL,
  balance_after_cents bigint NOT NULL DEFAULT 0,
  source text NOT NULL DEFAULT 'manual',
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT goal_contributions_pkey PRIMARY KEY (id),
  CONSTRAINT goal_contributions_goal_id_fkey
    FOREIGN KEY (goal_id) REFERENCES public.savings_goals(id) ON DELETE CASCADE,
  CONSTRAINT goal_contributions_source_check
    CHECK (source IN ('manual', 'webhook_sync', 'budget_allocation', 'initial'))
);

-- ============================================================================
-- 4b. SQL FUNCTIONS (require tables to exist for validation)
-- ============================================================================

CREATE OR REPLACE FUNCTION private.get_partner_user_ids(user_uuid uuid)
 RETURNS TABLE(user_id uuid)
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
  SELECT DISTINCT pm2.user_id
  FROM public.partnership_members pm1
  JOIN public.partnership_members pm2 ON pm1.partnership_id = pm2.partnership_id
  WHERE pm1.user_id = user_uuid;
$function$;

CREATE OR REPLACE FUNCTION private.get_user_partnerships(user_uuid uuid)
 RETURNS TABLE(partnership_id uuid)
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
  SELECT partnership_id
  FROM public.partnership_members
  WHERE user_id = user_uuid;
$function$;

CREATE OR REPLACE FUNCTION public.get_effective_category_id(p_transaction_id uuid)
 RETURNS text
 LANGUAGE sql
 STABLE
AS $function$
  SELECT COALESCE(tco.override_category_id, t.category_id)
  FROM transactions t
  LEFT JOIN transaction_category_overrides tco ON tco.transaction_id = t.id
  WHERE t.id = p_transaction_id;
$function$;

-- Atomic goal fund addition to prevent read-modify-write race condition.
-- Atomically increments current_amount_cents and returns the new values.
CREATE OR REPLACE FUNCTION public.add_funds_to_goal(
  p_goal_id uuid,
  p_partnership_id uuid,
  p_amount_cents integer
)
RETURNS TABLE (
  new_amount_cents bigint,
  target_amount_cents bigint,
  goal_name text
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE savings_goals
  SET
    current_amount_cents = current_amount_cents + p_amount_cents,
    is_completed = (current_amount_cents + p_amount_cents) >= savings_goals.target_amount_cents,
    completed_at = CASE
      WHEN (current_amount_cents + p_amount_cents) >= savings_goals.target_amount_cents
        THEN now()
      ELSE NULL
    END,
    updated_at = now()
  WHERE id = p_goal_id
    AND partnership_id = p_partnership_id
  RETURNING
    savings_goals.current_amount_cents AS new_amount_cents,
    savings_goals.target_amount_cents,
    savings_goals.name AS goal_name;
$$;

-- Atomic notification preferences merge using jsonb || for deep-merge.
CREATE OR REPLACE FUNCTION public.merge_notification_preferences(
  p_user_id uuid,
  p_prefs jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  UPDATE public.profiles
  SET
    notification_preferences = COALESCE(notification_preferences, '{}'::jsonb) || p_prefs,
    updated_at = now()
  WHERE id = p_user_id;
END;
$$;

-- Optimistic concurrency update for methodology_customizations.
-- Returns the updated row if updated_at matches, empty if stale.
CREATE OR REPLACE FUNCTION public.update_methodology_customization(
  p_partnership_id uuid,
  p_user_id uuid,
  p_methodology_name text,
  p_custom_categories jsonb,
  p_hidden_subcategories jsonb,
  p_expected_updated_at timestamptz DEFAULT NULL
)
RETURNS SETOF public.methodology_customizations
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF p_expected_updated_at IS NULL THEN
    RETURN QUERY
    INSERT INTO public.methodology_customizations (
      partnership_id, user_id, methodology_name,
      custom_categories, hidden_subcategories, updated_at
    )
    VALUES (
      p_partnership_id, p_user_id, p_methodology_name,
      p_custom_categories, p_hidden_subcategories, now()
    )
    ON CONFLICT (partnership_id, user_id, methodology_name)
    DO UPDATE SET
      custom_categories = EXCLUDED.custom_categories,
      hidden_subcategories = EXCLUDED.hidden_subcategories,
      updated_at = now()
    RETURNING *;
  ELSE
    RETURN QUERY
    UPDATE public.methodology_customizations
    SET
      custom_categories = p_custom_categories,
      hidden_subcategories = p_hidden_subcategories,
      updated_at = now()
    WHERE partnership_id = p_partnership_id
      AND (
        (p_user_id IS NULL AND user_id IS NULL)
        OR user_id = p_user_id
      )
      AND methodology_name = p_methodology_name
      AND updated_at = p_expected_updated_at
    RETURNING *;
  END IF;
END;
$$;

-- ============================================================================
-- 5. PRIMARY KEYS
-- ============================================================================

ALTER TABLE public.profiles ADD CONSTRAINT profiles_pkey PRIMARY KEY (id);
ALTER TABLE public.partnerships ADD CONSTRAINT partnerships_pkey PRIMARY KEY (id);
ALTER TABLE public.partnership_members ADD CONSTRAINT partnership_members_pkey PRIMARY KEY (id);
ALTER TABLE public.categories ADD CONSTRAINT categories_pkey PRIMARY KEY (id);
ALTER TABLE public.tags ADD CONSTRAINT tags_pkey PRIMARY KEY (name);
ALTER TABLE public.category_mappings ADD CONSTRAINT category_mappings_pkey PRIMARY KEY (id);
ALTER TABLE public.accounts ADD CONSTRAINT accounts_pkey PRIMARY KEY (id);
ALTER TABLE public.transactions ADD CONSTRAINT transactions_pkey PRIMARY KEY (id);
ALTER TABLE public.transaction_tags ADD CONSTRAINT transaction_tags_pkey PRIMARY KEY (id);
ALTER TABLE public.transaction_notes ADD CONSTRAINT transaction_notes_pkey PRIMARY KEY (id);
ALTER TABLE public.transaction_references ADD CONSTRAINT transaction_references_pkey PRIMARY KEY (id);
ALTER TABLE public.transaction_category_overrides ADD CONSTRAINT transaction_category_overrides_pkey PRIMARY KEY (id);
ALTER TABLE public.transaction_share_overrides ADD CONSTRAINT transaction_share_overrides_pkey PRIMARY KEY (id);
ALTER TABLE public.budgets ADD CONSTRAINT budgets_pkey PRIMARY KEY (id);
ALTER TABLE public.savings_goals ADD CONSTRAINT savings_goals_pkey PRIMARY KEY (id);
ALTER TABLE public.investments ADD CONSTRAINT investments_pkey PRIMARY KEY (id);
ALTER TABLE public.investment_history ADD CONSTRAINT investment_history_pkey PRIMARY KEY (id);
ALTER TABLE public.investment_contributions ADD CONSTRAINT investment_contributions_pkey PRIMARY KEY (id);
ALTER TABLE public.user_budgets ADD CONSTRAINT user_budgets_pkey PRIMARY KEY (id);
ALTER TABLE public.budget_assignments ADD CONSTRAINT budget_assignments_pkey PRIMARY KEY (id);
ALTER TABLE public.budget_months ADD CONSTRAINT budget_months_pkey PRIMARY KEY (id);
ALTER TABLE public.budget_category_shares ADD CONSTRAINT budget_category_shares_pkey PRIMARY KEY (id);
ALTER TABLE public.budget_item_preferences ADD CONSTRAINT budget_category_preferences_pkey PRIMARY KEY (id);
ALTER TABLE public.budget_layout_presets ADD CONSTRAINT budget_layout_presets_pkey PRIMARY KEY (id);
ALTER TABLE public.income_sources ADD CONSTRAINT income_sources_pkey PRIMARY KEY (id);
ALTER TABLE public.expense_definitions ADD CONSTRAINT expense_definitions_pkey PRIMARY KEY (id);
ALTER TABLE public.expense_matches ADD CONSTRAINT expense_matches_pkey PRIMARY KEY (id);
ALTER TABLE public.couple_split_settings ADD CONSTRAINT couple_split_settings_pkey PRIMARY KEY (id);
ALTER TABLE public.up_api_configs ADD CONSTRAINT up_api_configs_pkey PRIMARY KEY (id);
ALTER TABLE public.user_dashboard_charts ADD CONSTRAINT user_dashboard_charts_pkey PRIMARY KEY (id);
ALTER TABLE public.milestones ADD CONSTRAINT milestones_pkey PRIMARY KEY (id);
ALTER TABLE public.annual_checkups ADD CONSTRAINT annual_checkups_pkey PRIMARY KEY (id);
ALTER TABLE public.net_worth_snapshots ADD CONSTRAINT net_worth_snapshots_pkey PRIMARY KEY (id);
ALTER TABLE public.target_allocations ADD CONSTRAINT target_allocations_pkey PRIMARY KEY (id);
ALTER TABLE public.watchlist_items ADD CONSTRAINT watchlist_items_pkey PRIMARY KEY (id);
ALTER TABLE public.partner_link_requests ADD CONSTRAINT partner_link_requests_pkey PRIMARY KEY (id);
ALTER TABLE public.notifications ADD CONSTRAINT notifications_pkey PRIMARY KEY (id);
ALTER TABLE public.merchant_category_rules ADD CONSTRAINT merchant_category_rules_pkey PRIMARY KEY (id);
ALTER TABLE public.methodology_customizations ADD CONSTRAINT methodology_customizations_pkey PRIMARY KEY (id);
ALTER TABLE public.category_pin_states ADD CONSTRAINT category_pin_states_pkey PRIMARY KEY (id);

-- ============================================================================
-- 6. UNIQUE CONSTRAINTS
-- ============================================================================

ALTER TABLE public.accounts ADD CONSTRAINT accounts_user_id_up_account_id_key UNIQUE (user_id, up_account_id);
ALTER TABLE public.annual_checkups ADD CONSTRAINT annual_checkups_partnership_id_financial_year_key UNIQUE (partnership_id, financial_year);
ALTER TABLE public.budget_category_shares ADD CONSTRAINT budget_category_shares_partnership_id_category_name_key UNIQUE (partnership_id, category_name);
ALTER TABLE public.budget_item_preferences ADD CONSTRAINT budget_category_preferences_user_id_partnership_id_category_key UNIQUE (user_id, partnership_id, category_name);
ALTER TABLE public.budgets ADD CONSTRAINT budgets_partnership_id_category_id_key UNIQUE (partnership_id, category_id);
ALTER TABLE public.category_mappings ADD CONSTRAINT category_mappings_up_category_id_key UNIQUE (up_category_id);
ALTER TABLE public.category_pin_states ADD CONSTRAINT category_pin_states_partnership_id_user_id_methodology_name_key UNIQUE (partnership_id, user_id, methodology_name);
ALTER TABLE public.couple_split_settings ADD CONSTRAINT couple_split_settings_partnership_id_category_name_expense__key UNIQUE (partnership_id, category_name, expense_definition_id);
ALTER TABLE public.expense_matches ADD CONSTRAINT expense_matches_transaction_id_key UNIQUE (transaction_id);
ALTER TABLE public.merchant_category_rules ADD CONSTRAINT merchant_category_rules_user_id_merchant_description_key UNIQUE (user_id, merchant_description);
ALTER TABLE public.methodology_customizations ADD CONSTRAINT methodology_customizations_partnership_id_user_id_methodolo_key UNIQUE (partnership_id, user_id, methodology_name);
ALTER TABLE public.net_worth_snapshots ADD CONSTRAINT net_worth_snapshots_partnership_id_snapshot_date_key UNIQUE (partnership_id, snapshot_date);
ALTER TABLE public.partner_link_requests ADD CONSTRAINT partner_link_requests_shared_up_account_id_requester_user_i_key UNIQUE (shared_up_account_id, requester_user_id, target_user_id);
ALTER TABLE public.partnership_members ADD CONSTRAINT partnership_members_partnership_id_user_id_key UNIQUE (partnership_id, user_id);
ALTER TABLE public.target_allocations ADD CONSTRAINT target_allocations_partnership_id_asset_type_key UNIQUE (partnership_id, asset_type);
ALTER TABLE public.transaction_category_overrides ADD CONSTRAINT transaction_category_overrides_transaction_id_key UNIQUE (transaction_id);
ALTER TABLE public.transaction_share_overrides ADD CONSTRAINT transaction_share_overrides_transaction_id_partnership_id_key UNIQUE (transaction_id, partnership_id);
ALTER TABLE public.transaction_tags ADD CONSTRAINT transaction_tags_transaction_id_tag_name_key UNIQUE (transaction_id, tag_name);
ALTER TABLE public.transactions ADD CONSTRAINT transactions_account_id_up_transaction_id_key UNIQUE (account_id, up_transaction_id);
ALTER TABLE public.up_api_configs ADD CONSTRAINT up_api_configs_user_id_key UNIQUE (user_id);

-- Unique constraint with COALESCE expression
CREATE UNIQUE INDEX budget_months_partnership_budget_month_key ON public.budget_months (partnership_id, month, COALESCE(budget_id, '00000000-0000-0000-0000-000000000000'::uuid));

-- ============================================================================
-- 7. FOREIGN KEYS
-- ============================================================================

ALTER TABLE public.accounts ADD CONSTRAINT accounts_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;
ALTER TABLE public.annual_checkups ADD CONSTRAINT annual_checkups_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.profiles(id) ON DELETE SET NULL;
ALTER TABLE public.annual_checkups ADD CONSTRAINT annual_checkups_partnership_id_fkey FOREIGN KEY (partnership_id) REFERENCES public.partnerships(id) ON DELETE CASCADE;
ALTER TABLE public.budget_assignments ADD CONSTRAINT budget_assignments_asset_id_fkey FOREIGN KEY (asset_id) REFERENCES public.investments(id) ON DELETE CASCADE;
ALTER TABLE public.budget_assignments ADD CONSTRAINT budget_assignments_budget_id_fkey FOREIGN KEY (budget_id) REFERENCES public.user_budgets(id) ON DELETE CASCADE;
ALTER TABLE public.budget_assignments ADD CONSTRAINT budget_assignments_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.profiles(id) ON DELETE SET NULL;
ALTER TABLE public.budget_assignments ADD CONSTRAINT budget_assignments_goal_id_fkey FOREIGN KEY (goal_id) REFERENCES public.savings_goals(id) ON DELETE CASCADE;
ALTER TABLE public.budget_assignments ADD CONSTRAINT budget_assignments_partnership_id_fkey FOREIGN KEY (partnership_id) REFERENCES public.partnerships(id) ON DELETE CASCADE;
ALTER TABLE public.budget_category_shares ADD CONSTRAINT budget_category_shares_partnership_id_fkey FOREIGN KEY (partnership_id) REFERENCES public.partnerships(id) ON DELETE CASCADE;
ALTER TABLE public.budget_item_preferences ADD CONSTRAINT budget_category_preferences_partnership_id_fkey FOREIGN KEY (partnership_id) REFERENCES public.partnerships(id) ON DELETE CASCADE;
ALTER TABLE public.budget_item_preferences ADD CONSTRAINT budget_category_preferences_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;
ALTER TABLE public.budget_item_preferences ADD CONSTRAINT budget_item_preferences_asset_id_fkey FOREIGN KEY (asset_id) REFERENCES public.investments(id) ON DELETE CASCADE;
ALTER TABLE public.budget_item_preferences ADD CONSTRAINT budget_item_preferences_budget_id_fkey FOREIGN KEY (budget_id) REFERENCES public.user_budgets(id) ON DELETE CASCADE;
ALTER TABLE public.budget_item_preferences ADD CONSTRAINT budget_item_preferences_goal_id_fkey FOREIGN KEY (goal_id) REFERENCES public.savings_goals(id) ON DELETE CASCADE;
ALTER TABLE public.budget_layout_presets ADD CONSTRAINT budget_layout_presets_budget_id_fkey FOREIGN KEY (budget_id) REFERENCES public.user_budgets(id) ON DELETE CASCADE;
ALTER TABLE public.budget_layout_presets ADD CONSTRAINT budget_layout_presets_partnership_id_fkey FOREIGN KEY (partnership_id) REFERENCES public.partnerships(id) ON DELETE CASCADE;
ALTER TABLE public.budget_layout_presets ADD CONSTRAINT budget_layout_presets_template_author_id_fkey FOREIGN KEY (template_author_id) REFERENCES public.profiles(id) ON DELETE SET NULL;
ALTER TABLE public.budget_layout_presets ADD CONSTRAINT budget_layout_presets_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;
ALTER TABLE public.budget_months ADD CONSTRAINT budget_months_budget_id_fkey FOREIGN KEY (budget_id) REFERENCES public.user_budgets(id) ON DELETE CASCADE;
ALTER TABLE public.budget_months ADD CONSTRAINT budget_months_partnership_id_fkey FOREIGN KEY (partnership_id) REFERENCES public.partnerships(id) ON DELETE CASCADE;
ALTER TABLE public.budgets ADD CONSTRAINT budgets_category_id_fkey FOREIGN KEY (category_id) REFERENCES public.categories(id) ON DELETE CASCADE;
ALTER TABLE public.budgets ADD CONSTRAINT budgets_partnership_id_fkey FOREIGN KEY (partnership_id) REFERENCES public.partnerships(id) ON DELETE CASCADE;
ALTER TABLE public.categories ADD CONSTRAINT categories_parent_category_id_fkey FOREIGN KEY (parent_category_id) REFERENCES public.categories(id);
ALTER TABLE public.category_mappings ADD CONSTRAINT category_mappings_up_category_id_fkey FOREIGN KEY (up_category_id) REFERENCES public.categories(id);
ALTER TABLE public.category_pin_states ADD CONSTRAINT category_pin_states_partnership_id_fkey FOREIGN KEY (partnership_id) REFERENCES public.partnerships(id) ON DELETE CASCADE;
ALTER TABLE public.category_pin_states ADD CONSTRAINT category_pin_states_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;
ALTER TABLE public.couple_split_settings ADD CONSTRAINT couple_split_settings_expense_definition_id_fkey FOREIGN KEY (expense_definition_id) REFERENCES public.expense_definitions(id) ON DELETE CASCADE;
ALTER TABLE public.couple_split_settings ADD CONSTRAINT couple_split_settings_partnership_id_fkey FOREIGN KEY (partnership_id) REFERENCES public.partnerships(id) ON DELETE CASCADE;
ALTER TABLE public.expense_definitions ADD CONSTRAINT expense_definitions_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.profiles(id) ON DELETE SET NULL;
ALTER TABLE public.expense_definitions ADD CONSTRAINT expense_definitions_partnership_id_fkey FOREIGN KEY (partnership_id) REFERENCES public.partnerships(id) ON DELETE CASCADE;
ALTER TABLE public.expense_matches ADD CONSTRAINT expense_matches_expense_definition_id_fkey FOREIGN KEY (expense_definition_id) REFERENCES public.expense_definitions(id) ON DELETE CASCADE;
ALTER TABLE public.expense_matches ADD CONSTRAINT expense_matches_matched_by_fkey FOREIGN KEY (matched_by) REFERENCES public.profiles(id) ON DELETE SET NULL;
ALTER TABLE public.expense_matches ADD CONSTRAINT expense_matches_transaction_id_fkey FOREIGN KEY (transaction_id) REFERENCES public.transactions(id) ON DELETE CASCADE;
ALTER TABLE public.income_sources ADD CONSTRAINT income_sources_linked_transaction_id_fkey FOREIGN KEY (linked_transaction_id) REFERENCES public.transactions(id) ON DELETE SET NULL;
ALTER TABLE public.income_sources ADD CONSTRAINT income_sources_partnership_id_fkey FOREIGN KEY (partnership_id) REFERENCES public.partnerships(id) ON DELETE CASCADE;
ALTER TABLE public.investment_history ADD CONSTRAINT investment_history_investment_id_fkey FOREIGN KEY (investment_id) REFERENCES public.investments(id) ON DELETE CASCADE;
ALTER TABLE public.investment_contributions ADD CONSTRAINT investment_contributions_investment_id_fkey FOREIGN KEY (investment_id) REFERENCES public.investments(id) ON DELETE CASCADE;
ALTER TABLE public.investment_contributions ADD CONSTRAINT investment_contributions_partnership_id_fkey FOREIGN KEY (partnership_id) REFERENCES public.partnerships(id) ON DELETE CASCADE;
ALTER TABLE public.investments ADD CONSTRAINT investments_partnership_id_fkey FOREIGN KEY (partnership_id) REFERENCES public.partnerships(id) ON DELETE CASCADE;
ALTER TABLE public.merchant_category_rules ADD CONSTRAINT merchant_category_rules_category_id_fkey FOREIGN KEY (category_id) REFERENCES public.categories(id) ON DELETE CASCADE;
ALTER TABLE public.merchant_category_rules ADD CONSTRAINT merchant_category_rules_parent_category_id_fkey FOREIGN KEY (parent_category_id) REFERENCES public.categories(id);
ALTER TABLE public.merchant_category_rules ADD CONSTRAINT merchant_category_rules_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;
ALTER TABLE public.methodology_customizations ADD CONSTRAINT methodology_customizations_partnership_id_fkey FOREIGN KEY (partnership_id) REFERENCES public.partnerships(id) ON DELETE CASCADE;
ALTER TABLE public.methodology_customizations ADD CONSTRAINT methodology_customizations_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;
ALTER TABLE public.milestones ADD CONSTRAINT milestones_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.profiles(id) ON DELETE SET NULL;
ALTER TABLE public.milestones ADD CONSTRAINT milestones_partnership_id_fkey FOREIGN KEY (partnership_id) REFERENCES public.partnerships(id) ON DELETE CASCADE;
ALTER TABLE public.net_worth_snapshots ADD CONSTRAINT net_worth_snapshots_partnership_id_fkey FOREIGN KEY (partnership_id) REFERENCES public.partnerships(id) ON DELETE CASCADE;
ALTER TABLE public.notifications ADD CONSTRAINT notifications_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;
ALTER TABLE public.partner_link_requests ADD CONSTRAINT partner_link_requests_primary_partnership_id_fkey FOREIGN KEY (primary_partnership_id) REFERENCES public.partnerships(id) ON DELETE SET NULL;
ALTER TABLE public.partner_link_requests ADD CONSTRAINT partner_link_requests_requester_user_id_fkey FOREIGN KEY (requester_user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;
ALTER TABLE public.partner_link_requests ADD CONSTRAINT partner_link_requests_target_user_id_fkey FOREIGN KEY (target_user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;
ALTER TABLE public.partnership_members ADD CONSTRAINT partnership_members_partnership_id_fkey FOREIGN KEY (partnership_id) REFERENCES public.partnerships(id) ON DELETE CASCADE;
ALTER TABLE public.partnership_members ADD CONSTRAINT partnership_members_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;
ALTER TABLE public.savings_goals ADD CONSTRAINT savings_goals_linked_account_id_fkey FOREIGN KEY (linked_account_id) REFERENCES public.accounts(id) ON DELETE SET NULL;
ALTER TABLE public.savings_goals ADD CONSTRAINT savings_goals_partnership_id_fkey FOREIGN KEY (partnership_id) REFERENCES public.partnerships(id) ON DELETE CASCADE;
ALTER TABLE public.target_allocations ADD CONSTRAINT target_allocations_partnership_id_fkey FOREIGN KEY (partnership_id) REFERENCES public.partnerships(id) ON DELETE CASCADE;
ALTER TABLE public.transaction_category_overrides ADD CONSTRAINT transaction_category_overrides_changed_by_fkey FOREIGN KEY (changed_by) REFERENCES public.profiles(id) ON DELETE SET NULL;
ALTER TABLE public.transaction_category_overrides ADD CONSTRAINT transaction_category_overrides_override_category_id_fkey FOREIGN KEY (override_category_id) REFERENCES public.categories(id);
ALTER TABLE public.transaction_category_overrides ADD CONSTRAINT transaction_category_overrides_override_parent_category_id_fkey FOREIGN KEY (override_parent_category_id) REFERENCES public.categories(id);
ALTER TABLE public.transaction_category_overrides ADD CONSTRAINT transaction_category_overrides_transaction_id_fkey FOREIGN KEY (transaction_id) REFERENCES public.transactions(id) ON DELETE CASCADE;
ALTER TABLE public.transaction_notes ADD CONSTRAINT transaction_notes_transaction_id_fkey FOREIGN KEY (transaction_id) REFERENCES public.transactions(id) ON DELETE CASCADE;
ALTER TABLE public.transaction_notes ADD CONSTRAINT transaction_notes_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;
ALTER TABLE public.transaction_share_overrides ADD CONSTRAINT transaction_share_overrides_partnership_id_fkey FOREIGN KEY (partnership_id) REFERENCES public.partnerships(id) ON DELETE CASCADE;
ALTER TABLE public.transaction_tags ADD CONSTRAINT transaction_tags_tag_name_fkey FOREIGN KEY (tag_name) REFERENCES public.tags(name) ON DELETE CASCADE;
ALTER TABLE public.transaction_tags ADD CONSTRAINT transaction_tags_transaction_id_fkey FOREIGN KEY (transaction_id) REFERENCES public.transactions(id) ON DELETE CASCADE;
ALTER TABLE public.transactions ADD CONSTRAINT transactions_account_id_fkey FOREIGN KEY (account_id) REFERENCES public.accounts(id) ON DELETE CASCADE;
ALTER TABLE public.transactions ADD CONSTRAINT transactions_category_id_fkey FOREIGN KEY (category_id) REFERENCES public.categories(id) ON DELETE SET NULL;
ALTER TABLE public.transactions ADD CONSTRAINT transactions_parent_category_id_fkey FOREIGN KEY (parent_category_id) REFERENCES public.categories(id) ON DELETE SET NULL;
ALTER TABLE public.transactions ADD CONSTRAINT transactions_transfer_account_id_fkey FOREIGN KEY (transfer_account_id) REFERENCES public.accounts(id) ON DELETE SET NULL;
ALTER TABLE public.up_api_configs ADD CONSTRAINT up_api_configs_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;
ALTER TABLE public.user_budgets ADD CONSTRAINT user_budgets_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.profiles(id) ON DELETE SET NULL;
ALTER TABLE public.user_budgets ADD CONSTRAINT user_budgets_partnership_id_fkey FOREIGN KEY (partnership_id) REFERENCES public.partnerships(id) ON DELETE CASCADE;
ALTER TABLE public.user_dashboard_charts ADD CONSTRAINT user_dashboard_charts_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;
ALTER TABLE public.watchlist_items ADD CONSTRAINT watchlist_items_partnership_id_fkey FOREIGN KEY (partnership_id) REFERENCES public.partnerships(id) ON DELETE CASCADE;

-- ============================================================================
-- 8. INDEXES (non-PK, non-unique-constraint)
-- ============================================================================

-- accounts
CREATE INDEX idx_accounts_joint_lookup ON public.accounts USING btree (up_account_id) WHERE (ownership_type = 'JOINT'::text);
CREATE INDEX idx_accounts_user_id ON public.accounts USING btree (user_id);

-- annual_checkups
CREATE INDEX idx_annual_checkups_fy ON public.annual_checkups USING btree (partnership_id, financial_year);
CREATE INDEX idx_annual_checkups_partnership_id ON public.annual_checkups USING btree (partnership_id);

-- budget_assignments
CREATE INDEX idx_budget_assignments_budget_id ON public.budget_assignments USING btree (budget_id);
CREATE INDEX idx_budget_assignments_month ON public.budget_assignments USING btree (month);
CREATE INDEX idx_budget_assignments_partnership_month ON public.budget_assignments USING btree (partnership_id, month);
CREATE INDEX idx_budget_assignments_subcategory ON public.budget_assignments USING btree (partnership_id, month, category_name, subcategory_name) WHERE (subcategory_name IS NOT NULL);
CREATE UNIQUE INDEX idx_budget_assignments_unique_per_view ON public.budget_assignments USING btree (partnership_id, month, budget_view, assignment_type, COALESCE((budget_id)::text, ''::text), COALESCE(category_name, ''::text), COALESCE(subcategory_name, ''::text), COALESCE((goal_id)::text, ''::text), COALESCE((asset_id)::text, ''::text));

-- budget_item_preferences
CREATE INDEX idx_budget_category_prefs_partnership ON public.budget_item_preferences USING btree (partnership_id);
CREATE INDEX idx_budget_category_prefs_user ON public.budget_item_preferences USING btree (user_id);
CREATE INDEX idx_budget_item_preferences_budget_id ON public.budget_item_preferences USING btree (budget_id);
CREATE UNIQUE INDEX idx_budget_item_prefs_unique ON public.budget_item_preferences USING btree (user_id, partnership_id, item_type, COALESCE(category_name, ''::text), COALESCE((goal_id)::text, ''::text), COALESCE((asset_id)::text, ''::text));

-- budget_layout_presets
CREATE INDEX idx_budget_layout_presets_budget_id ON public.budget_layout_presets USING btree (budget_id);
CREATE UNIQUE INDEX idx_unique_active_layout_per_view ON public.budget_layout_presets USING btree (user_id, partnership_id, budget_view, budget_id) WHERE (is_active = true);

-- budget_months
CREATE INDEX idx_budget_months_budget_id ON public.budget_months USING btree (budget_id);
CREATE INDEX idx_budget_months_partnership ON public.budget_months USING btree (partnership_id, month);

-- couple_split_settings
CREATE INDEX idx_couple_split_settings_category ON public.couple_split_settings USING btree (partnership_id, category_name);
CREATE INDEX idx_couple_split_settings_expense ON public.couple_split_settings USING btree (expense_definition_id) WHERE (expense_definition_id IS NOT NULL);

-- expense_definitions
CREATE INDEX idx_expense_definitions_match_pattern ON public.expense_definitions USING btree (match_pattern) WHERE (match_pattern IS NOT NULL);
CREATE INDEX idx_expense_definitions_next_due ON public.expense_definitions USING btree (next_due_date) WHERE (is_active = true);
CREATE INDEX idx_expense_definitions_partnership ON public.expense_definitions USING btree (partnership_id);
CREATE INDEX idx_expense_definitions_up_txn ON public.expense_definitions USING btree (linked_up_transaction_id) WHERE (linked_up_transaction_id IS NOT NULL);

-- expense_matches
CREATE INDEX idx_expense_matches_expense_id ON public.expense_matches USING btree (expense_definition_id);
CREATE INDEX idx_expense_matches_period ON public.expense_matches USING btree (expense_definition_id, for_period);
CREATE INDEX idx_expense_matches_transaction_id ON public.expense_matches USING btree (transaction_id);

-- goal_contributions
CREATE INDEX idx_goal_contributions_goal_id ON public.goal_contributions USING btree (goal_id);
CREATE INDEX idx_goal_contributions_created_at ON public.goal_contributions USING btree (created_at);

-- income_sources
CREATE INDEX idx_income_sources_active ON public.income_sources USING btree (is_active) WHERE (is_active = true);
CREATE INDEX idx_income_sources_manual_partner ON public.income_sources USING btree (partnership_id) WHERE (is_manual_partner_income = true);
CREATE INDEX idx_income_sources_partnership_id ON public.income_sources USING btree (partnership_id);
CREATE INDEX idx_income_sources_up_txn ON public.income_sources USING btree (linked_up_transaction_id) WHERE (linked_up_transaction_id IS NOT NULL);
CREATE INDEX idx_income_sources_user_id ON public.income_sources USING btree (user_id);

-- investment_history
CREATE INDEX idx_investment_history_composite ON public.investment_history USING btree (investment_id, recorded_at DESC);
CREATE INDEX idx_investment_history_investment_id ON public.investment_history USING btree (investment_id);
CREATE INDEX idx_investment_history_recorded_at ON public.investment_history USING btree (recorded_at DESC);

-- investment_contributions
CREATE INDEX idx_investment_contributions_lookup ON public.investment_contributions USING btree (investment_id, contributed_at);

-- investments
CREATE INDEX idx_investments_partnership_id ON public.investments USING btree (partnership_id);

-- merchant_category_rules
CREATE INDEX idx_merchant_rules_lookup ON public.merchant_category_rules USING btree (user_id, merchant_description);

-- methodology_customizations
CREATE INDEX idx_methodology_customizations_partnership ON public.methodology_customizations USING btree (partnership_id, methodology_name);
CREATE INDEX idx_methodology_customizations_user ON public.methodology_customizations USING btree (user_id, methodology_name);

-- milestones
CREATE INDEX idx_milestones_partnership_id ON public.milestones USING btree (partnership_id);
CREATE INDEX idx_milestones_target_date ON public.milestones USING btree (target_date);

-- notifications
CREATE INDEX idx_notifications_user_all ON public.notifications USING btree (user_id, created_at DESC);
CREATE INDEX idx_notifications_user_unread ON public.notifications USING btree (user_id, created_at DESC) WHERE (read = false);

-- partnership_members
CREATE INDEX idx_partnership_members_partnership_id ON public.partnership_members USING btree (partnership_id);
CREATE INDEX idx_partnership_members_user_id ON public.partnership_members USING btree (user_id);

-- partner_link_requests
CREATE INDEX idx_plr_requester ON public.partner_link_requests USING btree (requester_user_id) WHERE (status = 'pending'::text);
CREATE INDEX idx_plr_target ON public.partner_link_requests USING btree (target_user_id) WHERE (status = 'pending'::text);

-- transactions
CREATE INDEX idx_transactions_account_id ON public.transactions USING btree (account_id);
CREATE INDEX idx_transactions_card_method ON public.transactions USING btree (card_purchase_method) WHERE (card_purchase_method IS NOT NULL);
CREATE INDEX idx_transactions_category_id ON public.transactions USING btree (category_id);
CREATE INDEX idx_transactions_created_at ON public.transactions USING btree (created_at DESC);
CREATE INDEX idx_transactions_foreign_currency ON public.transactions USING btree (foreign_currency_code) WHERE (foreign_currency_code IS NOT NULL);
CREATE INDEX idx_transactions_income ON public.transactions USING btree (is_income, is_one_off_income) WHERE (is_income = true);
CREATE INDEX idx_transactions_internal_transfer ON public.transactions USING btree (is_internal_transfer) WHERE (is_internal_transfer = true);
CREATE INDEX idx_transactions_is_income ON public.transactions USING btree (is_income) WHERE (is_income = true);
CREATE INDEX idx_transactions_is_shared ON public.transactions USING btree (is_shared) WHERE (is_shared = true);
CREATE INDEX idx_transactions_linked_pay_schedule ON public.transactions USING btree (linked_pay_schedule_id) WHERE (linked_pay_schedule_id IS NOT NULL);
CREATE INDEX idx_transactions_performing_customer ON public.transactions USING btree (performing_customer) WHERE (performing_customer IS NOT NULL);
CREATE INDEX idx_transactions_transfer_account ON public.transactions USING btree (transfer_account_id) WHERE (transfer_account_id IS NOT NULL);

-- transaction_notes
CREATE INDEX idx_transaction_notes_transaction_id ON public.transaction_notes USING btree (transaction_id);
CREATE INDEX idx_transaction_notes_user_id ON public.transaction_notes USING btree (user_id);

-- transaction_share_overrides
CREATE INDEX idx_transaction_overrides_partnership ON public.transaction_share_overrides USING btree (partnership_id);
CREATE INDEX idx_transaction_overrides_transaction ON public.transaction_share_overrides USING btree (transaction_id);

-- transaction_category_overrides
CREATE INDEX idx_transaction_overrides_txn ON public.transaction_category_overrides USING btree (transaction_id);
CREATE INDEX idx_transaction_overrides_user ON public.transaction_category_overrides USING btree (changed_by);

-- transaction_references
CREATE INDEX idx_transaction_refs_type ON public.transaction_references USING btree (reference_type, reference_id);
CREATE INDEX idx_transaction_refs_up_txn ON public.transaction_references USING btree (up_transaction_id);

-- transaction_tags
CREATE INDEX idx_transaction_tags_tag_name ON public.transaction_tags USING btree (tag_name);
CREATE INDEX idx_transaction_tags_transaction_id ON public.transaction_tags USING btree (transaction_id);

-- up_api_configs
CREATE INDEX idx_up_api_configs_webhook_id ON public.up_api_configs USING btree (webhook_id) WHERE (webhook_id IS NOT NULL);

-- user_budgets (idx_user_budgets_default is UNIQUE to enforce at most one default per partnership)
CREATE UNIQUE INDEX idx_user_budgets_default ON public.user_budgets USING btree (partnership_id) WHERE (is_default = true);
CREATE INDEX idx_user_budgets_partnership ON public.user_budgets USING btree (partnership_id);
CREATE INDEX idx_user_budgets_slug_lookup ON public.user_budgets USING btree (slug);
CREATE UNIQUE INDEX idx_user_budgets_slug_unique ON public.user_budgets USING btree (partnership_id, slug) WHERE (is_active = true);

-- user_dashboard_charts
CREATE INDEX idx_user_dashboard_charts_user_id ON public.user_dashboard_charts USING btree (user_id);

-- watchlist_items
CREATE INDEX idx_watchlist_items_partnership_id ON public.watchlist_items USING btree (partnership_id);

-- ============================================================================
-- 8b. CHECK CONSTRAINTS
-- ============================================================================

-- Value range constraints
ALTER TABLE public.savings_goals
  ADD CONSTRAINT savings_goals_target_amount_positive CHECK (target_amount_cents > 0);
ALTER TABLE public.savings_goals
  ADD CONSTRAINT savings_goals_current_amount_non_negative CHECK (current_amount_cents >= 0);
ALTER TABLE public.investments
  ADD CONSTRAINT investments_quantity_positive CHECK (quantity IS NULL OR quantity > 0);
ALTER TABLE public.investments
  ADD CONSTRAINT investments_purchase_value_non_negative CHECK (purchase_value_cents IS NULL OR purchase_value_cents >= 0);
ALTER TABLE public.expense_matches
  ADD CONSTRAINT expense_matches_confidence_range CHECK (match_confidence >= 0.0 AND match_confidence <= 1.0);
ALTER TABLE public.annual_checkups
  ADD CONSTRAINT annual_checkups_step_positive CHECK (current_step >= 1);
ALTER TABLE public.partner_link_requests
  ADD CONSTRAINT partner_link_requests_status_valid CHECK (status IN ('pending', 'accepted', 'rejected', 'cancelled'));

-- Enum-like TEXT column constraints
ALTER TABLE public.couple_split_settings
  ADD CONSTRAINT couple_split_settings_split_type_valid CHECK (split_type IN ('equal', 'custom', 'individual-owner', 'individual-partner'));
ALTER TABLE public.income_sources
  ADD CONSTRAINT income_sources_source_type_valid CHECK (source_type IN ('recurring-salary', 'one-off'));
ALTER TABLE public.income_sources
  ADD CONSTRAINT income_sources_one_off_type_valid CHECK (one_off_type IS NULL OR one_off_type IN ('bonus', 'gift', 'dividend', 'tax-refund', 'freelance', 'other'));
ALTER TABLE public.income_sources
  ADD CONSTRAINT income_sources_frequency_valid CHECK (frequency IS NULL OR frequency IN ('weekly', 'fortnightly', 'monthly', 'quarterly', 'yearly'));
ALTER TABLE public.expense_definitions
  ADD CONSTRAINT expense_definitions_recurrence_type_valid CHECK (recurrence_type IN ('weekly', 'fortnightly', 'monthly', 'quarterly', 'yearly', 'one-time'));
ALTER TABLE public.investments
  ADD CONSTRAINT investments_asset_type_valid CHECK (asset_type IN ('stock', 'etf', 'crypto', 'property', 'other', 'australian-shares', 'international-shares', 'bonds', 'cash'));
ALTER TABLE public.target_allocations
  ADD CONSTRAINT target_allocations_asset_type_valid CHECK (asset_type IN ('stock', 'etf', 'crypto', 'property', 'other', 'australian-shares', 'international-shares', 'bonds', 'cash'));
ALTER TABLE public.watchlist_items
  ADD CONSTRAINT watchlist_items_asset_type_valid CHECK (asset_type IN ('stock', 'etf', 'crypto', 'property', 'other', 'australian-shares', 'international-shares', 'bonds', 'cash'));
ALTER TABLE public.user_budgets
  ADD CONSTRAINT user_budgets_budget_type_valid CHECK (budget_type IN ('personal', 'household', 'custom', 'primary'));
ALTER TABLE public.user_budgets
  ADD CONSTRAINT user_budgets_methodology_valid CHECK (methodology IN ('zero-based', '50-30-20', 'envelope', 'pay-yourself-first', '80-20', 'custom'));
ALTER TABLE public.user_budgets
  ADD CONSTRAINT user_budgets_budget_view_valid CHECK (budget_view IN ('individual', 'shared'));
ALTER TABLE public.user_budgets
  ADD CONSTRAINT user_budgets_period_type_valid CHECK (period_type IN ('weekly', 'fortnightly', 'monthly'));
ALTER TABLE public.user_budgets
  ADD CONSTRAINT user_budgets_carryover_mode_valid CHECK (carryover_mode IN ('none', 'spending-based'));
ALTER TABLE public.budget_assignments
  ADD CONSTRAINT budget_assignments_assignment_type_valid CHECK (assignment_type IS NULL OR assignment_type IN ('category', 'goal', 'asset'));
ALTER TABLE public.budget_assignments
  ADD CONSTRAINT budget_assignments_budget_view_valid CHECK (budget_view IS NULL OR budget_view IN ('individual', 'shared'));
ALTER TABLE public.budget_assignments
  ADD CONSTRAINT budget_assignments_stored_period_type_valid CHECK (stored_period_type IS NULL OR stored_period_type IN ('weekly', 'fortnightly', 'monthly'));
ALTER TABLE public.partnership_members
  ADD CONSTRAINT partnership_members_role_valid CHECK (role IS NULL OR role IN ('owner', 'member'));
ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_fire_variant_valid CHECK (fire_variant IS NULL OR fire_variant IN ('lean', 'regular', 'fat', 'coast'));
ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_theme_preference_valid CHECK (theme_preference IS NULL OR theme_preference IN ('mint', 'light', 'dark', 'ocean'));
ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_budget_view_preference_valid CHECK (budget_view_preference IS NULL OR budget_view_preference IN ('individual', 'shared'));
ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_budget_period_preference_valid CHECK (budget_period_preference IS NULL OR budget_period_preference IN ('weekly', 'fortnightly', 'monthly'));
ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_budget_methodology_valid CHECK (budget_methodology IS NULL OR budget_methodology IN ('zero-based', '50-30-20', 'envelope', 'pay-yourself-first', '80-20', 'custom'));
ALTER TABLE public.transactions
  ADD CONSTRAINT transactions_status_valid CHECK (status IN ('HELD', 'SETTLED'));
ALTER TABLE public.accounts
  ADD CONSTRAINT accounts_account_type_valid CHECK (account_type IN ('TRANSACTIONAL', 'SAVER', 'HOME_LOAN'));
ALTER TABLE public.accounts
  ADD CONSTRAINT accounts_ownership_type_valid CHECK (ownership_type IN ('INDIVIDUAL', 'JOINT'));
ALTER TABLE public.notifications
  ADD CONSTRAINT notifications_type_valid CHECK (type IN ('subscription_price_change', 'goal_milestone', 'payment_reminder', 'weekly_summary'));
ALTER TABLE public.transaction_references
  ADD CONSTRAINT transaction_references_reference_type_valid CHECK (reference_type IN ('income_source', 'expense_definition'));
ALTER TABLE public.budget_item_preferences
  ADD CONSTRAINT budget_item_preferences_item_type_valid CHECK (item_type IS NULL OR item_type IN ('category', 'goal', 'asset'));
ALTER TABLE public.budget_layout_presets
  ADD CONSTRAINT budget_layout_presets_budget_view_valid CHECK (budget_view IS NULL OR budget_view IN ('individual', 'shared'));
ALTER TABLE public.methodology_customizations
  ADD CONSTRAINT methodology_customizations_methodology_name_valid CHECK (methodology_name IN ('zero-based', '50-30-20', 'envelope', 'pay-yourself-first', '80-20', 'custom'));
ALTER TABLE public.category_pin_states
  ADD CONSTRAINT category_pin_states_methodology_name_valid CHECK (methodology_name IN ('zero-based', '50-30-20', 'envelope', 'pay-yourself-first', '80-20', 'custom'));

-- String length constraints
ALTER TABLE public.user_budgets
  ADD CONSTRAINT user_budgets_name_length CHECK (char_length(name) <= 200);
ALTER TABLE public.savings_goals
  ADD CONSTRAINT savings_goals_name_length CHECK (char_length(name) <= 200);
ALTER TABLE public.investments
  ADD CONSTRAINT investments_name_length CHECK (char_length(name) <= 200);
ALTER TABLE public.expense_definitions
  ADD CONSTRAINT expense_definitions_name_length CHECK (char_length(name) <= 200);
ALTER TABLE public.income_sources
  ADD CONSTRAINT income_sources_name_length CHECK (char_length(name) <= 200);
ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_display_name_length CHECK (display_name IS NULL OR char_length(display_name) <= 100);
ALTER TABLE public.transaction_notes
  ADD CONSTRAINT transaction_notes_note_length CHECK (char_length(note) <= 1000);
ALTER TABLE public.watchlist_items
  ADD CONSTRAINT watchlist_items_name_length CHECK (char_length(name) <= 200);

-- Slug format constraints
ALTER TABLE public.user_budgets
  ADD CONSTRAINT user_budgets_slug_not_empty CHECK (slug != ''),
  ADD CONSTRAINT user_budgets_slug_format CHECK (slug ~ '^[a-z0-9-]+$');

-- ============================================================================
-- 9. ROW LEVEL SECURITY
-- ============================================================================

ALTER TABLE public.accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.annual_checkups ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.budget_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.budget_category_shares ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.budget_item_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.budget_layout_presets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.budget_months ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.budgets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.category_mappings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.category_pin_states ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.couple_split_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.expense_definitions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.expense_matches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.goal_contributions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.income_sources ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.investment_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.investment_contributions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.investments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.merchant_category_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.methodology_customizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.milestones ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.net_worth_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.partner_link_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.partnership_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.partnerships ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.savings_goals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tags ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.target_allocations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.transaction_category_overrides ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.transaction_notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.transaction_references ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.transaction_share_overrides ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.transaction_tags ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.up_api_configs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_budgets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_dashboard_charts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.watchlist_items ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- 10. RLS POLICIES
-- All policies use TO authenticated (not TO public) to prevent anonymous access.
-- SECURITY DEFINER functions bypass RLS and are unaffected.
-- ============================================================================

-- ---- accounts ----
CREATE POLICY "Partners can view each others accounts" ON public.accounts
  FOR SELECT TO authenticated
  USING (user_id IN (
    SELECT user_id FROM private.get_partner_user_ids((SELECT auth.uid()))
  ));
CREATE POLICY "Users can insert own accounts" ON public.accounts
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());
CREATE POLICY "Users can update own accounts" ON public.accounts
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid());
CREATE POLICY "Users can view own accounts" ON public.accounts
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());
CREATE POLICY "Users can delete own accounts" ON public.accounts
  FOR DELETE TO authenticated
  USING (user_id = auth.uid());

-- ---- annual_checkups ----
CREATE POLICY "Members can create partnership checkups" ON public.annual_checkups
  FOR INSERT TO authenticated
  WITH CHECK (partnership_id IN (
    SELECT partnership_id FROM partnership_members WHERE user_id = auth.uid()
  ));
CREATE POLICY "Members can delete partnership checkups" ON public.annual_checkups
  FOR DELETE TO authenticated
  USING (partnership_id IN (
    SELECT partnership_id FROM partnership_members WHERE user_id = auth.uid()
  ));
CREATE POLICY "Members can update partnership checkups" ON public.annual_checkups
  FOR UPDATE TO authenticated
  USING (partnership_id IN (
    SELECT partnership_id FROM partnership_members WHERE user_id = auth.uid()
  ));
CREATE POLICY "Members can view partnership checkups" ON public.annual_checkups
  FOR SELECT TO authenticated
  USING (partnership_id IN (
    SELECT partnership_id FROM partnership_members WHERE user_id = auth.uid()
  ));

-- ---- budget_assignments ----
CREATE POLICY "Members can create partnership budget assignments" ON public.budget_assignments
  FOR INSERT TO authenticated
  WITH CHECK (partnership_id IN (
    SELECT partnership_id FROM partnership_members WHERE user_id = auth.uid()
  ));
CREATE POLICY "Members can delete partnership budget assignments" ON public.budget_assignments
  FOR DELETE TO authenticated
  USING (partnership_id IN (
    SELECT partnership_id FROM partnership_members WHERE user_id = auth.uid()
  ));
CREATE POLICY "Members can update partnership budget assignments" ON public.budget_assignments
  FOR UPDATE TO authenticated
  USING (partnership_id IN (
    SELECT partnership_id FROM partnership_members WHERE user_id = auth.uid()
  ));
CREATE POLICY "Members can view partnership budget assignments" ON public.budget_assignments
  FOR SELECT TO authenticated
  USING (partnership_id IN (
    SELECT partnership_id FROM partnership_members WHERE user_id = auth.uid()
  ));

-- ---- budget_category_shares ----
CREATE POLICY "Users can delete their partnership's category shares" ON public.budget_category_shares
  FOR DELETE TO authenticated
  USING (partnership_id IN (
    SELECT partnership_id FROM partnership_members WHERE user_id = auth.uid()
  ));
CREATE POLICY "Users can insert category shares for their partnership" ON public.budget_category_shares
  FOR INSERT TO authenticated
  WITH CHECK (partnership_id IN (
    SELECT partnership_id FROM partnership_members WHERE user_id = auth.uid()
  ));
CREATE POLICY "Users can update their partnership's category shares" ON public.budget_category_shares
  FOR UPDATE TO authenticated
  USING (partnership_id IN (
    SELECT partnership_id FROM partnership_members WHERE user_id = auth.uid()
  ));
CREATE POLICY "Users can view their partnership's category shares" ON public.budget_category_shares
  FOR SELECT TO authenticated
  USING (partnership_id IN (
    SELECT partnership_id FROM partnership_members WHERE user_id = auth.uid()
  ));

-- ---- budget_item_preferences ----
CREATE POLICY "Users can create their own category preferences" ON public.budget_item_preferences
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());
CREATE POLICY "Users can delete their own category preferences" ON public.budget_item_preferences
  FOR DELETE TO authenticated
  USING (user_id = auth.uid());
CREATE POLICY "Users can update their own category preferences" ON public.budget_item_preferences
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid());
CREATE POLICY "Users can view their own category preferences" ON public.budget_item_preferences
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

-- ---- budget_layout_presets ----
CREATE POLICY "Users can view own layout presets" ON public.budget_layout_presets
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());
CREATE POLICY "Users can create own layout presets" ON public.budget_layout_presets
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());
CREATE POLICY "Users can update own layout presets" ON public.budget_layout_presets
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid());
CREATE POLICY "Users can delete own layout presets" ON public.budget_layout_presets
  FOR DELETE TO authenticated
  USING (user_id = auth.uid());

-- ---- budget_months ----
CREATE POLICY "Members can create partnership budget months" ON public.budget_months
  FOR INSERT TO authenticated
  WITH CHECK (partnership_id IN (
    SELECT partnership_id FROM partnership_members WHERE user_id = auth.uid()
  ));
CREATE POLICY "Members can update partnership budget months" ON public.budget_months
  FOR UPDATE TO authenticated
  USING (partnership_id IN (
    SELECT partnership_id FROM partnership_members WHERE user_id = auth.uid()
  ));
CREATE POLICY "Members can view partnership budget months" ON public.budget_months
  FOR SELECT TO authenticated
  USING (partnership_id IN (
    SELECT partnership_id FROM partnership_members WHERE user_id = auth.uid()
  ));
CREATE POLICY "Members can delete partnership budget months" ON public.budget_months
  FOR DELETE TO authenticated
  USING (partnership_id IN (
    SELECT partnership_id FROM partnership_members WHERE user_id = auth.uid()
  ));

-- ---- budgets ----
CREATE POLICY "Members can create partnership budgets" ON public.budgets
  FOR INSERT TO authenticated
  WITH CHECK (partnership_id IN (
    SELECT partnership_id FROM partnership_members WHERE user_id = auth.uid()
  ));
CREATE POLICY "Members can update partnership budgets" ON public.budgets
  FOR UPDATE TO authenticated
  USING (partnership_id IN (
    SELECT partnership_id FROM partnership_members WHERE user_id = auth.uid()
  ));
CREATE POLICY "Members can view partnership budgets" ON public.budgets
  FOR SELECT TO authenticated
  USING (partnership_id IN (
    SELECT partnership_id FROM partnership_members WHERE user_id = auth.uid()
  ));
CREATE POLICY "Members can delete partnership budgets" ON public.budgets
  FOR DELETE TO authenticated
  USING (partnership_id IN (
    SELECT partnership_id FROM partnership_members WHERE user_id = auth.uid()
  ));

-- ---- categories (reference data) ----
CREATE POLICY "Anyone can view categories" ON public.categories
  FOR SELECT TO authenticated
  USING (true);
CREATE POLICY "Authenticated users can insert categories" ON public.categories
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "Authenticated users can update categories" ON public.categories
  FOR UPDATE TO authenticated
  USING (auth.uid() IS NOT NULL);

-- ---- category_mappings (reference data) ----
CREATE POLICY "Category mappings are viewable by all authenticated users" ON public.category_mappings
  FOR SELECT TO authenticated
  USING (true);

-- ---- category_pin_states ----
CREATE POLICY "Users can manage their own pin states" ON public.category_pin_states
  FOR ALL TO authenticated
  USING (user_id = auth.uid());

-- ---- couple_split_settings ----
CREATE POLICY "Members can create partnership split settings" ON public.couple_split_settings
  FOR INSERT TO authenticated
  WITH CHECK (partnership_id IN (
    SELECT partnership_id FROM partnership_members WHERE user_id = auth.uid()
  ));
CREATE POLICY "Members can delete partnership split settings" ON public.couple_split_settings
  FOR DELETE TO authenticated
  USING (partnership_id IN (
    SELECT partnership_id FROM partnership_members WHERE user_id = auth.uid()
  ));
CREATE POLICY "Members can update partnership split settings" ON public.couple_split_settings
  FOR UPDATE TO authenticated
  USING (partnership_id IN (
    SELECT partnership_id FROM partnership_members WHERE user_id = auth.uid()
  ));
CREATE POLICY "Members can view partnership split settings" ON public.couple_split_settings
  FOR SELECT TO authenticated
  USING (partnership_id IN (
    SELECT partnership_id FROM partnership_members WHERE user_id = auth.uid()
  ));

-- ---- expense_definitions ----
CREATE POLICY "Members can create partnership expenses" ON public.expense_definitions
  FOR INSERT TO authenticated
  WITH CHECK (partnership_id IN (
    SELECT partnership_id FROM partnership_members WHERE user_id = auth.uid()
  ));
CREATE POLICY "Members can delete partnership expenses" ON public.expense_definitions
  FOR DELETE TO authenticated
  USING (partnership_id IN (
    SELECT partnership_id FROM partnership_members WHERE user_id = auth.uid()
  ));
CREATE POLICY "Members can update partnership expenses" ON public.expense_definitions
  FOR UPDATE TO authenticated
  USING (partnership_id IN (
    SELECT partnership_id FROM partnership_members WHERE user_id = auth.uid()
  ));
CREATE POLICY "Members can view partnership expenses" ON public.expense_definitions
  FOR SELECT TO authenticated
  USING (partnership_id IN (
    SELECT partnership_id FROM partnership_members WHERE user_id = auth.uid()
  ));

-- ---- expense_matches ----
CREATE POLICY "Members can create expense matches" ON public.expense_matches
  FOR INSERT TO authenticated
  WITH CHECK (expense_definition_id IN (
    SELECT id FROM expense_definitions WHERE partnership_id IN (
      SELECT partnership_id FROM partnership_members WHERE user_id = auth.uid()
    )
  ));
CREATE POLICY "Members can delete expense matches" ON public.expense_matches
  FOR DELETE TO authenticated
  USING (expense_definition_id IN (
    SELECT id FROM expense_definitions WHERE partnership_id IN (
      SELECT partnership_id FROM partnership_members WHERE user_id = auth.uid()
    )
  ));
CREATE POLICY "Members can view expense matches" ON public.expense_matches
  FOR SELECT TO authenticated
  USING (expense_definition_id IN (
    SELECT id FROM expense_definitions WHERE partnership_id IN (
      SELECT partnership_id FROM partnership_members WHERE user_id = auth.uid()
    )
  ));
CREATE POLICY "Members can update expense matches" ON public.expense_matches
  FOR UPDATE TO authenticated
  USING (expense_definition_id IN (
    SELECT id FROM expense_definitions WHERE partnership_id IN (
      SELECT partnership_id FROM partnership_members WHERE user_id = auth.uid()
    )
  ));

-- ---- goal_contributions ----
CREATE POLICY "Members can view goal contributions" ON public.goal_contributions
  FOR SELECT TO authenticated
  USING (goal_id IN (
    SELECT sg.id FROM savings_goals sg
    WHERE sg.partnership_id IN (
      SELECT partnership_id FROM partnership_members WHERE user_id = auth.uid()
    )
  ));
CREATE POLICY "Members can insert goal contributions" ON public.goal_contributions
  FOR INSERT TO authenticated
  WITH CHECK (goal_id IN (
    SELECT sg.id FROM savings_goals sg
    WHERE sg.partnership_id IN (
      SELECT partnership_id FROM partnership_members WHERE user_id = auth.uid()
    )
  ));
CREATE POLICY "Members can delete goal contributions" ON public.goal_contributions
  FOR DELETE TO authenticated
  USING (goal_id IN (
    SELECT sg.id FROM savings_goals sg
    WHERE sg.partnership_id IN (
      SELECT partnership_id FROM partnership_members WHERE user_id = auth.uid()
    )
  ));
CREATE POLICY "Members can update goal contributions" ON public.goal_contributions
  FOR UPDATE TO authenticated
  USING (goal_id IN (
    SELECT sg.id FROM savings_goals sg
    WHERE sg.partnership_id IN (
      SELECT partnership_id FROM partnership_members WHERE user_id = auth.uid()
    )
  ));

-- ---- income_sources ----
CREATE POLICY "Partners can delete income sources" ON public.income_sources
  FOR DELETE TO authenticated
  USING (user_id IN (
    SELECT pm.user_id FROM partnership_members pm
    WHERE pm.partnership_id IN (
      SELECT partnership_id FROM partnership_members WHERE user_id = auth.uid()
    )
  ));
CREATE POLICY "Partners can insert income for each other" ON public.income_sources
  FOR INSERT TO authenticated
  WITH CHECK (user_id IN (
    SELECT pm.user_id FROM partnership_members pm
    WHERE pm.partnership_id IN (
      SELECT partnership_id FROM partnership_members WHERE user_id = auth.uid()
    )
  ));
CREATE POLICY "Partners can update income sources" ON public.income_sources
  FOR UPDATE TO authenticated
  USING (user_id IN (
    SELECT pm.user_id FROM partnership_members pm
    WHERE pm.partnership_id IN (
      SELECT partnership_id FROM partnership_members WHERE user_id = auth.uid()
    )
  ));
CREATE POLICY "Users can insert own income sources" ON public.income_sources
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can view own income sources" ON public.income_sources
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id);
CREATE POLICY "Users can view partnership income sources" ON public.income_sources
  FOR SELECT TO authenticated
  USING (partnership_id IN (
    SELECT partnership_id FROM partnership_members WHERE user_id = auth.uid()
  ));

-- ---- investment_history ----
CREATE POLICY "Members can insert investment history" ON public.investment_history
  FOR INSERT TO authenticated
  WITH CHECK (investment_id IN (
    SELECT id FROM investments WHERE partnership_id IN (
      SELECT partnership_id FROM partnership_members WHERE user_id = auth.uid()
    )
  ));
CREATE POLICY "Members can view investment history" ON public.investment_history
  FOR SELECT TO authenticated
  USING (investment_id IN (
    SELECT id FROM investments WHERE partnership_id IN (
      SELECT partnership_id FROM partnership_members WHERE user_id = auth.uid()
    )
  ));
CREATE POLICY "Members can delete investment history" ON public.investment_history
  FOR DELETE TO authenticated
  USING (investment_id IN (
    SELECT id FROM investments WHERE partnership_id IN (
      SELECT partnership_id FROM partnership_members WHERE user_id = auth.uid()
    )
  ));
CREATE POLICY "Members can update investment history" ON public.investment_history
  FOR UPDATE TO authenticated
  USING (investment_id IN (
    SELECT id FROM investments WHERE partnership_id IN (
      SELECT partnership_id FROM partnership_members WHERE user_id = auth.uid()
    )
  ));

-- ---- investment_contributions ----
CREATE POLICY "Members can view investment contributions" ON public.investment_contributions
  FOR SELECT TO authenticated
  USING (partnership_id IN (
    SELECT partnership_id FROM partnership_members WHERE user_id = auth.uid()
  ));
CREATE POLICY "Members can insert investment contributions" ON public.investment_contributions
  FOR INSERT TO authenticated
  WITH CHECK (partnership_id IN (
    SELECT partnership_id FROM partnership_members WHERE user_id = auth.uid()
  ));
CREATE POLICY "Members can delete investment contributions" ON public.investment_contributions
  FOR DELETE TO authenticated
  USING (partnership_id IN (
    SELECT partnership_id FROM partnership_members WHERE user_id = auth.uid()
  ));
CREATE POLICY "Members can update investment contributions" ON public.investment_contributions
  FOR UPDATE TO authenticated
  USING (partnership_id IN (
    SELECT partnership_id FROM partnership_members WHERE user_id = auth.uid()
  ));

-- ---- investments ----
CREATE POLICY "Members can create partnership investments" ON public.investments
  FOR INSERT TO authenticated
  WITH CHECK (partnership_id IN (
    SELECT partnership_id FROM partnership_members WHERE user_id = auth.uid()
  ));
CREATE POLICY "Members can delete partnership investments" ON public.investments
  FOR DELETE TO authenticated
  USING (partnership_id IN (
    SELECT partnership_id FROM partnership_members WHERE user_id = auth.uid()
  ));
CREATE POLICY "Members can update partnership investments" ON public.investments
  FOR UPDATE TO authenticated
  USING (partnership_id IN (
    SELECT partnership_id FROM partnership_members WHERE user_id = auth.uid()
  ));
CREATE POLICY "Members can view partnership investments" ON public.investments
  FOR SELECT TO authenticated
  USING (partnership_id IN (
    SELECT partnership_id FROM partnership_members WHERE user_id = auth.uid()
  ));

-- ---- merchant_category_rules ----
CREATE POLICY "Users can create their own merchant rules" ON public.merchant_category_rules
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());
CREATE POLICY "Users can delete their own merchant rules" ON public.merchant_category_rules
  FOR DELETE TO authenticated
  USING (user_id = auth.uid());
CREATE POLICY "Users can update their own merchant rules" ON public.merchant_category_rules
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid());
CREATE POLICY "Users can view their own merchant rules" ON public.merchant_category_rules
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

-- ---- methodology_customizations ----
CREATE POLICY "Members can manage their own customizations" ON public.methodology_customizations
  FOR ALL TO authenticated
  USING ((user_id = auth.uid()) OR (
    user_id IS NULL AND partnership_id IN (
      SELECT partnership_id FROM partnership_members
      WHERE user_id = auth.uid() AND role = 'owner'
    )
  ));
CREATE POLICY "Members can view partnership customizations" ON public.methodology_customizations
  FOR SELECT TO authenticated
  USING (partnership_id IN (
    SELECT partnership_id FROM partnership_members WHERE user_id = auth.uid()
  ));

-- ---- milestones ----
CREATE POLICY "Members can create partnership milestones" ON public.milestones
  FOR INSERT TO authenticated
  WITH CHECK (partnership_id IN (
    SELECT partnership_id FROM partnership_members WHERE user_id = auth.uid()
  ));
CREATE POLICY "Members can delete partnership milestones" ON public.milestones
  FOR DELETE TO authenticated
  USING (partnership_id IN (
    SELECT partnership_id FROM partnership_members WHERE user_id = auth.uid()
  ));
CREATE POLICY "Members can update partnership milestones" ON public.milestones
  FOR UPDATE TO authenticated
  USING (partnership_id IN (
    SELECT partnership_id FROM partnership_members WHERE user_id = auth.uid()
  ));
CREATE POLICY "Members can view partnership milestones" ON public.milestones
  FOR SELECT TO authenticated
  USING (partnership_id IN (
    SELECT partnership_id FROM partnership_members WHERE user_id = auth.uid()
  ));

-- ---- net_worth_snapshots ----
CREATE POLICY "Users can insert own partnership snapshots" ON public.net_worth_snapshots
  FOR INSERT TO authenticated
  WITH CHECK (partnership_id IN (
    SELECT partnership_id FROM partnership_members WHERE user_id = auth.uid()
  ));
CREATE POLICY "Users can view own partnership snapshots" ON public.net_worth_snapshots
  FOR SELECT TO authenticated
  USING (partnership_id IN (
    SELECT partnership_id FROM partnership_members WHERE user_id = auth.uid()
  ));
CREATE POLICY "Members can delete partnership snapshots" ON public.net_worth_snapshots
  FOR DELETE TO authenticated
  USING (partnership_id IN (
    SELECT partnership_id FROM partnership_members WHERE user_id = auth.uid()
  ));
CREATE POLICY "Members can update partnership snapshots" ON public.net_worth_snapshots
  FOR UPDATE TO authenticated
  USING (partnership_id IN (
    SELECT partnership_id FROM partnership_members WHERE user_id = auth.uid()
  ));

-- ---- notifications ----
CREATE POLICY "Users can insert own notifications" ON public.notifications
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());
CREATE POLICY "Users can update own notifications" ON public.notifications
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid());
CREATE POLICY "Users can view own notifications" ON public.notifications
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());
CREATE POLICY "Users can delete own notifications" ON public.notifications
  FOR DELETE TO authenticated
  USING (user_id = auth.uid());

-- ---- partner_link_requests ----
CREATE POLICY "Users can create link requests" ON public.partner_link_requests
  FOR INSERT TO authenticated
  WITH CHECK (requester_user_id = auth.uid());
CREATE POLICY "Users can update own link requests" ON public.partner_link_requests
  FOR UPDATE TO authenticated
  USING (target_user_id = auth.uid() OR requester_user_id = auth.uid());
CREATE POLICY "Users can view own link requests" ON public.partner_link_requests
  FOR SELECT TO authenticated
  USING (requester_user_id = auth.uid() OR target_user_id = auth.uid());

-- ---- partnership_members ----
-- SELECT only: INSERT is blocked (SECURITY DEFINER functions handle membership)
CREATE POLICY "Members can view membership" ON public.partnership_members
  FOR SELECT TO authenticated
  USING (partnership_id IN (
    SELECT partnership_id FROM private.get_user_partnerships((SELECT auth.uid()))
  ));
CREATE POLICY "No direct membership inserts" ON public.partnership_members
  FOR INSERT TO authenticated
  WITH CHECK (false);

-- ---- partnerships ----
-- SELECT/UPDATE only: INSERT is blocked (handle_new_profile trigger handles creation)
CREATE POLICY "Members can view their partnerships" ON public.partnerships
  FOR SELECT TO authenticated
  USING (id IN (
    SELECT partnership_id FROM partnership_members WHERE user_id = auth.uid()
  ));
CREATE POLICY "Owners can update partnerships" ON public.partnerships
  FOR UPDATE TO authenticated
  USING (id IN (
    SELECT partnership_id FROM partnership_members
    WHERE user_id = auth.uid() AND role = 'owner'
  ));
CREATE POLICY "No direct partnership creation" ON public.partnerships
  FOR INSERT TO authenticated
  WITH CHECK (false);

-- ---- profiles ----
CREATE POLICY "Users can update own profile" ON public.profiles
  FOR UPDATE TO authenticated
  USING (auth.uid() = id);
CREATE POLICY "Users can view own profile" ON public.profiles
  FOR SELECT TO authenticated
  USING (auth.uid() = id);

-- ---- savings_goals ----
CREATE POLICY "Members can create partnership goals" ON public.savings_goals
  FOR INSERT TO authenticated
  WITH CHECK (partnership_id IN (
    SELECT partnership_id FROM partnership_members WHERE user_id = auth.uid()
  ));
CREATE POLICY "Members can delete partnership goals" ON public.savings_goals
  FOR DELETE TO authenticated
  USING (partnership_id IN (
    SELECT partnership_id FROM partnership_members WHERE user_id = auth.uid()
  ));
CREATE POLICY "Members can update partnership goals" ON public.savings_goals
  FOR UPDATE TO authenticated
  USING (partnership_id IN (
    SELECT partnership_id FROM partnership_members WHERE user_id = auth.uid()
  ));
CREATE POLICY "Members can view partnership goals" ON public.savings_goals
  FOR SELECT TO authenticated
  USING (partnership_id IN (
    SELECT partnership_id FROM partnership_members WHERE user_id = auth.uid()
  ));

-- ---- tags ----
CREATE POLICY "Anyone can view tags" ON public.tags
  FOR SELECT TO authenticated
  USING (true);
CREATE POLICY "Authenticated users can insert tags" ON public.tags
  FOR INSERT TO authenticated
  WITH CHECK (true);
CREATE POLICY "Authenticated users can update tags" ON public.tags
  FOR UPDATE TO authenticated
  USING (auth.uid() IS NOT NULL);

-- ---- target_allocations ----
CREATE POLICY "Members can create target allocations" ON public.target_allocations
  FOR INSERT TO authenticated
  WITH CHECK (partnership_id IN (
    SELECT partnership_id FROM partnership_members WHERE user_id = auth.uid()
  ));
CREATE POLICY "Members can delete target allocations" ON public.target_allocations
  FOR DELETE TO authenticated
  USING (partnership_id IN (
    SELECT partnership_id FROM partnership_members WHERE user_id = auth.uid()
  ));
CREATE POLICY "Members can update target allocations" ON public.target_allocations
  FOR UPDATE TO authenticated
  USING (partnership_id IN (
    SELECT partnership_id FROM partnership_members WHERE user_id = auth.uid()
  ));
CREATE POLICY "Members can view target allocations" ON public.target_allocations
  FOR SELECT TO authenticated
  USING (partnership_id IN (
    SELECT partnership_id FROM partnership_members WHERE user_id = auth.uid()
  ));

-- ---- transaction_category_overrides ----
CREATE POLICY "Users can view own category overrides" ON public.transaction_category_overrides
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM transactions t
      JOIN accounts a ON t.account_id = a.id
      JOIN partnership_members pm ON a.user_id = pm.user_id
      WHERE t.id = transaction_id
      AND pm.partnership_id IN (
        SELECT partnership_id FROM partnership_members WHERE user_id = auth.uid()
      )
    )
  );
CREATE POLICY "Users can insert category overrides" ON public.transaction_category_overrides
  FOR INSERT TO authenticated
  WITH CHECK (changed_by = auth.uid());
CREATE POLICY "Users can update own category overrides" ON public.transaction_category_overrides
  FOR UPDATE TO authenticated
  USING (changed_by = auth.uid());
CREATE POLICY "Users can delete own category overrides" ON public.transaction_category_overrides
  FOR DELETE TO authenticated
  USING (changed_by = auth.uid());

-- ---- transaction_notes ----
CREATE POLICY "Users can create notes on accessible transactions" ON public.transaction_notes
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());
CREATE POLICY "Users can update own notes" ON public.transaction_notes
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid());
CREATE POLICY "Users can view notes on accessible transactions" ON public.transaction_notes
  FOR SELECT TO authenticated
  USING (user_id IN (
    SELECT pm.user_id FROM partnership_members pm
    WHERE pm.partnership_id IN (
      SELECT partnership_id FROM partnership_members WHERE user_id = auth.uid()
    )
  ));
CREATE POLICY "Users can delete their own transaction notes" ON public.transaction_notes
  FOR DELETE TO authenticated
  USING (user_id = auth.uid());

-- ---- transaction_references ----
CREATE POLICY "Users can insert transaction references" ON public.transaction_references
  FOR INSERT TO authenticated
  WITH CHECK (up_transaction_id IN (
    SELECT t.up_transaction_id FROM transactions t
    JOIN accounts a ON t.account_id = a.id
    WHERE a.user_id = auth.uid()
  ));
CREATE POLICY "Users can view transaction references" ON public.transaction_references
  FOR SELECT TO authenticated
  USING (up_transaction_id IN (
    SELECT t.up_transaction_id FROM transactions t
    JOIN accounts a ON t.account_id = a.id
    WHERE a.user_id = auth.uid()
  ));
CREATE POLICY "Users can delete transaction references" ON public.transaction_references
  FOR DELETE TO authenticated
  USING (up_transaction_id IN (
    SELECT t.up_transaction_id FROM transactions t
    JOIN accounts a ON t.account_id = a.id
    WHERE a.user_id = auth.uid()
  ));

-- ---- transaction_share_overrides ----
CREATE POLICY "Members can create transaction share overrides" ON public.transaction_share_overrides
  FOR INSERT TO authenticated
  WITH CHECK (partnership_id IN (
    SELECT partnership_id FROM partnership_members WHERE user_id = auth.uid()
  ));
CREATE POLICY "Members can delete transaction share overrides" ON public.transaction_share_overrides
  FOR DELETE TO authenticated
  USING (partnership_id IN (
    SELECT partnership_id FROM partnership_members WHERE user_id = auth.uid()
  ));
CREATE POLICY "Members can update transaction share overrides" ON public.transaction_share_overrides
  FOR UPDATE TO authenticated
  USING (partnership_id IN (
    SELECT partnership_id FROM partnership_members WHERE user_id = auth.uid()
  ));
CREATE POLICY "Members can view transaction share overrides" ON public.transaction_share_overrides
  FOR SELECT TO authenticated
  USING (partnership_id IN (
    SELECT partnership_id FROM partnership_members WHERE user_id = auth.uid()
  ));

-- ---- transaction_tags ----
CREATE POLICY "Users can insert transaction tags" ON public.transaction_tags
  FOR INSERT TO authenticated
  WITH CHECK (transaction_id IN (
    SELECT t.id FROM transactions t
    JOIN accounts a ON a.id = t.account_id
    WHERE a.user_id = auth.uid()
  ));
CREATE POLICY "Users can view their transaction tags" ON public.transaction_tags
  FOR SELECT TO authenticated
  USING (transaction_id IN (
    SELECT t.id FROM transactions t
    JOIN accounts a ON a.id = t.account_id
    WHERE a.user_id = auth.uid()
  ));
CREATE POLICY "Users can delete their transaction tags" ON public.transaction_tags
  FOR DELETE TO authenticated
  USING (transaction_id IN (
    SELECT t.id FROM transactions t
    JOIN accounts a ON a.id = t.account_id
    WHERE a.user_id = auth.uid()
  ));

-- ---- transactions ----
CREATE POLICY "Users can insert own transactions" ON public.transactions
  FOR INSERT TO authenticated
  WITH CHECK (account_id IN (
    SELECT id FROM accounts WHERE user_id = auth.uid()
  ));
CREATE POLICY "Users can update own transactions" ON public.transactions
  FOR UPDATE TO authenticated
  USING (account_id IN (
    SELECT id FROM accounts WHERE user_id = auth.uid()
  ));
CREATE POLICY "Users can view own transactions" ON public.transactions
  FOR SELECT TO authenticated
  USING (account_id IN (
    SELECT id FROM accounts WHERE user_id = auth.uid()
  ));
CREATE POLICY "Partners can view shared transactions" ON public.transactions
  FOR SELECT TO authenticated
  USING (account_id IN (
    SELECT id FROM accounts WHERE user_id IN (
      SELECT pm.user_id FROM partnership_members pm
      WHERE pm.partnership_id IN (
        SELECT partnership_id FROM partnership_members WHERE user_id = auth.uid()
      )
    )
  ));
CREATE POLICY "Users can delete own transactions" ON public.transactions
  FOR DELETE TO authenticated
  USING (account_id IN (
    SELECT id FROM accounts WHERE user_id = auth.uid()
  ));

-- ---- up_api_configs ----
CREATE POLICY "Users can insert own api configs" ON public.up_api_configs
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());
CREATE POLICY "Users can update own api configs" ON public.up_api_configs
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid());
CREATE POLICY "Users can view own api configs" ON public.up_api_configs
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());
CREATE POLICY "Users can delete own api configs" ON public.up_api_configs
  FOR DELETE TO authenticated
  USING (user_id = auth.uid());

-- ---- user_budgets ----
CREATE POLICY "Members can create partnership user budgets" ON public.user_budgets
  FOR INSERT TO authenticated
  WITH CHECK (partnership_id IN (
    SELECT partnership_id FROM partnership_members WHERE user_id = auth.uid()
  ));
CREATE POLICY "Members can delete partnership user budgets" ON public.user_budgets
  FOR DELETE TO authenticated
  USING (partnership_id IN (
    SELECT partnership_id FROM partnership_members WHERE user_id = auth.uid()
  ));
CREATE POLICY "Members can update partnership user budgets" ON public.user_budgets
  FOR UPDATE TO authenticated
  USING (partnership_id IN (
    SELECT partnership_id FROM partnership_members WHERE user_id = auth.uid()
  ));
CREATE POLICY "Members can view partnership user budgets" ON public.user_budgets
  FOR SELECT TO authenticated
  USING (partnership_id IN (
    SELECT partnership_id FROM partnership_members WHERE user_id = auth.uid()
  ));

-- ---- user_dashboard_charts ----
CREATE POLICY "Users can create own dashboard charts" ON public.user_dashboard_charts
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());
CREATE POLICY "Users can delete own dashboard charts" ON public.user_dashboard_charts
  FOR DELETE TO authenticated
  USING (user_id = auth.uid());
CREATE POLICY "Users can update own dashboard charts" ON public.user_dashboard_charts
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid());
CREATE POLICY "Users can view own dashboard charts" ON public.user_dashboard_charts
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

-- ---- watchlist_items ----
CREATE POLICY "Members can create watchlist items" ON public.watchlist_items
  FOR INSERT TO authenticated
  WITH CHECK (partnership_id IN (
    SELECT partnership_id FROM partnership_members WHERE user_id = auth.uid()
  ));
CREATE POLICY "Members can delete watchlist items" ON public.watchlist_items
  FOR DELETE TO authenticated
  USING (partnership_id IN (
    SELECT partnership_id FROM partnership_members WHERE user_id = auth.uid()
  ));
CREATE POLICY "Members can update watchlist items" ON public.watchlist_items
  FOR UPDATE TO authenticated
  USING (partnership_id IN (
    SELECT partnership_id FROM partnership_members WHERE user_id = auth.uid()
  ));
CREATE POLICY "Members can view watchlist items" ON public.watchlist_items
  FOR SELECT TO authenticated
  USING (partnership_id IN (
    SELECT partnership_id FROM partnership_members WHERE user_id = auth.uid()
  ));

-- ============================================================================
-- 11. TRIGGERS
-- ============================================================================

CREATE TRIGGER set_updated_at_accounts BEFORE UPDATE ON public.accounts FOR EACH ROW EXECUTE FUNCTION handle_updated_at();
CREATE TRIGGER set_updated_at_annual_checkups BEFORE UPDATE ON public.annual_checkups FOR EACH ROW EXECUTE FUNCTION handle_updated_at();
CREATE TRIGGER trigger_category_shares_updated_at BEFORE UPDATE ON public.budget_category_shares FOR EACH ROW EXECUTE FUNCTION update_share_updated_at();
CREATE TRIGGER set_updated_at_budgets BEFORE UPDATE ON public.budgets FOR EACH ROW EXECUTE FUNCTION handle_updated_at();
CREATE TRIGGER set_updated_at_investments BEFORE UPDATE ON public.investments FOR EACH ROW EXECUTE FUNCTION handle_updated_at();
CREATE TRIGGER set_updated_at_merchant_category_rules BEFORE UPDATE ON public.merchant_category_rules FOR EACH ROW EXECUTE FUNCTION handle_updated_at();
CREATE TRIGGER set_updated_at_milestones BEFORE UPDATE ON public.milestones FOR EACH ROW EXECUTE FUNCTION handle_updated_at();
CREATE TRIGGER set_updated_at_partnerships BEFORE UPDATE ON public.partnerships FOR EACH ROW EXECUTE FUNCTION handle_updated_at();
CREATE TRIGGER on_profile_created AFTER INSERT ON public.profiles FOR EACH ROW EXECUTE FUNCTION handle_new_profile();
CREATE TRIGGER set_updated_at_profiles BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION handle_updated_at();
CREATE TRIGGER set_updated_at_savings_goals BEFORE UPDATE ON public.savings_goals FOR EACH ROW EXECUTE FUNCTION handle_updated_at();
CREATE TRIGGER set_updated_at_target_allocations BEFORE UPDATE ON public.target_allocations FOR EACH ROW EXECUTE FUNCTION handle_updated_at();
CREATE TRIGGER set_updated_at_transaction_notes BEFORE UPDATE ON public.transaction_notes FOR EACH ROW EXECUTE FUNCTION handle_updated_at();
CREATE TRIGGER trigger_transaction_overrides_updated_at BEFORE UPDATE ON public.transaction_share_overrides FOR EACH ROW EXECUTE FUNCTION update_share_updated_at();
CREATE TRIGGER trigger_invalidate_expense_match AFTER UPDATE ON public.transactions FOR EACH ROW EXECUTE FUNCTION invalidate_expense_match_on_recategorize();
CREATE TRIGGER set_updated_at_up_api_configs BEFORE UPDATE ON public.up_api_configs FOR EACH ROW EXECUTE FUNCTION handle_updated_at();
CREATE TRIGGER set_user_budgets_updated_at BEFORE UPDATE ON public.user_budgets FOR EACH ROW EXECUTE FUNCTION update_user_budgets_updated_at();
CREATE TRIGGER set_updated_at_watchlist_items BEFORE UPDATE ON public.watchlist_items FOR EACH ROW EXECUTE FUNCTION handle_updated_at();

-- ============================================================================
-- 12. AUTH TRIGGER (on auth.users)
-- ============================================================================
-- This trigger creates a profile row when a new user signs up via Supabase Auth.
-- It runs on the auth.users table which is managed by Supabase.

CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ============================================================================
-- 13. FUNCTION GRANTS
-- ============================================================================

GRANT EXECUTE ON FUNCTION public.merge_notification_preferences(uuid, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_methodology_customization(uuid, uuid, text, jsonb, jsonb, timestamptz) TO authenticated;
