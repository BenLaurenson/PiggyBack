-- =====================================================
-- PiggyBack Demo Data Seed Script
-- =====================================================
-- Generates 1 year of realistic Australian financial data
-- for the demo user. Run this AFTER creating the demo user
-- in Supabase Auth.
--
-- Prerequisites:
--   1. All migrations applied
--   2. Demo user created in Supabase Auth (demo@piggyback.app)
--
-- Usage:
--   Run via Supabase SQL Editor or MCP execute_sql
-- =====================================================

-- Look up the demo user's ID from auth.users
DO $$
DECLARE
  v_user_id UUID;
  v_partnership_id UUID := gen_random_uuid();
  v_spending_account_id UUID := gen_random_uuid();
  v_bills_account_id UUID := gen_random_uuid();
  v_emergency_account_id UUID := gen_random_uuid();
  v_holiday_account_id UUID := gen_random_uuid();
  v_home_deposit_account_id UUID := gen_random_uuid();
  v_goal_emergency_id UUID := gen_random_uuid();
  v_goal_holiday_id UUID := gen_random_uuid();
  v_goal_home_id UUID := gen_random_uuid();
  v_expense_rent_id UUID := gen_random_uuid();
  v_expense_electricity_id UUID := gen_random_uuid();
  v_expense_internet_id UUID := gen_random_uuid();
  v_expense_phone_id UUID := gen_random_uuid();
  v_expense_netflix_id UUID := gen_random_uuid();
  v_expense_spotify_id UUID := gen_random_uuid();
  v_expense_gym_id UUID := gen_random_uuid();
  v_expense_insurance_id UUID := gen_random_uuid();
  v_expense_car_id UUID := gen_random_uuid();
  v_expense_pet_id UUID := gen_random_uuid();
  v_investment_vas_id UUID := gen_random_uuid();
  v_investment_vgs_id UUID := gen_random_uuid();
  v_investment_aax_id UUID := gen_random_uuid();
  v_budget_id UUID := gen_random_uuid();
  v_partner_user_id UUID;
  v_joint_spending_account_id UUID := gen_random_uuid();
  v_joint_bills_account_id UUID := gen_random_uuid();
  v_partner_link_request_id UUID := gen_random_uuid();
  v_txn_id UUID;
  v_month_start DATE;
  v_day DATE;
  v_rand DOUBLE PRECISION;
  v_amount_cents BIGINT;
  v_i INT;
  v_j INT;
  v_up_txn_counter INT := 1;
  v_hour INT;
  v_minute INT;
  v_time_offset INTERVAL;
  v_total_balance BIGINT;
  v_invest_total BIGINT;
BEGIN
  -- Get demo user ID
  SELECT id INTO v_user_id FROM auth.users WHERE email = 'demo@piggyback.app';
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Demo user not found. Create demo@piggyback.app in Supabase Auth first.';
  END IF;

  -- =====================================================
  -- 1. Profile (with FIRE plan fields)
  -- =====================================================
  INSERT INTO public.profiles (
    id, email, display_name, theme_preference, budget_methodology,
    budget_view_preference, budget_period_preference, has_onboarded,
    tour_completed, tour_dismissed, ai_provider,
    -- FIRE plan fields
    date_of_birth, target_retirement_age, super_balance_cents,
    super_contribution_rate, expected_return_rate, outside_super_return_rate,
    income_growth_rate, spending_growth_rate, fire_variant,
    annual_expense_override_cents, fire_onboarded
  )
  VALUES (
    v_user_id, 'demo@piggyback.app', 'Alex', 'mint', 'zero-based',
    'shared', 'monthly', true, true, true, 'google',
    -- FIRE: born 1994-03-15 (age ~31), retire at 55, $85k super
    '1994-03-15', 55, 8500000,
    11.5, 7.0, 6.5,
    3.0, 2.5, 'lean',
    NULL, true
  )
  ON CONFLICT (id) DO UPDATE SET
    display_name = 'Alex',
    has_onboarded = true,
    tour_completed = true,
    tour_dismissed = true,
    date_of_birth = '1994-03-15',
    target_retirement_age = 55,
    super_balance_cents = 8500000,
    super_contribution_rate = 11.5,
    expected_return_rate = 7.0,
    outside_super_return_rate = 6.5,
    income_growth_rate = 3.0,
    spending_growth_rate = 2.5,
    fire_variant = 'lean',
    fire_onboarded = true;

  -- =====================================================
  -- 2. Partnership
  -- =====================================================
  -- Clean up trigger-created partnership (handle_new_profile creates one on signup)
  DELETE FROM public.partnership_members WHERE user_id = v_user_id;
  DELETE FROM public.partnerships WHERE id NOT IN (
    SELECT DISTINCT partnership_id FROM public.partnership_members
  );

  INSERT INTO public.partnerships (id, name) VALUES (v_partnership_id, 'Our Budget');
  INSERT INTO public.partnership_members (partnership_id, user_id, role) VALUES (v_partnership_id, v_user_id, 'owner');

  -- =====================================================
  -- 2b. Partner User (Jordan) — optional, skipped if not created
  -- =====================================================
  SELECT id INTO v_partner_user_id FROM auth.users WHERE email = 'partner@piggyback.app';

  IF v_partner_user_id IS NOT NULL THEN
    -- Partner profile (with FIRE fields)
    INSERT INTO public.profiles (
      id, email, display_name, theme_preference, budget_methodology,
      budget_view_preference, budget_period_preference, has_onboarded,
      tour_completed, tour_dismissed, ai_provider,
      date_of_birth, target_retirement_age, super_balance_cents,
      super_contribution_rate, expected_return_rate, outside_super_return_rate,
      income_growth_rate, spending_growth_rate, fire_variant, fire_onboarded
    )
    VALUES (
      v_partner_user_id, 'partner@piggyback.app', 'Jordan', 'mint', 'zero-based',
      'shared', 'monthly', true, true, true, 'google',
      '1995-08-22', 55, 6200000,
      11.5, 7.0, 6.5,
      3.0, 2.5, 'lean', true
    )
    ON CONFLICT (id) DO UPDATE SET
      display_name = 'Jordan',
      has_onboarded = true,
      tour_completed = true,
      tour_dismissed = true,
      date_of_birth = '1995-08-22',
      fire_onboarded = true;

    -- Clean up any trigger-created partnership for partner
    DELETE FROM public.partnership_members WHERE user_id = v_partner_user_id;
    DELETE FROM public.partnerships WHERE id NOT IN (
      SELECT DISTINCT partnership_id FROM public.partnership_members
    );

    -- Add Jordan to Alex's partnership (simulates accepted partner link)
    INSERT INTO public.partnership_members (partnership_id, user_id, role)
    VALUES (v_partnership_id, v_partner_user_id, 'member')
    ON CONFLICT (partnership_id, user_id) DO NOTHING;

    -- Partner UP API Config (placeholder)
    INSERT INTO public.up_api_configs (user_id, encrypted_token, is_active, last_synced_at)
    VALUES (v_partner_user_id, 'demo-partner-token-not-real', true, NOW())
    ON CONFLICT (user_id) DO NOTHING;

    RAISE NOTICE 'Partner user (Jordan) found and added to partnership.';
  ELSE
    RAISE NOTICE 'Partner user not found (partner@piggyback.app). Skipping partner data.';
  END IF;

  -- =====================================================
  -- 3. UP API Config (placeholder)
  -- =====================================================
  INSERT INTO public.up_api_configs (user_id, encrypted_token, is_active, last_synced_at)
  VALUES (v_user_id, 'demo-token-not-real', true, NOW());

  -- =====================================================
  -- 4. Accounts
  -- =====================================================
  INSERT INTO public.accounts (id, user_id, up_account_id, display_name, account_type, ownership_type, balance_cents, is_active, last_synced_at) VALUES
    (v_spending_account_id, v_user_id, 'demo-spending', 'Spending', 'TRANSACTIONAL', 'INDIVIDUAL', 243567, true, NOW()),
    (v_bills_account_id, v_user_id, 'demo-bills', 'Bills', 'TRANSACTIONAL', 'INDIVIDUAL', 182340, true, NOW()),
    (v_emergency_account_id, v_user_id, 'demo-emergency', 'Emergency Fund', 'SAVER', 'INDIVIDUAL', 1200000, true, NOW()),
    (v_holiday_account_id, v_user_id, 'demo-holiday', 'Holiday Savings', 'SAVER', 'INDIVIDUAL', 350000, true, NOW()),
    (v_home_deposit_account_id, v_user_id, 'demo-home-deposit', 'Home Deposit', 'SAVER', 'INDIVIDUAL', 4500000, true, NOW());

  -- =====================================================
  -- 4b. JOINT (2Up) Accounts
  -- =====================================================
  -- Alex's JOINT accounts
  INSERT INTO public.accounts (id, user_id, up_account_id, display_name, account_type, ownership_type, balance_cents, is_active, last_synced_at) VALUES
    (v_joint_spending_account_id, v_user_id, 'demo-joint-spending', '2Up Spending', 'TRANSACTIONAL', 'JOINT', 156780, true, NOW()),
    (v_joint_bills_account_id, v_user_id, 'demo-joint-bills', '2Up Bills', 'TRANSACTIONAL', 'JOINT', 89450, true, NOW());

  -- Jordan's matching JOINT accounts (same up_account_id = dedup target)
  IF v_partner_user_id IS NOT NULL THEN
    INSERT INTO public.accounts (id, user_id, up_account_id, display_name, account_type, ownership_type, balance_cents, is_active, last_synced_at) VALUES
      (gen_random_uuid(), v_partner_user_id, 'demo-joint-spending', '2Up Spending', 'TRANSACTIONAL', 'JOINT', 156780, true, NOW()),
      (gen_random_uuid(), v_partner_user_id, 'demo-joint-bills', '2Up Bills', 'TRANSACTIONAL', 'JOINT', 89450, true, NOW());

    -- Partner link request (accepted)
    INSERT INTO public.partner_link_requests (id, shared_up_account_id, requester_user_id, target_user_id, status, primary_partnership_id, created_at, updated_at)
    VALUES (v_partner_link_request_id, 'demo-joint-spending', v_user_id, v_partner_user_id, 'accepted', v_partnership_id, NOW() - INTERVAL '30 days', NOW() - INTERVAL '29 days');
  END IF;

  -- =====================================================
  -- 5. Categories (seed if not already present from migrations)
  -- =====================================================
  INSERT INTO public.categories (id, name, parent_category_id) VALUES
    -- Parent categories
    ('good-life', 'Good Life', NULL),
    ('home', 'Home', NULL),
    ('personal', 'Personal', NULL),
    ('transport', 'Transport', NULL),
    ('salary-income', 'Salary & Income', NULL),
    ('internal-transfer', 'Internal Transfer', NULL),
    ('external-transfer', 'External Transfer', NULL),
    ('round-up', 'Round Up Savings', NULL),
    ('interest', 'Interest Earned', NULL),
    -- Good Life subcategories
    ('restaurants-and-cafes', 'Restaurants & Cafes', 'good-life'),
    ('takeaway', 'Takeaway', 'good-life'),
    ('pubs-and-bars', 'Pubs & Bars', 'good-life'),
    ('booze', 'Booze', 'good-life'),
    ('holidays-and-travel', 'Holidays & Travel', 'good-life'),
    ('hobbies', 'Hobbies', 'good-life'),
    ('tv-and-music', 'TV, Music & Streaming', 'good-life'),
    ('games-and-software', 'Apps, Games & Software', 'good-life'),
    ('events-and-gigs', 'Events & Gigs', 'good-life'),
    ('tobacco-and-vaping', 'Tobacco & Vaping', 'good-life'),
    ('lottery-and-gambling', 'Lottery & Gambling', 'good-life'),
    ('adult', 'Adult', 'good-life'),
    -- Home subcategories
    ('groceries', 'Groceries', 'home'),
    ('rent-and-mortgage', 'Rent & Mortgage', 'home'),
    ('utilities', 'Utilities', 'home'),
    ('internet', 'Internet', 'home'),
    ('home-insurance-and-rates', 'Rates & Insurance', 'home'),
    ('homeware-and-appliances', 'Homeware & Appliances', 'home'),
    ('home-maintenance-and-improvements', 'Maintenance & Improvements', 'home'),
    ('pets', 'Pets', 'home'),
    -- Personal subcategories
    ('health-and-medical', 'Health & Medical', 'personal'),
    ('fitness-and-wellbeing', 'Fitness & Wellbeing', 'personal'),
    ('hair-and-beauty', 'Hair & Beauty', 'personal'),
    ('clothing-and-accessories', 'Clothing & Accessories', 'personal'),
    ('gifts-and-charity', 'Gifts & Charity', 'personal'),
    ('education-and-student-loans', 'Education & Student Loans', 'personal'),
    ('mobile-phone', 'Mobile Phone', 'personal'),
    ('technology', 'Technology', 'personal'),
    ('life-admin', 'Life Admin', 'personal'),
    ('news-magazines-and-books', 'News, Magazines & Books', 'personal'),
    ('investments', 'Investments', 'personal'),
    ('family', 'Children & Family', 'personal'),
    -- Transport subcategories
    ('fuel', 'Fuel', 'transport'),
    ('parking', 'Parking', 'transport'),
    ('public-transport', 'Public Transport', 'transport'),
    ('car-insurance-and-maintenance', 'Car Insurance, Rego & Maintenance', 'transport'),
    ('car-repayments', 'Repayments', 'transport'),
    ('taxis-and-share-cars', 'Taxis & Share Cars', 'transport'),
    ('toll-roads', 'Tolls', 'transport'),
    ('cycling', 'Cycling', 'transport')
  ON CONFLICT (id) DO NOTHING;

  -- =====================================================
  -- 6. Category Mappings
  -- =====================================================
  INSERT INTO public.category_mappings (up_category_id, new_parent_name, new_child_name, icon, display_order) VALUES
    ('groceries', 'Food & Dining', 'Groceries', '🛒', 1),
    ('rent-and-mortgage', 'Housing & Utilities', 'Rent & Mortgage', '🏠', 2),
    ('utilities', 'Housing & Utilities', 'Utilities', '💡', 3),
    ('internet', 'Housing & Utilities', 'Internet', '🌐', 4),
    ('home-insurance-and-rates', 'Housing & Utilities', 'Rates & Insurance', '📋', 5),
    ('homeware-and-appliances', 'Housing & Utilities', 'Homeware & Appliances', '🪑', 6),
    ('home-maintenance-and-improvements', 'Housing & Utilities', 'Maintenance & Improvements', '🔧', 7),
    ('pets', 'Pets', 'Pets', '🐾', 8),
    ('restaurants-and-cafes', 'Food & Dining', 'Restaurants & Cafes', '🍽️', 9),
    ('takeaway', 'Food & Dining', 'Takeaway', '🥡', 10),
    ('pubs-and-bars', 'Entertainment & Leisure', 'Pubs & Bars', '🍺', 11),
    ('booze', 'Food & Dining', 'Booze', '🍷', 12),
    ('holidays-and-travel', 'Entertainment & Leisure', 'Holidays & Travel', '✈️', 13),
    ('hobbies', 'Entertainment & Leisure', 'Hobbies', '🎨', 14),
    ('tv-and-music', 'Entertainment & Leisure', 'TV, Music & Streaming', '📺', 15),
    ('games-and-software', 'Entertainment & Leisure', 'Apps, Games & Software', '🎮', 16),
    ('events-and-gigs', 'Entertainment & Leisure', 'Events & Gigs', '🎟️', 17),
    ('tobacco-and-vaping', 'Entertainment & Leisure', 'Tobacco & Vaping', '🚬', 18),
    ('lottery-and-gambling', 'Entertainment & Leisure', 'Lottery & Gambling', '🎰', 19),
    ('adult', 'Entertainment & Leisure', 'Adult', '🔞', 20),
    ('health-and-medical', 'Personal Care & Health', 'Health & Medical', '🏥', 21),
    ('fitness-and-wellbeing', 'Personal Care & Health', 'Fitness & Wellbeing', '💪', 22),
    ('hair-and-beauty', 'Personal Care & Health', 'Hair & Beauty', '💇', 23),
    ('clothing-and-accessories', 'Personal Care & Health', 'Clothing & Accessories', '👕', 24),
    ('gifts-and-charity', 'Gifts & Charity', 'Gifts & Charity', '🎁', 25),
    ('education-and-student-loans', 'Family & Education', 'Education & Student Loans', '📚', 26),
    ('mobile-phone', 'Technology & Communication', 'Mobile Phone', '📱', 27),
    ('technology', 'Technology & Communication', 'Technology', '💻', 28),
    ('life-admin', 'Financial & Admin', 'Life Admin', '📎', 29),
    ('news-magazines-and-books', 'Entertainment & Leisure', 'News, Magazines & Books', '📰', 30),
    ('investments', 'Financial & Admin', 'Investments', '📈', 31),
    ('family', 'Family & Education', 'Children & Family', '👶', 32),
    ('fuel', 'Transportation', 'Fuel', '⛽', 33),
    ('parking', 'Transportation', 'Parking', '🅿️', 34),
    ('public-transport', 'Transportation', 'Public Transport', '🚌', 35),
    ('car-insurance-and-maintenance', 'Transportation', 'Car Insurance, Rego & Maintenance', '🚗', 36),
    ('car-repayments', 'Transportation', 'Repayments', '💰', 37),
    ('taxis-and-share-cars', 'Transportation', 'Taxis & Share Cars', '🚕', 38),
    ('toll-roads', 'Transportation', 'Tolls', '🛣️', 39),
    ('cycling', 'Transportation', 'Cycling', '🚴', 40)
  ON CONFLICT (up_category_id) DO UPDATE SET new_parent_name = EXCLUDED.new_parent_name;

  -- =====================================================
  -- 7. Transactions (1 year: Feb 2025 → Feb 2026)
  --    Each transaction gets a varied time of day
  -- =====================================================

  FOR v_i IN 0..11 LOOP
    v_month_start := DATE '2025-02-01' + (v_i * INTERVAL '1 month');

    -- === SALARY (fortnightly, ~$3,800 net) — morning deposit ===
    FOR v_j IN 0..1 LOOP
      v_txn_id := gen_random_uuid();
      v_day := v_month_start + (v_j * 14 + 1) * INTERVAL '1 day';
      v_time_offset := (6 + (random() * 3)::INT) * INTERVAL '1 hour' + ((random() * 59)::INT) * INTERVAL '1 minute';
      INSERT INTO public.transactions (id, account_id, up_transaction_id, description, amount_cents, status, category_id, parent_category_id, settled_at, created_at, is_income, income_type, card_purchase_method)
      VALUES (v_txn_id, v_spending_account_id, 'demo-txn-' || v_up_txn_counter, 'ACME Corp Salary', 380000 + (random() * 20000)::INT, 'SETTLED', 'salary-income', 'salary-income', v_day + v_time_offset, v_day + v_time_offset, true, 'salary', NULL);
      v_up_txn_counter := v_up_txn_counter + 1;
    END LOOP;

    -- === GROCERIES (8-12 per month, $40-$180 each) — daytime/evening ===
    FOR v_j IN 1..(8 + (random() * 4)::INT) LOOP
      v_txn_id := gen_random_uuid();
      v_rand := random();
      v_day := v_month_start + ((random() * 27)::INT * INTERVAL '1 day');
      v_time_offset := (9 + (random() * 11)::INT) * INTERVAL '1 hour' + ((random() * 59)::INT) * INTERVAL '1 minute' + ((random() * 59)::INT) * INTERVAL '1 second';
      INSERT INTO public.transactions (id, account_id, up_transaction_id, description, amount_cents, status, category_id, parent_category_id, settled_at, created_at, card_purchase_method)
      VALUES (v_txn_id, v_spending_account_id, 'demo-txn-' || v_up_txn_counter,
        CASE WHEN v_rand < 0.4 THEN 'Woolworths'
             WHEN v_rand < 0.7 THEN 'Coles'
             WHEN v_rand < 0.85 THEN 'ALDI'
             ELSE 'IGA' END,
        -(4000 + (random() * 14000)::INT), 'SETTLED', 'groceries', 'home',
        v_day + v_time_offset, v_day + v_time_offset, 'CONTACTLESS');
      v_up_txn_counter := v_up_txn_counter + 1;
    END LOOP;

    -- === DINING OUT (4-8 per month, $15-$80) — lunch/dinner ===
    FOR v_j IN 1..(4 + (random() * 4)::INT) LOOP
      v_txn_id := gen_random_uuid();
      v_rand := random();
      v_day := v_month_start + ((random() * 27)::INT * INTERVAL '1 day');
      v_time_offset := (11 + (random() * 10)::INT) * INTERVAL '1 hour' + ((random() * 59)::INT) * INTERVAL '1 minute' + ((random() * 59)::INT) * INTERVAL '1 second';
      INSERT INTO public.transactions (id, account_id, up_transaction_id, description, amount_cents, status, category_id, parent_category_id, settled_at, created_at, card_purchase_method)
      VALUES (v_txn_id, v_spending_account_id, 'demo-txn-' || v_up_txn_counter,
        CASE WHEN v_rand < 0.25 THEN 'The Humble Onion Cafe'
             WHEN v_rand < 0.5 THEN 'Guzman Y Gomez'
             WHEN v_rand < 0.75 THEN 'Nandos'
             ELSE 'Sushi Hub' END,
        -(1500 + (random() * 6500)::INT), 'SETTLED', 'restaurants-and-cafes', 'good-life',
        v_day + v_time_offset, v_day + v_time_offset, 'CONTACTLESS');
      v_up_txn_counter := v_up_txn_counter + 1;
    END LOOP;

    -- === TAKEAWAY (3-5 per month, $15-$50) — evening ===
    FOR v_j IN 1..(3 + (random() * 2)::INT) LOOP
      v_txn_id := gen_random_uuid();
      v_rand := random();
      v_day := v_month_start + ((random() * 27)::INT * INTERVAL '1 day');
      v_time_offset := (17 + (random() * 4)::INT) * INTERVAL '1 hour' + ((random() * 59)::INT) * INTERVAL '1 minute' + ((random() * 59)::INT) * INTERVAL '1 second';
      INSERT INTO public.transactions (id, account_id, up_transaction_id, description, amount_cents, status, category_id, parent_category_id, settled_at, created_at, card_purchase_method)
      VALUES (v_txn_id, v_spending_account_id, 'demo-txn-' || v_up_txn_counter,
        CASE WHEN v_rand < 0.3 THEN 'Uber Eats'
             WHEN v_rand < 0.6 THEN 'DoorDash'
             WHEN v_rand < 0.8 THEN 'Menulog'
             ELSE 'Dominos Pizza' END,
        -(1500 + (random() * 3500)::INT), 'SETTLED', 'takeaway', 'good-life',
        v_day + v_time_offset, v_day + v_time_offset, 'ECOMMERCE');
      v_up_txn_counter := v_up_txn_counter + 1;
    END LOOP;

    -- === COFFEE (10-15 per month, $4-$7) — morning ===
    FOR v_j IN 1..(10 + (random() * 5)::INT) LOOP
      v_txn_id := gen_random_uuid();
      v_day := v_month_start + ((random() * 27)::INT * INTERVAL '1 day');
      v_time_offset := (6 + (random() * 4)::INT) * INTERVAL '1 hour' + ((random() * 59)::INT) * INTERVAL '1 minute' + ((random() * 59)::INT) * INTERVAL '1 second';
      INSERT INTO public.transactions (id, account_id, up_transaction_id, description, amount_cents, status, category_id, parent_category_id, settled_at, created_at, card_purchase_method)
      VALUES (v_txn_id, v_spending_account_id, 'demo-txn-' || v_up_txn_counter,
        CASE WHEN random() < 0.5 THEN 'The Good Brew' ELSE 'Gloria Jeans' END,
        -(400 + (random() * 300)::INT), 'SETTLED', 'restaurants-and-cafes', 'good-life',
        v_day + v_time_offset, v_day + v_time_offset, 'CONTACTLESS');
      v_up_txn_counter := v_up_txn_counter + 1;
    END LOOP;

    -- === FUEL (2-3 per month, $60-$120) — varied times ===
    FOR v_j IN 1..(2 + (random() * 1)::INT) LOOP
      v_txn_id := gen_random_uuid();
      v_day := v_month_start + ((random() * 27)::INT * INTERVAL '1 day');
      v_time_offset := (7 + (random() * 14)::INT) * INTERVAL '1 hour' + ((random() * 59)::INT) * INTERVAL '1 minute' + ((random() * 59)::INT) * INTERVAL '1 second';
      INSERT INTO public.transactions (id, account_id, up_transaction_id, description, amount_cents, status, category_id, parent_category_id, settled_at, created_at, card_purchase_method)
      VALUES (v_txn_id, v_spending_account_id, 'demo-txn-' || v_up_txn_counter,
        CASE WHEN random() < 0.5 THEN 'BP Cannington' ELSE 'Ampol Carousel' END,
        -(6000 + (random() * 6000)::INT), 'SETTLED', 'fuel', 'transport',
        v_day + v_time_offset, v_day + v_time_offset, 'CONTACTLESS');
      v_up_txn_counter := v_up_txn_counter + 1;
    END LOOP;

    -- === SUBSCRIPTIONS (monthly, fixed billing times) ===
    -- Netflix (5th, evening auto-charge)
    v_txn_id := gen_random_uuid();
    v_time_offset := INTERVAL '19 hours' + ((random() * 59)::INT) * INTERVAL '1 minute';
    INSERT INTO public.transactions (id, account_id, up_transaction_id, description, amount_cents, status, category_id, parent_category_id, settled_at, created_at, card_purchase_method)
    VALUES (v_txn_id, v_bills_account_id, 'demo-txn-' || v_up_txn_counter, 'Netflix', -2299, 'SETTLED', 'tv-and-music', 'good-life', v_month_start + INTERVAL '5 days' + v_time_offset, v_month_start + INTERVAL '5 days' + v_time_offset, 'CARD_ON_FILE');
    v_up_txn_counter := v_up_txn_counter + 1;

    -- Spotify (8th)
    v_txn_id := gen_random_uuid();
    v_time_offset := INTERVAL '14 hours' + ((random() * 59)::INT) * INTERVAL '1 minute';
    INSERT INTO public.transactions (id, account_id, up_transaction_id, description, amount_cents, status, category_id, parent_category_id, settled_at, created_at, card_purchase_method)
    VALUES (v_txn_id, v_bills_account_id, 'demo-txn-' || v_up_txn_counter, 'Spotify Premium', -1299, 'SETTLED', 'tv-and-music', 'good-life', v_month_start + INTERVAL '8 days' + v_time_offset, v_month_start + INTERVAL '8 days' + v_time_offset, 'CARD_ON_FILE');
    v_up_txn_counter := v_up_txn_counter + 1;

    -- Gym (3rd, morning debit)
    v_txn_id := gen_random_uuid();
    v_time_offset := INTERVAL '6 hours' + ((random() * 30)::INT) * INTERVAL '1 minute';
    INSERT INTO public.transactions (id, account_id, up_transaction_id, description, amount_cents, status, category_id, parent_category_id, settled_at, created_at, card_purchase_method)
    VALUES (v_txn_id, v_bills_account_id, 'demo-txn-' || v_up_txn_counter, 'Anytime Fitness', -6999, 'SETTLED', 'fitness-and-wellbeing', 'personal', v_month_start + INTERVAL '3 days' + v_time_offset, v_month_start + INTERVAL '3 days' + v_time_offset, 'CARD_ON_FILE');
    v_up_txn_counter := v_up_txn_counter + 1;

    -- Phone (12th)
    v_txn_id := gen_random_uuid();
    v_time_offset := INTERVAL '10 hours' + ((random() * 59)::INT) * INTERVAL '1 minute';
    INSERT INTO public.transactions (id, account_id, up_transaction_id, description, amount_cents, status, category_id, parent_category_id, settled_at, created_at, card_purchase_method)
    VALUES (v_txn_id, v_bills_account_id, 'demo-txn-' || v_up_txn_counter, 'Telstra', -5500, 'SETTLED', 'mobile-phone', 'personal', v_month_start + INTERVAL '12 days' + v_time_offset, v_month_start + INTERVAL '12 days' + v_time_offset, 'CARD_ON_FILE');
    v_up_txn_counter := v_up_txn_counter + 1;

    -- === PUB/BAR (2-4 per month, $20-$80) — evening ===
    FOR v_j IN 1..(2 + (random() * 2)::INT) LOOP
      v_txn_id := gen_random_uuid();
      v_day := v_month_start + ((random() * 27)::INT * INTERVAL '1 day');
      v_time_offset := (18 + (random() * 5)::INT) * INTERVAL '1 hour' + ((random() * 59)::INT) * INTERVAL '1 minute' + ((random() * 59)::INT) * INTERVAL '1 second';
      INSERT INTO public.transactions (id, account_id, up_transaction_id, description, amount_cents, status, category_id, parent_category_id, settled_at, created_at, card_purchase_method)
      VALUES (v_txn_id, v_spending_account_id, 'demo-txn-' || v_up_txn_counter,
        CASE WHEN random() < 0.33 THEN 'The Generous Squire'
             WHEN random() < 0.66 THEN 'Varsity Bar'
             ELSE 'The Cambridge' END,
        -(2000 + (random() * 6000)::INT), 'SETTLED', 'pubs-and-bars', 'good-life',
        v_day + v_time_offset, v_day + v_time_offset, 'CONTACTLESS');
      v_up_txn_counter := v_up_txn_counter + 1;
    END LOOP;

    -- === CLOTHING (1-2 per month, $30-$150) — afternoon ===
    FOR v_j IN 1..(1 + (random() * 1)::INT) LOOP
      v_txn_id := gen_random_uuid();
      v_day := v_month_start + ((random() * 27)::INT * INTERVAL '1 day');
      v_time_offset := (12 + (random() * 6)::INT) * INTERVAL '1 hour' + ((random() * 59)::INT) * INTERVAL '1 minute' + ((random() * 59)::INT) * INTERVAL '1 second';
      INSERT INTO public.transactions (id, account_id, up_transaction_id, description, amount_cents, status, category_id, parent_category_id, settled_at, created_at, card_purchase_method)
      VALUES (v_txn_id, v_spending_account_id, 'demo-txn-' || v_up_txn_counter,
        CASE WHEN random() < 0.33 THEN 'Uniqlo'
             WHEN random() < 0.66 THEN 'Cotton On'
             ELSE 'Target' END,
        -(3000 + (random() * 12000)::INT), 'SETTLED', 'clothing-and-accessories', 'personal',
        v_day + v_time_offset, v_day + v_time_offset, 'CONTACTLESS');
      v_up_txn_counter := v_up_txn_counter + 1;
    END LOOP;

    -- === PUBLIC TRANSPORT (8-12 per month, $3-$8) — commute hours ===
    FOR v_j IN 1..(8 + (random() * 4)::INT) LOOP
      v_txn_id := gen_random_uuid();
      v_day := v_month_start + ((random() * 27)::INT * INTERVAL '1 day');
      -- Morning or evening commute
      IF random() < 0.5 THEN
        v_time_offset := (7 + (random() * 2)::INT) * INTERVAL '1 hour' + ((random() * 59)::INT) * INTERVAL '1 minute' + ((random() * 59)::INT) * INTERVAL '1 second';
      ELSE
        v_time_offset := (17 + (random() * 2)::INT) * INTERVAL '1 hour' + ((random() * 59)::INT) * INTERVAL '1 minute' + ((random() * 59)::INT) * INTERVAL '1 second';
      END IF;
      INSERT INTO public.transactions (id, account_id, up_transaction_id, description, amount_cents, status, category_id, parent_category_id, settled_at, created_at, card_purchase_method)
      VALUES (v_txn_id, v_spending_account_id, 'demo-txn-' || v_up_txn_counter, 'Transperth', -(300 + (random() * 500)::INT), 'SETTLED', 'public-transport', 'transport',
        v_day + v_time_offset, v_day + v_time_offset, 'CONTACTLESS');
      v_up_txn_counter := v_up_txn_counter + 1;
    END LOOP;

    -- === PARKING (2-3 per month, $5-$25) ===
    FOR v_j IN 1..(2 + (random() * 1)::INT) LOOP
      v_txn_id := gen_random_uuid();
      v_day := v_month_start + ((random() * 27)::INT * INTERVAL '1 day');
      v_time_offset := (8 + (random() * 10)::INT) * INTERVAL '1 hour' + ((random() * 59)::INT) * INTERVAL '1 minute' + ((random() * 59)::INT) * INTERVAL '1 second';
      INSERT INTO public.transactions (id, account_id, up_transaction_id, description, amount_cents, status, category_id, parent_category_id, settled_at, created_at, card_purchase_method)
      VALUES (v_txn_id, v_spending_account_id, 'demo-txn-' || v_up_txn_counter, 'Wilson Parking', -(500 + (random() * 2000)::INT), 'SETTLED', 'parking', 'transport',
        v_day + v_time_offset, v_day + v_time_offset, 'CONTACTLESS');
      v_up_txn_counter := v_up_txn_counter + 1;
    END LOOP;

    -- === HEALTH (1-2 per month, $40-$200) ===
    IF random() > 0.3 THEN
      v_txn_id := gen_random_uuid();
      v_day := v_month_start + ((random() * 27)::INT * INTERVAL '1 day');
      v_time_offset := (9 + (random() * 8)::INT) * INTERVAL '1 hour' + ((random() * 59)::INT) * INTERVAL '1 minute' + ((random() * 59)::INT) * INTERVAL '1 second';
      INSERT INTO public.transactions (id, account_id, up_transaction_id, description, amount_cents, status, category_id, parent_category_id, settled_at, created_at, card_purchase_method)
      VALUES (v_txn_id, v_spending_account_id, 'demo-txn-' || v_up_txn_counter,
        CASE WHEN random() < 0.5 THEN 'Priceline Pharmacy' ELSE 'Chemist Warehouse' END,
        -(4000 + (random() * 16000)::INT), 'SETTLED', 'health-and-medical', 'personal',
        v_day + v_time_offset, v_day + v_time_offset, 'CONTACTLESS');
      v_up_txn_counter := v_up_txn_counter + 1;
    END IF;

    -- === HOUSEHOLD (1-2 per month, $20-$200) ===
    IF random() > 0.4 THEN
      v_txn_id := gen_random_uuid();
      v_day := v_month_start + ((random() * 27)::INT * INTERVAL '1 day');
      v_time_offset := (10 + (random() * 8)::INT) * INTERVAL '1 hour' + ((random() * 59)::INT) * INTERVAL '1 minute' + ((random() * 59)::INT) * INTERVAL '1 second';
      INSERT INTO public.transactions (id, account_id, up_transaction_id, description, amount_cents, status, category_id, parent_category_id, settled_at, created_at, card_purchase_method)
      VALUES (v_txn_id, v_spending_account_id, 'demo-txn-' || v_up_txn_counter,
        CASE WHEN random() < 0.5 THEN 'Bunnings Warehouse' ELSE 'Kmart' END,
        -(2000 + (random() * 18000)::INT), 'SETTLED', 'homeware-and-appliances', 'home',
        v_day + v_time_offset, v_day + v_time_offset, 'CONTACTLESS');
      v_up_txn_counter := v_up_txn_counter + 1;
    END IF;

    -- === TECH/HOBBIES (0-1 per month, $20-$300) ===
    IF random() > 0.6 THEN
      v_txn_id := gen_random_uuid();
      v_day := v_month_start + ((random() * 27)::INT * INTERVAL '1 day');
      v_time_offset := (10 + (random() * 12)::INT) * INTERVAL '1 hour' + ((random() * 59)::INT) * INTERVAL '1 minute' + ((random() * 59)::INT) * INTERVAL '1 second';
      INSERT INTO public.transactions (id, account_id, up_transaction_id, description, amount_cents, status, category_id, parent_category_id, settled_at, created_at, card_purchase_method)
      VALUES (v_txn_id, v_spending_account_id, 'demo-txn-' || v_up_txn_counter,
        CASE WHEN random() < 0.5 THEN 'JB Hi-Fi' ELSE 'Amazon' END,
        -(2000 + (random() * 28000)::INT), 'SETTLED', 'technology', 'personal',
        v_day + v_time_offset, v_day + v_time_offset, CASE WHEN random() < 0.5 THEN 'CONTACTLESS' ELSE 'ECOMMERCE' END);
      v_up_txn_counter := v_up_txn_counter + 1;
    END IF;

    -- === GIFTS (0-1 per month, $30-$100) ===
    IF random() > 0.6 THEN
      v_txn_id := gen_random_uuid();
      v_day := v_month_start + ((random() * 27)::INT * INTERVAL '1 day');
      v_time_offset := (11 + (random() * 7)::INT) * INTERVAL '1 hour' + ((random() * 59)::INT) * INTERVAL '1 minute' + ((random() * 59)::INT) * INTERVAL '1 second';
      INSERT INTO public.transactions (id, account_id, up_transaction_id, description, amount_cents, status, category_id, parent_category_id, settled_at, created_at, card_purchase_method)
      VALUES (v_txn_id, v_spending_account_id, 'demo-txn-' || v_up_txn_counter, 'Myer', -(3000 + (random() * 7000)::INT), 'SETTLED', 'gifts-and-charity', 'personal',
        v_day + v_time_offset, v_day + v_time_offset, 'CONTACTLESS');
      v_up_txn_counter := v_up_txn_counter + 1;
    END IF;

    -- === PET EXPENSES (1 per month, $30-$80) ===
    v_txn_id := gen_random_uuid();
    v_day := v_month_start + ((random() * 27)::INT * INTERVAL '1 day');
    v_time_offset := (10 + (random() * 8)::INT) * INTERVAL '1 hour' + ((random() * 59)::INT) * INTERVAL '1 minute' + ((random() * 59)::INT) * INTERVAL '1 second';
    INSERT INTO public.transactions (id, account_id, up_transaction_id, description, amount_cents, status, category_id, parent_category_id, settled_at, created_at, card_purchase_method)
    VALUES (v_txn_id, v_spending_account_id, 'demo-txn-' || v_up_txn_counter,
      CASE WHEN random() < 0.5 THEN 'PETstock' ELSE 'My Pet Warehouse' END,
      -(3000 + (random() * 5000)::INT), 'SETTLED', 'pets', 'home',
      v_day + v_time_offset, v_day + v_time_offset, 'CONTACTLESS');
    v_up_txn_counter := v_up_txn_counter + 1;

    -- === ALCOHOL (1-2 per month, $20-$60) ===
    IF random() > 0.3 THEN
      v_txn_id := gen_random_uuid();
      v_day := v_month_start + ((random() * 27)::INT * INTERVAL '1 day');
      v_time_offset := (14 + (random() * 7)::INT) * INTERVAL '1 hour' + ((random() * 59)::INT) * INTERVAL '1 minute' + ((random() * 59)::INT) * INTERVAL '1 second';
      INSERT INTO public.transactions (id, account_id, up_transaction_id, description, amount_cents, status, category_id, parent_category_id, settled_at, created_at, card_purchase_method)
      VALUES (v_txn_id, v_spending_account_id, 'demo-txn-' || v_up_txn_counter,
        CASE WHEN random() < 0.5 THEN 'BWS' ELSE 'Dan Murphys' END,
        -(2000 + (random() * 4000)::INT), 'SETTLED', 'booze', 'good-life',
        v_day + v_time_offset, v_day + v_time_offset, 'CONTACTLESS');
      v_up_txn_counter := v_up_txn_counter + 1;
    END IF;

    -- === HAIR (every 2 months, $30-$80) ===
    IF v_i % 2 = 0 THEN
      v_txn_id := gen_random_uuid();
      v_day := v_month_start + ((random() * 27)::INT * INTERVAL '1 day');
      v_time_offset := (10 + (random() * 6)::INT) * INTERVAL '1 hour' + ((random() * 59)::INT) * INTERVAL '1 minute' + ((random() * 59)::INT) * INTERVAL '1 second';
      INSERT INTO public.transactions (id, account_id, up_transaction_id, description, amount_cents, status, category_id, parent_category_id, settled_at, created_at, card_purchase_method)
      VALUES (v_txn_id, v_spending_account_id, 'demo-txn-' || v_up_txn_counter, 'Just Cuts', -(3000 + (random() * 5000)::INT), 'SETTLED', 'hair-and-beauty', 'personal',
        v_day + v_time_offset, v_day + v_time_offset, 'CONTACTLESS');
      v_up_txn_counter := v_up_txn_counter + 1;
    END IF;

    -- === CAR INSURANCE (quarterly, ~$180) ===
    IF v_i % 3 = 1 THEN
      v_txn_id := gen_random_uuid();
      v_time_offset := INTERVAL '9 hours' + ((random() * 59)::INT) * INTERVAL '1 minute';
      INSERT INTO public.transactions (id, account_id, up_transaction_id, description, amount_cents, status, category_id, parent_category_id, settled_at, created_at, card_purchase_method)
      VALUES (v_txn_id, v_bills_account_id, 'demo-txn-' || v_up_txn_counter, 'RAC Insurance', -(18000 + (random() * 2000)::INT), 'SETTLED', 'car-insurance-and-maintenance', 'transport',
        v_month_start + INTERVAL '18 days' + v_time_offset, v_month_start + INTERVAL '18 days' + v_time_offset, 'CARD_ON_FILE');
      v_up_txn_counter := v_up_txn_counter + 1;
    END IF;

    -- === INTEREST EARNED (monthly, small amounts, end of month) ===
    v_txn_id := gen_random_uuid();
    v_time_offset := INTERVAL '23 hours 59 minutes';
    INSERT INTO public.transactions (id, account_id, up_transaction_id, description, amount_cents, status, category_id, parent_category_id, settled_at, created_at, is_income, income_type)
    VALUES (v_txn_id, v_emergency_account_id, 'demo-txn-' || v_up_txn_counter, 'Interest', (1500 + (random() * 3000)::INT), 'SETTLED', 'interest', 'interest',
      v_month_start + INTERVAL '28 days' + v_time_offset, v_month_start + INTERVAL '28 days' + v_time_offset, true, 'interest');
    v_up_txn_counter := v_up_txn_counter + 1;

    -- === SAVINGS TRANSFERS (monthly, payday morning) ===
    v_time_offset := INTERVAL '7 hours 30 minutes';
    -- To emergency fund
    v_txn_id := gen_random_uuid();
    INSERT INTO public.transactions (id, account_id, up_transaction_id, description, amount_cents, status, category_id, settled_at, created_at, is_internal_transfer, transfer_account_id)
    VALUES (v_txn_id, v_spending_account_id, 'demo-txn-' || v_up_txn_counter, 'Transfer to Emergency Fund', -50000, 'SETTLED', 'internal-transfer',
      v_month_start + INTERVAL '2 days' + v_time_offset, v_month_start + INTERVAL '2 days' + v_time_offset, true, v_emergency_account_id);
    v_up_txn_counter := v_up_txn_counter + 1;

    -- To holiday savings
    v_txn_id := gen_random_uuid();
    INSERT INTO public.transactions (id, account_id, up_transaction_id, description, amount_cents, status, category_id, settled_at, created_at, is_internal_transfer, transfer_account_id)
    VALUES (v_txn_id, v_spending_account_id, 'demo-txn-' || v_up_txn_counter, 'Transfer to Holiday Savings', -25000, 'SETTLED', 'internal-transfer',
      v_month_start + INTERVAL '2 days' + v_time_offset, v_month_start + INTERVAL '2 days' + v_time_offset, true, v_holiday_account_id);
    v_up_txn_counter := v_up_txn_counter + 1;

    -- To home deposit
    v_txn_id := gen_random_uuid();
    INSERT INTO public.transactions (id, account_id, up_transaction_id, description, amount_cents, status, category_id, settled_at, created_at, is_internal_transfer, transfer_account_id)
    VALUES (v_txn_id, v_spending_account_id, 'demo-txn-' || v_up_txn_counter, 'Transfer to Home Deposit', -100000, 'SETTLED', 'internal-transfer',
      v_month_start + INTERVAL '2 days' + v_time_offset, v_month_start + INTERVAL '2 days' + v_time_offset, true, v_home_deposit_account_id);
    v_up_txn_counter := v_up_txn_counter + 1;

    -- === JOINT ACCOUNT TRANSACTIONS (shared spending with performing_customer) ===
    -- Shared groceries on 2Up Spending (4-6 per month, alternating Alex/Jordan)
    FOR v_j IN 1..(4 + (random() * 2)::INT) LOOP
      v_txn_id := gen_random_uuid();
      v_day := v_month_start + ((random() * 27)::INT * INTERVAL '1 day');
      v_time_offset := (10 + (random() * 10)::INT) * INTERVAL '1 hour' + ((random() * 59)::INT) * INTERVAL '1 minute' + ((random() * 59)::INT) * INTERVAL '1 second';
      INSERT INTO public.transactions (id, account_id, up_transaction_id, description, amount_cents, status, category_id, parent_category_id, settled_at, created_at, card_purchase_method, is_shared, performing_customer)
      VALUES (v_txn_id, v_joint_spending_account_id, 'demo-txn-' || v_up_txn_counter,
        CASE WHEN random() < 0.5 THEN 'Woolworths' ELSE 'Coles' END,
        -(5000 + (random() * 15000)::INT), 'SETTLED', 'groceries', 'home',
        v_day + v_time_offset, v_day + v_time_offset, 'CONTACTLESS', true,
        CASE WHEN random() < 0.5 THEN 'Alex' ELSE 'Jordan' END);
      v_up_txn_counter := v_up_txn_counter + 1;
    END LOOP;

    -- Shared dining on 2Up Spending (2-3 per month)
    FOR v_j IN 1..(2 + (random() * 1)::INT) LOOP
      v_txn_id := gen_random_uuid();
      v_day := v_month_start + ((random() * 27)::INT * INTERVAL '1 day');
      v_time_offset := (12 + (random() * 9)::INT) * INTERVAL '1 hour' + ((random() * 59)::INT) * INTERVAL '1 minute' + ((random() * 59)::INT) * INTERVAL '1 second';
      INSERT INTO public.transactions (id, account_id, up_transaction_id, description, amount_cents, status, category_id, parent_category_id, settled_at, created_at, card_purchase_method, is_shared, performing_customer)
      VALUES (v_txn_id, v_joint_spending_account_id, 'demo-txn-' || v_up_txn_counter,
        CASE WHEN random() < 0.33 THEN 'The Humble Onion Cafe'
             WHEN random() < 0.66 THEN 'Nandos'
             ELSE 'Sushi Hub' END,
        -(2500 + (random() * 7500)::INT), 'SETTLED', 'restaurants-and-cafes', 'good-life',
        v_day + v_time_offset, v_day + v_time_offset, 'CONTACTLESS', true,
        CASE WHEN random() < 0.5 THEN 'Alex' ELSE 'Jordan' END);
      v_up_txn_counter := v_up_txn_counter + 1;
    END LOOP;

    -- Shared rent on 2Up Bills (monthly, $2,400, 1st of month morning)
    v_txn_id := gen_random_uuid();
    v_time_offset := INTERVAL '8 hours' + ((random() * 30)::INT) * INTERVAL '1 minute';
    INSERT INTO public.transactions (id, account_id, up_transaction_id, description, amount_cents, status, category_id, parent_category_id, settled_at, created_at, card_purchase_method, is_shared, performing_customer)
    VALUES (v_txn_id, v_joint_bills_account_id, 'demo-txn-' || v_up_txn_counter, 'Ray White Property Management', -240000, 'SETTLED', 'rent-and-mortgage', 'home',
      v_month_start + INTERVAL '1 day' + v_time_offset, v_month_start + INTERVAL '1 day' + v_time_offset, 'CARD_ON_FILE', true, 'Alex');
    v_up_txn_counter := v_up_txn_counter + 1;

    -- Shared internet on 2Up Bills (monthly, 15th)
    v_txn_id := gen_random_uuid();
    v_time_offset := INTERVAL '11 hours' + ((random() * 59)::INT) * INTERVAL '1 minute';
    INSERT INTO public.transactions (id, account_id, up_transaction_id, description, amount_cents, status, category_id, parent_category_id, settled_at, created_at, card_purchase_method, is_shared, performing_customer)
    VALUES (v_txn_id, v_joint_bills_account_id, 'demo-txn-' || v_up_txn_counter, 'Aussie Broadband', -7900, 'SETTLED', 'internet', 'home',
      v_month_start + INTERVAL '15 days' + v_time_offset, v_month_start + INTERVAL '15 days' + v_time_offset, 'CARD_ON_FILE', true, 'Jordan');
    v_up_txn_counter := v_up_txn_counter + 1;

    -- Shared utilities on 2Up Bills (quarterly)
    IF v_i % 3 = 0 THEN
      v_txn_id := gen_random_uuid();
      v_time_offset := INTERVAL '14 hours' + ((random() * 59)::INT) * INTERVAL '1 minute';
      INSERT INTO public.transactions (id, account_id, up_transaction_id, description, amount_cents, status, category_id, parent_category_id, settled_at, created_at, card_purchase_method, is_shared, performing_customer)
      VALUES (v_txn_id, v_joint_bills_account_id, 'demo-txn-' || v_up_txn_counter, 'Synergy Energy', -(30000 + (random() * 10000)::INT), 'SETTLED', 'utilities', 'home',
        v_month_start + INTERVAL '20 days' + v_time_offset, v_month_start + INTERVAL '20 days' + v_time_offset, 'CARD_ON_FILE', true, 'Alex');
      v_up_txn_counter := v_up_txn_counter + 1;
    END IF;

  END LOOP;

  -- =====================================================
  -- 8. Savings Goals
  -- =====================================================
  INSERT INTO public.savings_goals (id, partnership_id, name, target_amount_cents, current_amount_cents, deadline, linked_account_id, icon, color) VALUES
    (v_goal_emergency_id, v_partnership_id, 'Emergency Fund', 1500000, 1200000, '2026-06-30', v_emergency_account_id, 'shield', '#10B981'),
    (v_goal_holiday_id, v_partnership_id, 'Japan Holiday', 500000, 350000, '2026-09-01', v_holiday_account_id, 'plane', '#6366F1'),
    (v_goal_home_id, v_partnership_id, 'Home Deposit', 10000000, 4500000, '2027-12-31', v_home_deposit_account_id, 'home', '#F59E0B');

  -- =====================================================
  -- 9. Expense Definitions
  -- =====================================================
  INSERT INTO public.expense_definitions (id, partnership_id, name, category_name, expected_amount_cents, recurrence_type, next_due_date, emoji, match_pattern, is_active, created_by) VALUES
    (v_expense_rent_id, v_partnership_id, 'Rent', 'Housing & Utilities', 240000, 'monthly', '2026-02-01', '🏠', 'Ray White', true, v_user_id),
    (v_expense_electricity_id, v_partnership_id, 'Electricity', 'Housing & Utilities', 32000, 'quarterly', '2026-04-20', '💡', 'Synergy', true, v_user_id),
    (v_expense_internet_id, v_partnership_id, 'Internet', 'Housing & Utilities', 7900, 'monthly', '2026-02-15', '🌐', 'Aussie Broadband', true, v_user_id),
    (v_expense_phone_id, v_partnership_id, 'Mobile Phone', 'Technology & Communication', 5500, 'monthly', '2026-02-12', '📱', 'Telstra', true, v_user_id),
    (v_expense_netflix_id, v_partnership_id, 'Netflix', 'Entertainment & Leisure', 2299, 'monthly', '2026-02-05', '📺', 'Netflix', true, v_user_id),
    (v_expense_spotify_id, v_partnership_id, 'Spotify', 'Entertainment & Leisure', 1299, 'monthly', '2026-02-08', '🎵', 'Spotify', true, v_user_id),
    (v_expense_gym_id, v_partnership_id, 'Gym', 'Personal Care & Health', 6999, 'monthly', '2026-02-03', '💪', 'Anytime Fitness', true, v_user_id),
    (v_expense_insurance_id, v_partnership_id, 'Car Insurance', 'Transportation', 18500, 'quarterly', '2026-04-18', '🚗', 'RAC Insurance', true, v_user_id),
    (v_expense_car_id, v_partnership_id, 'Car Rego', 'Transportation', 85000, 'yearly', '2027-01-01', '📋', 'Department of Transport', true, v_user_id),
    (v_expense_pet_id, v_partnership_id, 'Pet Insurance', 'Pets', 4500, 'monthly', '2026-02-10', '🐾', 'PetSure', true, v_user_id);

  -- =====================================================
  -- 9b. Expense Matches (paid history for January 2026)
  -- =====================================================
  INSERT INTO public.transactions (id, account_id, up_transaction_id, description, amount_cents, status, category_id, parent_category_id, settled_at, created_at, card_purchase_method, is_shared, performing_customer)
  VALUES
    (gen_random_uuid(), v_joint_bills_account_id, 'demo-txn-match-synergy', 'Synergy Energy', -31200, 'SETTLED', 'utilities', 'home', '2026-01-20 14:22:00', '2026-01-20 14:22:00', 'CARD_ON_FILE', true, 'Alex');
  INSERT INTO public.transactions (id, account_id, up_transaction_id, description, amount_cents, status, category_id, parent_category_id, settled_at, created_at, card_purchase_method)
  VALUES
    (gen_random_uuid(), v_bills_account_id, 'demo-txn-match-rac', 'RAC Insurance', -18500, 'SETTLED', 'car-insurance-and-maintenance', 'transport', '2026-01-18 09:15:00', '2026-01-18 09:15:00', 'CARD_ON_FILE'),
    (gen_random_uuid(), v_bills_account_id, 'demo-txn-match-dot', 'Department of Transport', -85000, 'SETTLED', 'car-insurance-and-maintenance', 'transport', '2026-01-02 10:45:00', '2026-01-02 10:45:00', 'CARD_ON_FILE'),
    (gen_random_uuid(), v_bills_account_id, 'demo-txn-match-petsure', 'PetSure Insurance', -4500, 'SETTLED', 'pets', 'personal', '2026-01-10 08:30:00', '2026-01-10 08:30:00', 'CARD_ON_FILE');

  -- Match each expense to a transaction within January 2026
  INSERT INTO public.expense_matches (expense_definition_id, transaction_id, match_confidence, for_period, matched_at)
  SELECT ed.id, t.id, 1.0, '2026-01-01'::DATE, t.settled_at
  FROM public.expense_definitions ed
  CROSS JOIN LATERAL (
    SELECT t.id, t.settled_at FROM public.transactions t
    WHERE t.description ILIKE '%' || ed.match_pattern || '%'
      AND t.created_at >= '2026-01-01' AND t.created_at < '2026-02-01'
    ORDER BY t.created_at DESC
    LIMIT 1
  ) t
  WHERE ed.partnership_id = v_partnership_id
  ON CONFLICT (transaction_id) DO NOTHING;

  -- =====================================================
  -- 10. Income Sources
  -- =====================================================
  INSERT INTO public.income_sources (user_id, partnership_id, name, source_type, amount_cents, frequency, last_pay_date, next_pay_date, is_active, match_pattern) VALUES
    (v_user_id, v_partnership_id, 'ACME Corp Salary', 'recurring-salary', 380000, 'fortnightly', '2026-01-23', '2026-02-06', true, 'ACME Corp');

  -- Jordan's income (linked to partnership, attributed to Jordan's user)
  IF v_partner_user_id IS NOT NULL THEN
    INSERT INTO public.income_sources (user_id, partnership_id, name, source_type, amount_cents, frequency, last_pay_date, next_pay_date, is_active, match_pattern)
    VALUES (v_partner_user_id, v_partnership_id, 'TechCo Salary', 'recurring-salary', 320000, 'fortnightly', '2026-01-24', '2026-02-07', true, 'TechCo');
  ELSE
    -- Fallback: add as manual partner income on Alex's row
    INSERT INTO public.income_sources (user_id, partnership_id, name, source_type, amount_cents, frequency, last_pay_date, next_pay_date, is_active, is_manual_partner_income, match_pattern)
    VALUES (v_user_id, v_partnership_id, 'Partner Salary', 'recurring-salary', 320000, 'fortnightly', '2026-01-24', '2026-02-07', true, true, NULL);
  END IF;

  -- =====================================================
  -- 10b. Investments (multiple for realistic portfolio)
  -- =====================================================
  INSERT INTO public.investments (id, partnership_id, asset_type, name, ticker_symbol, quantity, purchase_value_cents, current_value_cents) VALUES
    (v_investment_vas_id, v_partnership_id, 'etf', 'Vanguard Australian Shares ETF', 'VAS', 45, 450000, 485000),
    (v_investment_vgs_id, v_partnership_id, 'etf', 'Vanguard MSCI Intl Shares ETF', 'VGS', 30, 280000, 312000),
    (v_investment_aax_id, v_partnership_id, 'etf', 'BetaShares Aus Govt Bond ETF', 'AAA', 50, 250000, 255000);

  -- Investment history (monthly snapshots for 12 months)
  FOR v_i IN 0..11 LOOP
    v_month_start := DATE '2025-02-01' + (v_i * INTERVAL '1 month');
    INSERT INTO public.investment_history (investment_id, value_cents, recorded_at) VALUES
      (v_investment_vas_id, 420000 + (v_i * 5500) + (random() * 5000)::INT, v_month_start + INTERVAL '28 days'),
      (v_investment_vgs_id, 265000 + (v_i * 4000) + (random() * 4000)::INT, v_month_start + INTERVAL '28 days'),
      (v_investment_aax_id, 248000 + (v_i * 600) + (random() * 1000)::INT, v_month_start + INTERVAL '28 days');
  END LOOP;

  -- =====================================================
  -- 10c. Investment Contributions (monthly DCA purchases)
  -- =====================================================
  FOR v_i IN 0..11 LOOP
    v_month_start := DATE '2025-02-01' + (v_i * INTERVAL '1 month');
    INSERT INTO public.investment_contributions (investment_id, partnership_id, amount_cents, contributed_at)
    VALUES (v_investment_vas_id, v_partnership_id, 20000, v_month_start + INTERVAL '3 days');
  END LOOP;

  -- =====================================================
  -- 11. User Budgets (REQUIRED for budget engine)
  -- =====================================================
  INSERT INTO public.user_budgets (id, partnership_id, name, emoji, budget_type, methodology, budget_view, period_type, is_active, is_default, created_by, slug) VALUES
    (v_budget_id, v_partnership_id, 'My Budget', '👤', 'primary', 'zero-based', 'individual', 'monthly', true, true, v_user_id, 'my-budget');

  -- =====================================================
  -- 11b. Budget Assignments (current month + last 2 months)
  --      Now linked to user_budgets via budget_id
  -- =====================================================
  FOR v_i IN 0..2 LOOP
    v_month_start := DATE_TRUNC('month', CURRENT_DATE) - (v_i * INTERVAL '1 month');
    -- My Budget — Alex's personal priorities
    INSERT INTO public.budget_assignments (partnership_id, budget_id, month, category_name, subcategory_name, assigned_cents, assignment_type, budget_view, stored_period_type, created_by) VALUES
      -- NEEDS
      (v_partnership_id, v_budget_id, v_month_start, 'Food & Dining', 'Groceries', 200000, 'category', 'individual', 'monthly', v_user_id),
      (v_partnership_id, v_budget_id, v_month_start, 'Housing & Utilities', 'Rent & Mortgage', 240000, 'category', 'individual', 'monthly', v_user_id),
      (v_partnership_id, v_budget_id, v_month_start, 'Housing & Utilities', 'Utilities', 35000, 'category', 'individual', 'monthly', v_user_id),
      (v_partnership_id, v_budget_id, v_month_start, 'Housing & Utilities', 'Internet', 8000, 'category', 'individual', 'monthly', v_user_id),
      (v_partnership_id, v_budget_id, v_month_start, 'Transportation', 'Fuel', 30000, 'category', 'individual', 'monthly', v_user_id),
      (v_partnership_id, v_budget_id, v_month_start, 'Transportation', 'Parking', 5000, 'category', 'individual', 'monthly', v_user_id),
      (v_partnership_id, v_budget_id, v_month_start, 'Transportation', 'Public Transport', 6000, 'category', 'individual', 'monthly', v_user_id),
      (v_partnership_id, v_budget_id, v_month_start, 'Transportation', 'Car Insurance, Rego & Maintenance', 100000, 'category', 'individual', 'monthly', v_user_id),
      (v_partnership_id, v_budget_id, v_month_start, 'Technology & Communication', 'Mobile Phone', 5500, 'category', 'individual', 'monthly', v_user_id),
      (v_partnership_id, v_budget_id, v_month_start, 'Personal Care & Health', 'Health & Medical', 15000, 'category', 'individual', 'monthly', v_user_id),
      (v_partnership_id, v_budget_id, v_month_start, 'Pets', 'Pets', 10000, 'category', 'individual', 'monthly', v_user_id),
      -- WANTS
      (v_partnership_id, v_budget_id, v_month_start, 'Food & Dining', 'Restaurants & Cafes', 50000, 'category', 'individual', 'monthly', v_user_id),
      (v_partnership_id, v_budget_id, v_month_start, 'Food & Dining', 'Takeaway', 15000, 'category', 'individual', 'monthly', v_user_id),
      (v_partnership_id, v_budget_id, v_month_start, 'Entertainment & Leisure', 'TV, Music & Streaming', 4000, 'category', 'individual', 'monthly', v_user_id),
      (v_partnership_id, v_budget_id, v_month_start, 'Entertainment & Leisure', 'Pubs & Bars', 15000, 'category', 'individual', 'monthly', v_user_id),
      (v_partnership_id, v_budget_id, v_month_start, 'Personal Care & Health', 'Fitness & Wellbeing', 7000, 'category', 'individual', 'monthly', v_user_id),
      (v_partnership_id, v_budget_id, v_month_start, 'Personal Care & Health', 'Clothing & Accessories', 10000, 'category', 'individual', 'monthly', v_user_id),
      (v_partnership_id, v_budget_id, v_month_start, 'Technology & Communication', 'Technology', 15000, 'category', 'individual', 'monthly', v_user_id),
      (v_partnership_id, v_budget_id, v_month_start, 'Gifts & Charity', 'Gifts & Charity', 5000, 'category', 'individual', 'monthly', v_user_id),
      -- SAVINGS
      (v_partnership_id, v_budget_id, v_month_start, 'Financial & Admin', 'Investments', 120000, 'category', 'individual', 'monthly', v_user_id),
      (v_partnership_id, v_budget_id, v_month_start, 'Financial & Admin', 'Life Admin', 10000, 'category', 'individual', 'monthly', v_user_id)
    ON CONFLICT DO NOTHING;

    -- Goal/Investment budget assignments
    INSERT INTO public.budget_assignments (partnership_id, budget_id, month, category_name, assignment_type, goal_id, asset_id, assigned_cents, budget_view, stored_period_type, created_by) VALUES
      (v_partnership_id, v_budget_id, v_month_start, '', 'goal', v_goal_emergency_id, NULL, 30000, 'individual', 'monthly', v_user_id),
      (v_partnership_id, v_budget_id, v_month_start, '', 'goal', v_goal_holiday_id, NULL, 20000, 'individual', 'monthly', v_user_id),
      (v_partnership_id, v_budget_id, v_month_start, '', 'goal', v_goal_home_id, NULL, 50000, 'individual', 'monthly', v_user_id),
      (v_partnership_id, v_budget_id, v_month_start, '', 'asset', NULL, v_investment_vas_id, 20000, 'individual', 'monthly', v_user_id)
    ON CONFLICT DO NOTHING;
  END LOOP;

  -- =====================================================
  -- 11c. Couple Split Settings (expense-level overrides)
  -- =====================================================
  INSERT INTO public.couple_split_settings (partnership_id, category_name, expense_definition_id, split_type, owner_percentage) VALUES
    (v_partnership_id, NULL, NULL, 'equal', 50.0),
    (v_partnership_id, NULL, v_expense_rent_id, 'equal', 50.0),
    (v_partnership_id, NULL, v_expense_netflix_id, 'equal', 50.0),
    (v_partnership_id, NULL, v_expense_internet_id, 'equal', 50.0),
    (v_partnership_id, NULL, v_expense_pet_id, 'equal', 50.0),
    (v_partnership_id, NULL, v_expense_electricity_id, 'equal', 50.0),
    (v_partnership_id, NULL, v_expense_phone_id, 'individual-owner', NULL),
    (v_partnership_id, NULL, v_expense_spotify_id, 'individual-owner', NULL),
    (v_partnership_id, NULL, v_expense_gym_id, 'individual-owner', NULL),
    (v_partnership_id, NULL, v_expense_insurance_id, 'custom', 60.0),
    (v_partnership_id, NULL, v_expense_car_id, 'custom', 60.0)
  ON CONFLICT DO NOTHING;

  -- =====================================================
  -- 12. Budget Months (with carryover, linked to budgets)
  -- =====================================================
  FOR v_i IN 0..11 LOOP
    v_month_start := DATE '2025-02-01' + (v_i * INTERVAL '1 month');
    INSERT INTO public.budget_months (partnership_id, budget_id, month, income_total_cents, assigned_total_cents, carryover_from_previous_cents)
    VALUES (v_partnership_id, v_budget_id, v_month_start, 760000, 547000, GREATEST(0, v_i * 8000 + (random() * 5000)::INT))
    ON CONFLICT DO NOTHING;
  END LOOP;

  -- =====================================================
  -- 13. Budget Layout Presets
  -- =====================================================
  INSERT INTO public.budget_layout_presets (user_id, partnership_id, budget_id, is_active, layout_config) VALUES
    (v_user_id, v_partnership_id, v_budget_id, true, jsonb_build_object(
      'sections', jsonb_build_array(
        jsonb_build_object(
          'id', 'needs', 'name', 'Needs', 'color', '#F87171',
          'percentage', 50, 'collapsed', false, 'displayOrder', 0,
          'itemIds', jsonb_build_array(
            'subcategory-Food & Dining::Groceries',
            'subcategory-Housing & Utilities::Rent & Mortgage',
            'subcategory-Housing & Utilities::Utilities',
            'subcategory-Housing & Utilities::Internet',
            'subcategory-Housing & Utilities::Rates & Insurance',
            'subcategory-Housing & Utilities::Maintenance & Improvements',
            'subcategory-Transportation::Fuel',
            'subcategory-Transportation::Public Transport',
            'subcategory-Transportation::Parking',
            'subcategory-Transportation::Car Insurance, Rego & Maintenance',
            'subcategory-Technology & Communication::Mobile Phone',
            'subcategory-Technology & Communication::Technology',
            'subcategory-Personal Care & Health::Health & Medical',
            'subcategory-Family & Education::Children & Family',
            'subcategory-Family & Education::Education & Student Loans',
            'subcategory-Pets::Pets'
          )
        ),
        jsonb_build_object(
          'id', 'wants', 'name', 'Wants', 'color', '#FBBF24',
          'percentage', 30, 'collapsed', false, 'displayOrder', 1,
          'itemIds', jsonb_build_array(
            'subcategory-Food & Dining::Restaurants & Cafes',
            'subcategory-Food & Dining::Takeaway',
            'subcategory-Food & Dining::Booze',
            'subcategory-Housing & Utilities::Homeware & Appliances',
            'subcategory-Transportation::Taxis & Share Cars',
            'subcategory-Entertainment & Leisure::TV, Music & Streaming',
            'subcategory-Entertainment & Leisure::Events & Gigs',
            'subcategory-Entertainment & Leisure::Hobbies',
            'subcategory-Entertainment & Leisure::Holidays & Travel',
            'subcategory-Entertainment & Leisure::Pubs & Bars',
            'subcategory-Entertainment & Leisure::Apps, Games & Software',
            'subcategory-Entertainment & Leisure::News, Magazines & Books',
            'subcategory-Personal Care & Health::Fitness & Wellbeing',
            'subcategory-Personal Care & Health::Hair & Beauty',
            'subcategory-Personal Care & Health::Clothing & Accessories',
            'subcategory-Gifts & Charity::Gifts & Charity'
          )
        ),
        jsonb_build_object(
          'id', 'savings', 'name', 'Savings & Debt', 'color', '#34D399',
          'percentage', 20, 'collapsed', false, 'displayOrder', 2,
          'itemIds', jsonb_build_array(
            'subcategory-Financial & Admin::Investments',
            'subcategory-Financial & Admin::Life Admin',
            'goal-' || v_goal_emergency_id,
            'goal-' || v_goal_holiday_id,
            'goal-' || v_goal_home_id,
            'asset-' || v_investment_vas_id,
            'asset-' || v_investment_vgs_id,
            'asset-' || v_investment_aax_id
          )
        )
      ),
      'hiddenItemIds', jsonb_build_array(
        'subcategory-Housing & Utilities::Rates & Insurance',
        'subcategory-Housing & Utilities::Maintenance & Improvements',
        'subcategory-Family & Education::Children & Family',
        'subcategory-Family & Education::Education & Student Loans',
        'subcategory-Food & Dining::Booze',
        'subcategory-Transportation::Taxis & Share Cars',
        'subcategory-Entertainment & Leisure::Events & Gigs',
        'subcategory-Entertainment & Leisure::Hobbies',
        'subcategory-Entertainment & Leisure::Holidays & Travel',
        'subcategory-Entertainment & Leisure::Apps, Games & Software',
        'subcategory-Entertainment & Leisure::News, Magazines & Books',
        'subcategory-Personal Care & Health::Hair & Beauty'
      )
    ));

  -- =====================================================
  -- 14. FIRE Plan Data
  -- =====================================================

  -- Net worth snapshots (monthly, realistic growth trajectory)
  FOR v_i IN 0..11 LOOP
    v_month_start := DATE '2025-02-01' + (v_i * INTERVAL '1 month');
    -- Total liquid: accounts grow slowly, investments grow ~5-8%/yr
    v_total_balance := 6200000 + (v_i * 55000) + (random() * 30000)::INT;  -- ~$62k → $68k
    v_invest_total := 930000 + (v_i * 8000) + (random() * 5000)::INT;     -- ~$9.3k → $10.2k
    INSERT INTO public.net_worth_snapshots (partnership_id, snapshot_date, total_balance_cents, investment_total_cents, account_breakdown)
    VALUES (v_partnership_id, v_month_start + INTERVAL '28 days',
      v_total_balance, v_invest_total,
      jsonb_build_object(
        'spending', 200000 + (random() * 80000)::INT,
        'bills', 150000 + (random() * 50000)::INT,
        'emergency', 1100000 + (v_i * 10000),
        'holiday', 300000 + (v_i * 5000),
        'home_deposit', 4200000 + (v_i * 25000)
      ))
    ON CONFLICT DO NOTHING;
  END LOOP;

  -- Target allocations (for investment rebalancing)
  INSERT INTO public.target_allocations (partnership_id, asset_type, target_percentage) VALUES
    (v_partnership_id, 'australian-shares', 45),
    (v_partnership_id, 'international-shares', 30),
    (v_partnership_id, 'bonds', 20),
    (v_partnership_id, 'cash', 5)
  ON CONFLICT DO NOTHING;

  -- Annual checkup (FY 2025-26, partially completed)
  INSERT INTO public.annual_checkups (partnership_id, financial_year, current_step, step_data, action_items, started_at, created_by)
  VALUES (v_partnership_id, 2026, 4,
    jsonb_build_object(
      'step1', jsonb_build_object('completed', true, 'notes', 'Reviewed all insurance policies - all current'),
      'step2', jsonb_build_object('completed', true, 'notes', 'Super contributions on track, employer matching 11.5%'),
      'step3', jsonb_build_object('completed', true, 'notes', 'Emergency fund at 80% of target, good progress'),
      'step4', jsonb_build_object('completed', false, 'notes', 'Need to review investment allocation')
    ),
    jsonb_build_array(
      jsonb_build_object('text', 'Rebalance portfolio - overweight Australian shares', 'completed', false),
      jsonb_build_object('text', 'Increase super contribution to 12% from July', 'completed', false),
      jsonb_build_object('text', 'Review home loan pre-approval options', 'completed', true),
      jsonb_build_object('text', 'Set up salary sacrifice for partner super', 'completed', false)
    ),
    NOW() - INTERVAL '14 days', v_user_id)
  ON CONFLICT DO NOTHING;

  -- =====================================================
  -- 15. Dashboard Charts
  -- =====================================================
  INSERT INTO public.user_dashboard_charts (user_id, chart_type, title, time_period, display_order, grid_width, grid_height)
  VALUES (v_user_id, 'donut', 'Spending by Category', 'this-month', 0, 6, 3);

  RAISE NOTICE 'Demo data seeded successfully! % transactions created.', v_up_txn_counter - 1;
END $$;
