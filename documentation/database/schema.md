# PiggyBack Database Schema

Comprehensive database schema derived from the consolidated migration file (`supabase/migrations/00000000000000_initial_schema.sql`), which was generated from the live database on 2026-02-25 and replaces 53 individual migration files. This document reflects the **final state** after all migrations have been applied.

---

## Table of Contents

1. [Extensions & Schemas](#extensions--schemas)
2. [Enum / Check Constraint Value Lists](#enum--check-constraint-value-lists)
3. [Tables](#tables)
   - [profiles](#1-profiles)
   - [partnerships](#2-partnerships)
   - [partnership_members](#3-partnership_members)
   - [up_api_configs](#4-up_api_configs)
   - [accounts](#5-accounts)
   - [transactions](#6-transactions)
   - [categories](#7-categories)
   - [category_mappings](#8-category_mappings)
   - [savings_goals](#9-savings_goals)
   - [budgets](#10-budgets)
   - [investments](#11-investments)
   - [investment_history](#12-investment_history)
   - [investment_contributions](#13-investment_contributions)
   - [tags](#14-tags)
   - [transaction_tags](#15-transaction_tags)
   - [transaction_notes](#16-transaction_notes)
   - [transaction_references](#17-transaction_references)
   - [transaction_category_overrides](#18-transaction_category_overrides)
   - [transaction_share_overrides](#19-transaction_share_overrides)
   - [user_dashboard_charts](#20-user_dashboard_charts)
   - [user_budgets](#21-user_budgets)
   - [budget_assignments](#22-budget_assignments)
   - [budget_months](#23-budget_months)
   - [budget_category_shares](#24-budget_category_shares)
   - [budget_item_preferences](#25-budget_item_preferences)
   - [budget_layout_presets](#26-budget_layout_presets)
   - [income_sources](#27-income_sources)
   - [expense_definitions](#28-expense_definitions)
   - [expense_matches](#29-expense_matches)
   - [couple_split_settings](#30-couple_split_settings)
   - [methodology_customizations](#31-methodology_customizations)
   - [category_pin_states](#32-category_pin_states)
   - [milestones](#33-milestones)
   - [annual_checkups](#34-annual_checkups)
   - [net_worth_snapshots](#35-net_worth_snapshots)
   - [target_allocations](#36-target_allocations)
   - [watchlist_items](#37-watchlist_items)
   - [partner_link_requests](#38-partner_link_requests)
   - [notifications](#39-notifications)
   - [merchant_category_rules](#40-merchant_category_rules)
4. [Dropped Tables](#dropped-tables)
5. [Foreign Key Relationships](#foreign-key-relationships)
6. [Indexes](#indexes)
7. [Row Level Security (RLS) Policies](#row-level-security-rls-policies)
8. [Functions](#functions)
9. [Triggers](#triggers)
10. [Private Schema](#private-schema)

---

## Extensions & Schemas

```sql
-- Extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS "pgcrypto" WITH SCHEMA extensions;

-- Private schema (for security definer functions)
CREATE SCHEMA IF NOT EXISTS private;
```

---

## Enum / Check Constraint Value Lists

These are not formal PostgreSQL enum types but are enforced via `CHECK` constraints on columns.

| Domain | Values |
|--------|--------|
| Theme preference | `'mint'`, `'light'`, `'dark'`, `'ocean'` |
| Partnership role | `'owner'`, `'member'` |
| Account type | `'SAVER'`, `'TRANSACTIONAL'`, `'HOME_LOAN'` |
| Account ownership | `'INDIVIDUAL'`, `'JOINT'` |
| Transaction status | `'HELD'`, `'SETTLED'` |
| Card purchase method | `'BAR_CODE'`, `'OCR'`, `'CARD_PIN'`, `'CARD_DETAILS'`, `'CARD_ON_FILE'`, `'ECOMMERCE'`, `'MAGNETIC_STRIPE'`, `'CONTACTLESS'` |
| Income type (transactions) | `'salary'`, `'bonus'`, `'interest'`, `'refund'`, `'investment'`, `'other'` |
| Income source type | `'recurring-salary'`, `'one-off'` |
| Investment asset type | `'stock'`, `'etf'`, `'crypto'`, `'property'`, `'other'` |
| Chart type | `'donut'`, `'bar'`, `'line'`, `'sankey'` |
| Chart time period | `'this-week'`, `'this-month'`, `'last-3-months'`, `'last-6-months'`, `'this-year'`, `'all-time'` |
| Budget assignment type | `'category'`, `'goal'`, `'asset'` |
| Budget view | `'individual'`, `'shared'` |
| Budget period preference | `'weekly'`, `'fortnightly'`, `'monthly'` |
| Expense recurrence | `'weekly'`, `'fortnightly'`, `'monthly'`, `'quarterly'`, `'yearly'`, `'one-time'` |
| Couple split type | `'equal'`, `'custom'`, `'individual-owner'`, `'individual-partner'` |
| Budget item type | `'category'`, `'goal'`, `'asset'` |
| Methodology name | `'zero-based'`, `'50-30-20'`, `'envelope'`, `'pay-yourself-first'`, `'80-20'` |
| Transaction reference type | `'expense_definition'`, `'income_source'`, `'expense_match'` |
| Partner link request status | `'pending'`, `'accepted'`, `'declined'`, `'expired'` |
| FIRE variant | `'lean'`, `'regular'`, `'fat'`, `'coast'` |
| Stored period type | `'weekly'`, `'fortnightly'`, `'monthly'` |
| User budget type | `'personal'` |
| User budget methodology | `'zero-based'` |
| User budget period type | `'monthly'` |
| Carryover mode | `'spending-based'` |

---

## Tables

### 1. profiles

Extends Supabase `auth.users`. Auto-created via trigger on user signup.

| Column | Type | Nullable | Default | Constraints |
|--------|------|----------|---------|-------------|
| `id` | `uuid` | NOT NULL | -- | PK, FK -> `auth.users(id)` ON DELETE CASCADE |
| `email` | `text` | NOT NULL | -- | |
| `display_name` | `text` | YES | `NULL` | |
| `avatar_url` | `text` | YES | `NULL` | |
| `theme_preference` | `text` | YES | `'light'` | |
| `budget_view_preference` | `text` | YES | `'shared'` | |
| `budget_period_preference` | `text` | YES | `'monthly'` | |
| `budget_methodology` | `text` | YES | `'zero-based'` | |
| `ai_provider` | `text` | YES | `'google'` | |
| `ai_api_key` | `text` | YES | `NULL` | |
| `ai_model` | `text` | YES | `NULL` | |
| `has_onboarded` | `boolean` | NOT NULL | `false` | |
| `onboarded_at` | `timestamptz` | YES | `NULL` | |
| `onboarding_steps_completed` | `text[]` | YES | `'{}'` | |
| `tour_completed` | `boolean` | NOT NULL | `false` | |
| `tour_dismissed` | `boolean` | NOT NULL | `false` | |
| `date_of_birth` | `date` | YES | `NULL` | |
| `target_retirement_age` | `integer` | YES | `NULL` | |
| `super_balance_cents` | `bigint` | YES | `0` | |
| `super_contribution_rate` | `numeric` | YES | `11.5` | |
| `expected_return_rate` | `numeric` | YES | `7.0` | |
| `fire_variant` | `text` | YES | `'regular'` | |
| `annual_expense_override_cents` | `bigint` | YES | `NULL` | |
| `fire_onboarded` | `boolean` | YES | `false` | |
| `notification_preferences` | `jsonb` | YES | Default JSON (see below) | |
| `outside_super_return_rate` | `numeric` | YES | `NULL` | |
| `income_growth_rate` | `numeric` | YES | `0` | |
| `spending_growth_rate` | `numeric` | YES | `0` | |
| `created_at` | `timestamptz` | NOT NULL | `now()` | |
| `updated_at` | `timestamptz` | NOT NULL | `now()` | Auto-updated via trigger |

**Default `notification_preferences`:**
```json
{
  "price_changes": {"enabled": true},
  "weekly_summary": {"enabled": false, "timezone": "Australia/Melbourne", "send_time": "08:00", "day_of_week": "sunday"},
  "goal_milestones": {"enabled": true},
  "payment_reminders": {"enabled": true, "timezone": "Australia/Melbourne", "lead_days": 3, "send_time": "09:00"}
}
```

---

### 2. partnerships

Groups of users (couples/individuals) sharing a budget.

| Column | Type | Nullable | Default | Constraints |
|--------|------|----------|---------|-------------|
| `id` | `uuid` | NOT NULL | `uuid_generate_v4()` | PK |
| `name` | `text` | NOT NULL | `'Our Budget'` | |
| `budget_setup_completed_at` | `timestamptz` | YES | `NULL` | |
| `manual_partner_name` | `text` | YES | `NULL` | |
| `manual_partner_dob` | `date` | YES | `NULL` | |
| `manual_partner_target_retirement_age` | `integer` | YES | `NULL` | |
| `manual_partner_super_balance_cents` | `bigint` | YES | `0` | |
| `manual_partner_super_contribution_rate` | `numeric` | YES | `11.5` | |
| `created_at` | `timestamptz` | NOT NULL | `now()` | |
| `updated_at` | `timestamptz` | NOT NULL | `now()` | Auto-updated via trigger |

---

### 3. partnership_members

Links users to partnerships.

| Column | Type | Nullable | Default | Constraints |
|--------|------|----------|---------|-------------|
| `id` | `uuid` | NOT NULL | `uuid_generate_v4()` | PK |
| `partnership_id` | `uuid` | NOT NULL | -- | FK -> `partnerships(id)` ON DELETE CASCADE |
| `user_id` | `uuid` | NOT NULL | -- | FK -> `profiles(id)` ON DELETE CASCADE |
| `role` | `text` | YES | `'member'` | |
| `joined_at` | `timestamptz` | NOT NULL | `now()` | |

**Unique**: `(partnership_id, user_id)`

---

### 4. up_api_configs

UP Bank API credentials per user.

| Column | Type | Nullable | Default | Constraints |
|--------|------|----------|---------|-------------|
| `id` | `uuid` | NOT NULL | `uuid_generate_v4()` | PK |
| `user_id` | `uuid` | NOT NULL | -- | FK -> `profiles(id)` ON DELETE CASCADE, UNIQUE |
| `encrypted_token` | `text` | NOT NULL | -- | |
| `is_active` | `boolean` | YES | `true` | |
| `webhook_id` | `text` | YES | `NULL` | |
| `webhook_secret` | `text` | YES | `NULL` | |
| `webhook_url` | `text` | YES | `NULL` | |
| `last_synced_at` | `timestamptz` | YES | `NULL` | |
| `created_at` | `timestamptz` | NOT NULL | `now()` | |
| `updated_at` | `timestamptz` | NOT NULL | `now()` | Auto-updated via trigger |

---

### 5. accounts

Synced bank accounts from UP Bank API.

| Column | Type | Nullable | Default | Constraints |
|--------|------|----------|---------|-------------|
| `id` | `uuid` | NOT NULL | `uuid_generate_v4()` | PK |
| `user_id` | `uuid` | NOT NULL | -- | FK -> `profiles(id)` ON DELETE CASCADE |
| `up_account_id` | `text` | NOT NULL | -- | |
| `display_name` | `text` | NOT NULL | -- | |
| `account_type` | `text` | NOT NULL | -- | |
| `ownership_type` | `text` | NOT NULL | -- | |
| `balance_cents` | `bigint` | NOT NULL | `0` | |
| `currency_code` | `text` | NOT NULL | `'AUD'` | |
| `is_active` | `boolean` | YES | `true` | |
| `last_synced_at` | `timestamptz` | YES | `NULL` | |
| `created_at` | `timestamptz` | NOT NULL | `now()` | |
| `updated_at` | `timestamptz` | NOT NULL | `now()` | Auto-updated via trigger |

**Unique**: `(user_id, up_account_id)`

---

### 6. transactions

Synced transactions from UP Bank API. Core transaction table.

| Column | Type | Nullable | Default | Constraints |
|--------|------|----------|---------|-------------|
| `id` | `uuid` | NOT NULL | `uuid_generate_v4()` | PK |
| `account_id` | `uuid` | NOT NULL | -- | FK -> `accounts(id)` ON DELETE CASCADE |
| `up_transaction_id` | `text` | NOT NULL | -- | |
| `description` | `text` | NOT NULL | -- | |
| `raw_text` | `text` | YES | `NULL` | |
| `message` | `text` | YES | `NULL` | |
| `amount_cents` | `bigint` | NOT NULL | -- | |
| `currency_code` | `text` | NOT NULL | `'AUD'` | |
| `status` | `text` | NOT NULL | -- | |
| `category_id` | `text` | YES | `NULL` | FK -> `categories(id)` ON DELETE SET NULL |
| `parent_category_id` | `text` | YES | `NULL` | FK -> `categories(id)` ON DELETE SET NULL |
| `settled_at` | `timestamptz` | YES | `NULL` | |
| `hold_info_amount_cents` | `bigint` | YES | `NULL` | |
| `hold_info_foreign_amount_cents` | `bigint` | YES | `NULL` | |
| `hold_info_foreign_currency_code` | `text` | YES | `NULL` | |
| `round_up_amount_cents` | `bigint` | YES | `NULL` | |
| `round_up_boost_cents` | `bigint` | YES | `NULL` | |
| `cashback_amount_cents` | `bigint` | YES | `NULL` | |
| `cashback_description` | `text` | YES | `NULL` | |
| `foreign_amount_cents` | `bigint` | YES | `NULL` | |
| `foreign_currency_code` | `text` | YES | `NULL` | |
| `card_purchase_method` | `text` | YES | `NULL` | |
| `card_number_suffix` | `text` | YES | `NULL` | |
| `transfer_account_id` | `uuid` | YES | `NULL` | FK -> `accounts(id)` ON DELETE SET NULL |
| `is_categorizable` | `boolean` | YES | `true` | |
| `transaction_type` | `text` | YES | `NULL` | |
| `deep_link_url` | `text` | YES | `NULL` | |
| `is_income` | `boolean` | YES | `false` | |
| `income_type` | `text` | YES | `NULL` | |
| `linked_pay_schedule_id` | `uuid` | YES | `NULL` | |
| `is_one_off_income` | `boolean` | YES | `false` | |
| `is_internal_transfer` | `boolean` | YES | `false` | |
| `internal_transfer_type` | `text` | YES | `NULL` | |
| `performing_customer` | `text` | YES | `NULL` | |
| `is_shared` | `boolean` | YES | `false` | |
| `created_at` | `timestamptz` | NOT NULL | `now()` | |

**Unique**: `(account_id, up_transaction_id)`

---

### 7. categories

UP Bank category taxonomy (synced from API).

| Column | Type | Nullable | Default | Constraints |
|--------|------|----------|---------|-------------|
| `id` | `text` | NOT NULL | -- | PK |
| `name` | `text` | NOT NULL | -- | |
| `parent_category_id` | `text` | YES | `NULL` | FK -> `categories(id)` (self-referencing) |
| `created_at` | `timestamptz` | NOT NULL | `now()` | |

---

### 8. category_mappings

Maps UP Bank category IDs to modernized display names.

| Column | Type | Nullable | Default | Constraints |
|--------|------|----------|---------|-------------|
| `id` | `uuid` | NOT NULL | `uuid_generate_v4()` | PK |
| `up_category_id` | `text` | NOT NULL | -- | FK -> `categories(id)`, UNIQUE |
| `new_parent_name` | `text` | NOT NULL | -- | |
| `new_child_name` | `text` | NOT NULL | -- | |
| `icon` | `text` | NOT NULL | -- | |
| `display_order` | `int` | YES | `0` | |
| `created_at` | `timestamptz` | NOT NULL | `now()` | |

Pre-seeded with 41 category mappings across 10 parent groups: Food & Dining, Housing & Utilities, Transportation, Entertainment & Leisure, Personal Care & Health, Technology & Communication, Family & Education, Financial & Admin, Pets, Gifts & Charity.

---

### 9. savings_goals

User savings goals linked to optional saver accounts.

| Column | Type | Nullable | Default | Constraints |
|--------|------|----------|---------|-------------|
| `id` | `uuid` | NOT NULL | `uuid_generate_v4()` | PK |
| `partnership_id` | `uuid` | NOT NULL | -- | FK -> `partnerships(id)` ON DELETE CASCADE |
| `name` | `text` | NOT NULL | -- | |
| `target_amount_cents` | `bigint` | NOT NULL | -- | |
| `current_amount_cents` | `bigint` | NOT NULL | `0` | |
| `deadline` | `date` | YES | `NULL` | |
| `linked_account_id` | `uuid` | YES | `NULL` | FK -> `accounts(id)` ON DELETE SET NULL |
| `icon` | `text` | YES | `'piggy-bank'` | |
| `color` | `text` | YES | `'#8884d8'` | |
| `is_completed` | `boolean` | YES | `false` | |
| `completed_at` | `timestamptz` | YES | `NULL` | |
| `created_at` | `timestamptz` | NOT NULL | `now()` | |
| `updated_at` | `timestamptz` | NOT NULL | `now()` | Auto-updated via trigger |

---

### 10. budgets

Legacy monthly budget limits per category (from before zero-based budget system).

| Column | Type | Nullable | Default | Constraints |
|--------|------|----------|---------|-------------|
| `id` | `uuid` | NOT NULL | `uuid_generate_v4()` | PK |
| `partnership_id` | `uuid` | NOT NULL | -- | FK -> `partnerships(id)` ON DELETE CASCADE |
| `category_id` | `text` | YES | `NULL` | FK -> `categories(id)` ON DELETE CASCADE |
| `category_name` | `text` | NOT NULL | -- | |
| `monthly_limit_cents` | `bigint` | NOT NULL | -- | |
| `created_at` | `timestamptz` | NOT NULL | `now()` | |
| `updated_at` | `timestamptz` | NOT NULL | `now()` | Auto-updated via trigger |

**Unique**: `(partnership_id, category_id)`

---

### 11. investments

External investment/asset tracking.

| Column | Type | Nullable | Default | Constraints |
|--------|------|----------|---------|-------------|
| `id` | `uuid` | NOT NULL | `uuid_generate_v4()` | PK |
| `partnership_id` | `uuid` | NOT NULL | -- | FK -> `partnerships(id)` ON DELETE CASCADE |
| `asset_type` | `text` | NOT NULL | -- | |
| `name` | `text` | NOT NULL | -- | |
| `ticker_symbol` | `text` | YES | `NULL` | |
| `quantity` | `numeric` | YES | `NULL` | |
| `purchase_value_cents` | `bigint` | YES | `NULL` | |
| `current_value_cents` | `bigint` | NOT NULL | -- | |
| `currency_code` | `text` | NOT NULL | `'AUD'` | |
| `notes` | `text` | YES | `NULL` | |
| `created_at` | `timestamptz` | NOT NULL | `now()` | |
| `updated_at` | `timestamptz` | NOT NULL | `now()` | Auto-updated via trigger |

---

### 12. investment_history

Historical value snapshots for investments.

| Column | Type | Nullable | Default | Constraints |
|--------|------|----------|---------|-------------|
| `id` | `uuid` | NOT NULL | `uuid_generate_v4()` | PK |
| `investment_id` | `uuid` | NOT NULL | -- | FK -> `investments(id)` ON DELETE CASCADE |
| `value_cents` | `bigint` | NOT NULL | -- | |
| `recorded_at` | `timestamptz` | NOT NULL | `now()` | |

---

### 13. investment_contributions

Tracks periodic investment contributions per investment per partnership.

| Column | Type | Nullable | Default | Constraints |
|--------|------|----------|---------|-------------|
| `id` | `uuid` | NOT NULL | `gen_random_uuid()` | PK |
| `investment_id` | `uuid` | NOT NULL | -- | FK -> `investments(id)` ON DELETE CASCADE |
| `partnership_id` | `uuid` | NOT NULL | -- | FK -> `partnerships(id)` ON DELETE CASCADE |
| `amount_cents` | `integer` | NOT NULL | -- | |
| `contributed_at` | `timestamptz` | NOT NULL | `now()` | |
| `notes` | `text` | YES | `NULL` | |
| `created_at` | `timestamptz` | NOT NULL | `now()` | |

---

### 14. tags

Tag names (from UP Bank API).

| Column | Type | Nullable | Default | Constraints |
|--------|------|----------|---------|-------------|
| `name` | `text` | NOT NULL | -- | PK |
| `created_at` | `timestamptz` | NOT NULL | `now()` | |

---

### 15. transaction_tags

Many-to-many link between transactions and tags.

| Column | Type | Nullable | Default | Constraints |
|--------|------|----------|---------|-------------|
| `id` | `uuid` | NOT NULL | `uuid_generate_v4()` | PK |
| `transaction_id` | `uuid` | NOT NULL | -- | FK -> `transactions(id)` ON DELETE CASCADE |
| `tag_name` | `text` | NOT NULL | -- | FK -> `tags(name)` ON DELETE CASCADE |
| `created_at` | `timestamptz` | NOT NULL | `now()` | |

**Unique**: `(transaction_id, tag_name)`

---

### 16. transaction_notes

User comments on transactions, optionally shared with partner.

| Column | Type | Nullable | Default | Constraints |
|--------|------|----------|---------|-------------|
| `id` | `uuid` | NOT NULL | `uuid_generate_v4()` | PK |
| `transaction_id` | `uuid` | NOT NULL | -- | FK -> `transactions(id)` ON DELETE CASCADE |
| `user_id` | `uuid` | NOT NULL | -- | FK -> `profiles(id)` ON DELETE CASCADE |
| `note` | `text` | NOT NULL | -- | |
| `is_partner_visible` | `boolean` | YES | `true` | |
| `created_at` | `timestamptz` | NOT NULL | `now()` | |
| `updated_at` | `timestamptz` | NOT NULL | `now()` | Auto-updated via trigger |

---

### 17. transaction_references

Reverse lookup: find which expenses/incomes reference specific Up Bank transactions.

| Column | Type | Nullable | Default | Constraints |
|--------|------|----------|---------|-------------|
| `id` | `uuid` | NOT NULL | `gen_random_uuid()` | PK |
| `up_transaction_id` | `text` | NOT NULL | -- | |
| `reference_type` | `text` | NOT NULL | -- | |
| `reference_id` | `uuid` | NOT NULL | -- | |
| `created_at` | `timestamptz` | NOT NULL | `now()` | |

---

### 18. transaction_category_overrides

Local transaction category changes (never synced back to UP Bank).

| Column | Type | Nullable | Default | Constraints |
|--------|------|----------|---------|-------------|
| `id` | `uuid` | NOT NULL | `gen_random_uuid()` | PK |
| `transaction_id` | `uuid` | NOT NULL | -- | FK -> `transactions(id)` ON DELETE CASCADE, UNIQUE |
| `original_category_id` | `text` | YES | `NULL` | |
| `original_parent_category_id` | `text` | YES | `NULL` | |
| `override_category_id` | `text` | YES | `NULL` | FK -> `categories(id)` |
| `override_parent_category_id` | `text` | YES | `NULL` | FK -> `categories(id)` |
| `changed_by` | `uuid` | YES | `NULL` | FK -> `profiles(id)` ON DELETE SET NULL |
| `changed_at` | `timestamptz` | YES | `now()` | |
| `notes` | `text` | YES | `NULL` | |
| `created_at` | `timestamptz` | YES | `now()` | |
| `updated_at` | `timestamptz` | YES | `now()` | |

---

### 19. transaction_share_overrides

Per-transaction sharing overrides (overrides category defaults).

| Column | Type | Nullable | Default | Constraints |
|--------|------|----------|---------|-------------|
| `id` | `uuid` | NOT NULL | `gen_random_uuid()` | PK |
| `transaction_id` | `text` | NOT NULL | -- | Up Bank transaction ID (not UUID) |
| `partnership_id` | `uuid` | NOT NULL | -- | FK -> `partnerships(id)` ON DELETE CASCADE |
| `share_percentage` | `integer` | NOT NULL | -- | |
| `is_shared` | `boolean` | NOT NULL | `true` | |
| `notes` | `text` | YES | `NULL` | |
| `created_at` | `timestamptz` | YES | `now()` | |
| `updated_at` | `timestamptz` | YES | `now()` | Auto-updated via trigger |

**Unique**: `(transaction_id, partnership_id)`

---

### 20. user_dashboard_charts

Per-user customizable dashboard chart configurations.

| Column | Type | Nullable | Default | Constraints |
|--------|------|----------|---------|-------------|
| `id` | `uuid` | NOT NULL | `uuid_generate_v4()` | PK |
| `user_id` | `uuid` | NOT NULL | -- | FK -> `profiles(id)` ON DELETE CASCADE |
| `chart_type` | `text` | NOT NULL | -- | |
| `title` | `text` | NOT NULL | -- | |
| `category_filter` | `text[]` | YES | `'{}'` | Array of UP Bank category IDs |
| `time_period` | `text` | NOT NULL | `'this-month'` | |
| `display_order` | `int` | NOT NULL | `0` | |
| `grid_width` | `int` | YES | `6` | |
| `grid_height` | `int` | YES | `3` | |
| `grid_x` | `int` | YES | `0` | |
| `grid_y` | `int` | YES | `0` | |
| `created_at` | `timestamptz` | NOT NULL | `now()` | |
| `updated_at` | `timestamptz` | NOT NULL | `now()` | |

---

### 21. user_budgets

Named budget containers per partnership. Each budget can have its own methodology, view type, and active status.

| Column | Type | Nullable | Default | Constraints |
|--------|------|----------|---------|-------------|
| `id` | `uuid` | NOT NULL | `gen_random_uuid()` | PK |
| `partnership_id` | `uuid` | NOT NULL | -- | FK -> `partnerships(id)` ON DELETE CASCADE |
| `name` | `text` | NOT NULL | -- | |
| `emoji` | `text` | YES | `'💰'` | |
| `budget_type` | `text` | NOT NULL | `'personal'` | |
| `methodology` | `text` | NOT NULL | `'zero-based'` | |
| `budget_view` | `text` | NOT NULL | `'shared'` | |
| `period_type` | `text` | NOT NULL | `'monthly'` | |
| `is_active` | `boolean` | YES | `true` | |
| `is_default` | `boolean` | YES | `false` | |
| `color` | `text` | YES | `NULL` | |
| `template_source` | `text` | YES | `NULL` | |
| `category_filter` | `jsonb` | YES | `NULL` | |
| `created_by` | `uuid` | YES | `NULL` | FK -> `profiles(id)` ON DELETE SET NULL |
| `total_budget` | `numeric` | YES | `NULL` | |
| `start_date` | `date` | YES | `NULL` | |
| `end_date` | `date` | YES | `NULL` | |
| `carryover_mode` | `text` | NOT NULL | `'spending-based'` | |
| `slug` | `text` | NOT NULL | -- | |
| `created_at` | `timestamptz` | NOT NULL | `now()` | |
| `updated_at` | `timestamptz` | NOT NULL | `now()` | Auto-updated via trigger |

**Unique index**: `(partnership_id, slug)` WHERE `is_active = true`

---

### 22. budget_assignments

Monthly budget allocations for zero-based budgeting. Tracks how much is assigned to each category/goal/asset.

| Column | Type | Nullable | Default | Constraints |
|--------|------|----------|---------|-------------|
| `id` | `uuid` | NOT NULL | `uuid_generate_v4()` | PK |
| `partnership_id` | `uuid` | NOT NULL | -- | FK -> `partnerships(id)` ON DELETE CASCADE |
| `month` | `date` | NOT NULL | -- | First day of month |
| `category_name` | `text` | NOT NULL | -- | |
| `subcategory_name` | `text` | YES | `NULL` | |
| `assignment_type` | `text` | YES | `'category'` | |
| `assigned_cents` | `bigint` | NOT NULL | `0` | |
| `goal_id` | `uuid` | YES | `NULL` | FK -> `savings_goals(id)` ON DELETE CASCADE |
| `asset_id` | `uuid` | YES | `NULL` | FK -> `investments(id)` ON DELETE CASCADE |
| `budget_view` | `text` | YES | `'shared'` | |
| `stored_period_type` | `text` | YES | `'monthly'` | |
| `rollover` | `boolean` | YES | `true` | |
| `notes` | `text` | YES | `NULL` | |
| `created_by` | `uuid` | YES | `NULL` | FK -> `profiles(id)` ON DELETE SET NULL |
| `budget_id` | `uuid` | YES | `NULL` | FK -> `user_budgets(id)` ON DELETE CASCADE |
| `created_at` | `timestamptz` | NOT NULL | `now()` | |
| `updated_at` | `timestamptz` | NOT NULL | `now()` | |

**Unique index** (`idx_budget_assignments_unique_per_view`): `(partnership_id, month, budget_view, assignment_type, COALESCE(budget_id::text,''), COALESCE(category_name,''), COALESCE(subcategory_name,''), COALESCE(goal_id::text,''), COALESCE(asset_id::text,''))`

---

### 23. budget_months

Monthly budget metadata for TBB (To Be Budgeted) calculations.

| Column | Type | Nullable | Default | Constraints |
|--------|------|----------|---------|-------------|
| `id` | `uuid` | NOT NULL | `uuid_generate_v4()` | PK |
| `partnership_id` | `uuid` | NOT NULL | -- | FK -> `partnerships(id)` ON DELETE CASCADE |
| `month` | `date` | NOT NULL | -- | First day of month |
| `income_total_cents` | `bigint` | NOT NULL | `0` | |
| `assigned_total_cents` | `bigint` | NOT NULL | `0` | |
| `carryover_from_previous_cents` | `bigint` | NOT NULL | `0` | |
| `notes` | `text` | YES | `NULL` | |
| `budget_id` | `uuid` | YES | `NULL` | FK -> `user_budgets(id)` ON DELETE CASCADE |
| `created_at` | `timestamptz` | NOT NULL | `now()` | |
| `updated_at` | `timestamptz` | NOT NULL | `now()` | |

**Unique index**: `(partnership_id, month, COALESCE(budget_id, '00000000-0000-0000-0000-000000000000'))`

---

### 24. budget_category_shares

Category-level sharing configuration between partners.

| Column | Type | Nullable | Default | Constraints |
|--------|------|----------|---------|-------------|
| `id` | `uuid` | NOT NULL | `gen_random_uuid()` | PK |
| `partnership_id` | `uuid` | NOT NULL | -- | FK -> `partnerships(id)` ON DELETE CASCADE |
| `category_name` | `text` | NOT NULL | -- | |
| `share_percentage` | `integer` | NOT NULL | `50` | |
| `is_shared` | `boolean` | NOT NULL | `false` | |
| `created_at` | `timestamptz` | YES | `now()` | |
| `updated_at` | `timestamptz` | YES | `now()` | Auto-updated via trigger |

**Unique**: `(partnership_id, category_name)`

---

### 25. budget_item_preferences

Per-user visibility and ordering preferences for budget items. Originally named `budget_category_preferences`.

| Column | Type | Nullable | Default | Constraints |
|--------|------|----------|---------|-------------|
| `id` | `uuid` | NOT NULL | `uuid_generate_v4()` | PK |
| `partnership_id` | `uuid` | NOT NULL | -- | FK -> `partnerships(id)` ON DELETE CASCADE |
| `user_id` | `uuid` | NOT NULL | -- | FK -> `profiles(id)` ON DELETE CASCADE |
| `category_name` | `text` | NOT NULL | -- | |
| `item_type` | `text` | YES | `'category'` | |
| `goal_id` | `uuid` | YES | `NULL` | FK -> `savings_goals(id)` ON DELETE CASCADE |
| `asset_id` | `uuid` | YES | `NULL` | FK -> `investments(id)` ON DELETE CASCADE |
| `budget_id` | `uuid` | YES | `NULL` | FK -> `user_budgets(id)` ON DELETE CASCADE |
| `is_visible` | `boolean` | YES | `true` | |
| `display_order` | `int` | YES | `NULL` | |
| `created_at` | `timestamptz` | NOT NULL | `now()` | |
| `updated_at` | `timestamptz` | NOT NULL | `now()` | |

**Unique constraint**: `(user_id, partnership_id, category_name)`

**Unique index** (`idx_budget_item_prefs_unique`): `(user_id, partnership_id, item_type, COALESCE(category_name,''), COALESCE(goal_id::text,''), COALESCE(asset_id::text,''))`

---

### 26. budget_layout_presets

Complete budget layout configurations (sections, columns, density, grouping).

| Column | Type | Nullable | Default | Constraints |
|--------|------|----------|---------|-------------|
| `id` | `uuid` | NOT NULL | `gen_random_uuid()` | PK |
| `user_id` | `uuid` | NOT NULL | -- | FK -> `profiles(id)` ON DELETE CASCADE |
| `partnership_id` | `uuid` | NOT NULL | -- | FK -> `partnerships(id)` ON DELETE CASCADE |
| `name` | `text` | NOT NULL | `'My Layout'` | |
| `description` | `text` | YES | `NULL` | |
| `is_active` | `boolean` | YES | `false` | |
| `is_template` | `boolean` | YES | `false` | Public shareable templates |
| `template_author_id` | `uuid` | YES | `NULL` | FK -> `profiles(id)` ON DELETE SET NULL |
| `layout_config` | `jsonb` | NOT NULL | Default layout JSON | Contains sections, columns, density, groupBy |
| `budget_view` | `text` | YES | `'shared'` | |
| `budget_id` | `uuid` | YES | `NULL` | FK -> `user_budgets(id)` ON DELETE CASCADE |
| `created_at` | `timestamptz` | YES | `now()` | |
| `updated_at` | `timestamptz` | YES | `now()` | |
| `last_used_at` | `timestamptz` | YES | `now()` | |

**Unique index** (`idx_unique_active_layout_per_view`): `(user_id, partnership_id, budget_view, budget_id)` WHERE `is_active = true`

---

### 27. income_sources

Income streams (recurring salary, one-off bonuses, etc.) per user.

| Column | Type | Nullable | Default | Constraints |
|--------|------|----------|---------|-------------|
| `id` | `uuid` | NOT NULL | `gen_random_uuid()` | PK |
| `user_id` | `uuid` | NOT NULL | -- | FK -> `profiles(id)` (implicit) |
| `partnership_id` | `uuid` | YES | `NULL` | FK -> `partnerships(id)` ON DELETE CASCADE |
| `name` | `text` | NOT NULL | -- | |
| `source_type` | `text` | NOT NULL | -- | |
| `one_off_type` | `text` | YES | `NULL` | |
| `amount_cents` | `integer` | NOT NULL | -- | |
| `frequency` | `text` | YES | `NULL` | |
| `last_pay_date` | `date` | YES | `NULL` | |
| `next_pay_date` | `date` | YES | `NULL` | |
| `expected_date` | `date` | YES | `NULL` | |
| `received_date` | `date` | YES | `NULL` | |
| `is_received` | `boolean` | YES | `false` | |
| `linked_transaction_id` | `uuid` | YES | `NULL` | FK -> `transactions(id)` ON DELETE SET NULL |
| `linked_up_transaction_id` | `text` | YES | `NULL` | |
| `match_pattern` | `text` | YES | `NULL` | |
| `notes` | `text` | YES | `NULL` | |
| `is_active` | `boolean` | YES | `true` | |
| `is_manual_partner_income` | `boolean` | YES | `false` | |
| `created_at` | `timestamptz` | YES | `now()` | |
| `updated_at` | `timestamptz` | YES | `now()` | |

---

### 28. expense_definitions

User-defined expected expenses (recurring and one-time).

| Column | Type | Nullable | Default | Constraints |
|--------|------|----------|---------|-------------|
| `id` | `uuid` | NOT NULL | `uuid_generate_v4()` | PK |
| `partnership_id` | `uuid` | NOT NULL | -- | FK -> `partnerships(id)` ON DELETE CASCADE |
| `name` | `text` | NOT NULL | -- | |
| `category_name` | `text` | NOT NULL | -- | Modern parent category name |
| `expected_amount_cents` | `bigint` | NOT NULL | -- | |
| `recurrence_type` | `text` | NOT NULL | -- | |
| `next_due_date` | `date` | NOT NULL | -- | |
| `auto_detected` | `boolean` | YES | `false` | |
| `match_pattern` | `text` | YES | `NULL` | |
| `merchant_name` | `text` | YES | `NULL` | |
| `linked_up_transaction_id` | `text` | YES | `NULL` | |
| `is_active` | `boolean` | YES | `true` | |
| `emoji` | `text` | YES | `'💰'` | |
| `notes` | `text` | YES | `NULL` | |
| `created_by` | `uuid` | YES | `NULL` | FK -> `profiles(id)` ON DELETE SET NULL |
| `created_at` | `timestamptz` | NOT NULL | `now()` | |
| `updated_at` | `timestamptz` | NOT NULL | `now()` | |

---

### 29. expense_matches

Links actual transactions to expected expense definitions. **Authoritative source** for which transactions match which expenses.

| Column | Type | Nullable | Default | Constraints |
|--------|------|----------|---------|-------------|
| `id` | `uuid` | NOT NULL | `uuid_generate_v4()` | PK |
| `expense_definition_id` | `uuid` | NOT NULL | -- | FK -> `expense_definitions(id)` ON DELETE CASCADE |
| `transaction_id` | `uuid` | NOT NULL | -- | FK -> `transactions(id)` ON DELETE CASCADE, UNIQUE |
| `match_confidence` | `numeric` | YES | `1.0` | |
| `for_period` | `date` | YES | `NULL` | First day of billing period |
| `matched_at` | `timestamptz` | NOT NULL | `now()` | |
| `matched_by` | `uuid` | YES | `NULL` | FK -> `profiles(id)` ON DELETE SET NULL; NULL = auto-matched |

---

### 30. couple_split_settings

Configurable expense splits between partners.

| Column | Type | Nullable | Default | Constraints |
|--------|------|----------|---------|-------------|
| `id` | `uuid` | NOT NULL | `uuid_generate_v4()` | PK |
| `partnership_id` | `uuid` | NOT NULL | -- | FK -> `partnerships(id)` ON DELETE CASCADE |
| `category_name` | `text` | YES | `NULL` | NULL = default for all |
| `expense_definition_id` | `uuid` | YES | `NULL` | FK -> `expense_definitions(id)` ON DELETE CASCADE |
| `split_type` | `text` | NOT NULL | -- | |
| `owner_percentage` | `numeric` | YES | `NULL` | |
| `notes` | `text` | YES | `NULL` | |
| `created_at` | `timestamptz` | NOT NULL | `now()` | |
| `updated_at` | `timestamptz` | NOT NULL | `now()` | |

**Unique**: `(partnership_id, category_name, expense_definition_id)`

---

### 31. methodology_customizations

User/partnership-level customizations to preset methodologies.

| Column | Type | Nullable | Default | Constraints |
|--------|------|----------|---------|-------------|
| `id` | `uuid` | NOT NULL | `gen_random_uuid()` | PK |
| `partnership_id` | `uuid` | NOT NULL | -- | FK -> `partnerships(id)` ON DELETE CASCADE |
| `user_id` | `uuid` | YES | `NULL` | FK -> `profiles(id)` ON DELETE CASCADE; NULL = partnership-wide |
| `methodology_name` | `text` | NOT NULL | -- | |
| `custom_categories` | `jsonb` | NOT NULL | `'[]'` | Array of customized category definitions |
| `hidden_subcategories` | `jsonb` | NOT NULL | `'[]'` | Array of hidden subcategory names |
| `created_at` | `timestamptz` | YES | `now()` | |
| `updated_at` | `timestamptz` | YES | `now()` | |

**Unique**: `(partnership_id, user_id, methodology_name)`

---

### 32. category_pin_states

Tracks pinned/expanded categories per methodology per user.

| Column | Type | Nullable | Default | Constraints |
|--------|------|----------|---------|-------------|
| `id` | `uuid` | NOT NULL | `gen_random_uuid()` | PK |
| `partnership_id` | `uuid` | NOT NULL | -- | FK -> `partnerships(id)` ON DELETE CASCADE |
| `user_id` | `uuid` | NOT NULL | -- | FK -> `profiles(id)` ON DELETE CASCADE |
| `methodology_name` | `text` | NOT NULL | -- | |
| `pinned_categories` | `jsonb` | NOT NULL | `'[]'` | Array of pinned category names |
| `created_at` | `timestamptz` | YES | `now()` | |
| `updated_at` | `timestamptz` | YES | `now()` | |

**Unique**: `(partnership_id, user_id, methodology_name)`

---

### 33. milestones

Life milestones with financial impact tracking.

| Column | Type | Nullable | Default | Constraints |
|--------|------|----------|---------|-------------|
| `id` | `uuid` | NOT NULL | `gen_random_uuid()` | PK |
| `partnership_id` | `uuid` | NOT NULL | -- | FK -> `partnerships(id)` ON DELETE CASCADE |
| `title` | `text` | NOT NULL | -- | |
| `description` | `text` | YES | `NULL` | |
| `target_date` | `date` | NOT NULL | -- | |
| `estimated_cost_cents` | `bigint` | YES | `0` | |
| `estimated_monthly_impact_cents` | `bigint` | YES | `0` | |
| `icon` | `text` | YES | `'target'` | |
| `color` | `text` | YES | `'var(--pastel-blue)'` | |
| `is_completed` | `boolean` | YES | `false` | |
| `completed_at` | `timestamptz` | YES | `NULL` | |
| `preparation_checklist` | `jsonb` | YES | `'[]'` | |
| `sort_order` | `integer` | YES | `0` | |
| `created_by` | `uuid` | YES | `NULL` | FK -> `profiles(id)` ON DELETE SET NULL |
| `created_at` | `timestamptz` | NOT NULL | `now()` | |
| `updated_at` | `timestamptz` | NOT NULL | `now()` | Auto-updated via trigger |

---

### 34. annual_checkups

Yearly financial review wizard with step-by-step progress.

| Column | Type | Nullable | Default | Constraints |
|--------|------|----------|---------|-------------|
| `id` | `uuid` | NOT NULL | `gen_random_uuid()` | PK |
| `partnership_id` | `uuid` | NOT NULL | -- | FK -> `partnerships(id)` ON DELETE CASCADE |
| `financial_year` | `integer` | NOT NULL | -- | |
| `current_step` | `integer` | YES | `1` | |
| `step_data` | `jsonb` | YES | `'{}'` | |
| `action_items` | `jsonb` | YES | `'[]'` | |
| `started_at` | `timestamptz` | NOT NULL | `now()` | |
| `completed_at` | `timestamptz` | YES | `NULL` | |
| `created_by` | `uuid` | YES | `NULL` | FK -> `profiles(id)` ON DELETE SET NULL |
| `created_at` | `timestamptz` | NOT NULL | `now()` | |
| `updated_at` | `timestamptz` | NOT NULL | `now()` | Auto-updated via trigger |

**Unique**: `(partnership_id, financial_year)`

---

### 35. net_worth_snapshots

Daily snapshots of total account balances and investment values per partnership.

| Column | Type | Nullable | Default | Constraints |
|--------|------|----------|---------|-------------|
| `id` | `uuid` | NOT NULL | `gen_random_uuid()` | PK |
| `partnership_id` | `uuid` | NOT NULL | -- | FK -> `partnerships(id)` ON DELETE CASCADE |
| `snapshot_date` | `date` | NOT NULL | -- | |
| `total_balance_cents` | `bigint` | NOT NULL | `0` | |
| `account_breakdown` | `jsonb` | NOT NULL | `'[]'` | Array of account snapshots |
| `investment_total_cents` | `bigint` | YES | `0` | Sum of all investment values |
| `created_at` | `timestamptz` | NOT NULL | `now()` | |

**Unique**: `(partnership_id, snapshot_date)`

---

### 36. target_allocations

Desired portfolio allocation percentages per asset type.

| Column | Type | Nullable | Default | Constraints |
|--------|------|----------|---------|-------------|
| `id` | `uuid` | NOT NULL | `uuid_generate_v4()` | PK |
| `partnership_id` | `uuid` | NOT NULL | -- | FK -> `partnerships(id)` ON DELETE CASCADE |
| `asset_type` | `text` | NOT NULL | -- | |
| `target_percentage` | `numeric` | NOT NULL | -- | |
| `created_at` | `timestamptz` | NOT NULL | `now()` | |
| `updated_at` | `timestamptz` | NOT NULL | `now()` | Auto-updated via trigger |

**Unique**: `(partnership_id, asset_type)`

---

### 37. watchlist_items

Investments tracked but not owned.

| Column | Type | Nullable | Default | Constraints |
|--------|------|----------|---------|-------------|
| `id` | `uuid` | NOT NULL | `uuid_generate_v4()` | PK |
| `partnership_id` | `uuid` | NOT NULL | -- | FK -> `partnerships(id)` ON DELETE CASCADE |
| `asset_type` | `text` | NOT NULL | -- | |
| `name` | `text` | NOT NULL | -- | |
| `ticker_symbol` | `text` | YES | `NULL` | |
| `notes` | `text` | YES | `NULL` | |
| `last_price_cents` | `bigint` | YES | `NULL` | |
| `last_price_updated_at` | `timestamptz` | YES | `NULL` | |
| `created_at` | `timestamptz` | NOT NULL | `now()` | |
| `updated_at` | `timestamptz` | NOT NULL | `now()` | Auto-updated via trigger |

---

### 38. partner_link_requests

Consent-based partner auto-linking via shared 2Up joint accounts.

| Column | Type | Nullable | Default | Constraints |
|--------|------|----------|---------|-------------|
| `id` | `uuid` | NOT NULL | `uuid_generate_v4()` | PK |
| `shared_up_account_id` | `text` | NOT NULL | -- | |
| `requester_user_id` | `uuid` | NOT NULL | -- | FK -> `profiles(id)` ON DELETE CASCADE |
| `target_user_id` | `uuid` | NOT NULL | -- | FK -> `profiles(id)` ON DELETE CASCADE |
| `status` | `text` | NOT NULL | `'pending'` | |
| `primary_partnership_id` | `uuid` | YES | `NULL` | FK -> `partnerships(id)` ON DELETE SET NULL |
| `created_at` | `timestamptz` | NOT NULL | `now()` | |
| `updated_at` | `timestamptz` | NOT NULL | `now()` | |

**Unique**: `(shared_up_account_id, requester_user_id, target_user_id)`

---

### 39. notifications

User notification records.

| Column | Type | Nullable | Default | Constraints |
|--------|------|----------|---------|-------------|
| `id` | `uuid` | NOT NULL | `gen_random_uuid()` | PK |
| `user_id` | `uuid` | NOT NULL | -- | FK -> `profiles(id)` ON DELETE CASCADE |
| `type` | `text` | NOT NULL | -- | |
| `title` | `text` | NOT NULL | -- | |
| `message` | `text` | NOT NULL | -- | |
| `metadata` | `jsonb` | YES | `'{}'` | |
| `read` | `boolean` | NOT NULL | `false` | |
| `actioned` | `boolean` | NOT NULL | `false` | |
| `created_at` | `timestamptz` | NOT NULL | `now()` | |

---

### 40. merchant_category_rules

User-defined rules for auto-categorizing transactions by merchant description.

| Column | Type | Nullable | Default | Constraints |
|--------|------|----------|---------|-------------|
| `id` | `uuid` | NOT NULL | `gen_random_uuid()` | PK |
| `user_id` | `uuid` | NOT NULL | -- | FK -> `profiles(id)` ON DELETE CASCADE |
| `merchant_description` | `text` | NOT NULL | -- | |
| `category_id` | `text` | NOT NULL | -- | FK -> `categories(id)` ON DELETE CASCADE |
| `parent_category_id` | `text` | YES | `NULL` | FK -> `categories(id)` |
| `created_at` | `timestamptz` | NOT NULL | `now()` | |
| `updated_at` | `timestamptz` | NOT NULL | `now()` | Auto-updated via trigger |

**Unique**: `(user_id, merchant_description)`

---

## Dropped Tables

These tables were explicitly dropped in earlier migrations (before consolidation):

| Table | Dropped In | Reason |
|-------|-----------|--------|
| `partnership_invitations` | 034 | Never worked (wrong field names in code) |
| `partnership_income_settings` | 034 | Replaced by 2Up model; `budget_setup_completed_at` moved to `partnerships` |
| `budgeting_methodologies` | -- | Reference/lookup table; no longer present in consolidated migration |
| `partnership_budget_methodology` | -- | No longer present in consolidated migration |
| `pay_schedules` | -- | No longer present in consolidated migration |
| `goal_contributions` | -- | No longer present in consolidated migration |
| `custom_budget_columns` | -- | No longer present in consolidated migration |
| `budget_section_memberships` | -- | No longer present in consolidated migration |

---

## Foreign Key Relationships

```
auth.users(id)
  -> profiles(id)

profiles(id)
  -> partnership_members(user_id)
  -> up_api_configs(user_id)
  -> accounts(user_id)
  -> transaction_notes(user_id)
  -> user_dashboard_charts(user_id)
  -> budget_item_preferences(user_id)
  -> budget_layout_presets(user_id)
  -> methodology_customizations(user_id)
  -> category_pin_states(user_id)
  -> transaction_category_overrides(changed_by)
  -> partner_link_requests(requester_user_id)
  -> partner_link_requests(target_user_id)
  -> budget_assignments(created_by)
  -> expense_matches(matched_by)
  -> expense_definitions(created_by)
  -> milestones(created_by)
  -> annual_checkups(created_by)
  -> notifications(user_id)
  -> merchant_category_rules(user_id)
  -> user_budgets(created_by)
  -> budget_layout_presets(template_author_id)

partnerships(id)
  -> partnership_members(partnership_id)
  -> savings_goals(partnership_id)
  -> budgets(partnership_id)
  -> investments(partnership_id)
  -> investment_contributions(partnership_id)
  -> budget_assignments(partnership_id)
  -> expense_definitions(partnership_id)
  -> couple_split_settings(partnership_id)
  -> budget_months(partnership_id)
  -> budget_item_preferences(partnership_id)
  -> methodology_customizations(partnership_id)
  -> category_pin_states(partnership_id)
  -> budget_layout_presets(partnership_id)
  -> budget_category_shares(partnership_id)
  -> transaction_share_overrides(partnership_id)
  -> partner_link_requests(primary_partnership_id)
  -> target_allocations(partnership_id)
  -> watchlist_items(partnership_id)
  -> milestones(partnership_id)
  -> annual_checkups(partnership_id)
  -> net_worth_snapshots(partnership_id)
  -> income_sources(partnership_id)
  -> user_budgets(partnership_id)

accounts(id)
  -> transactions(account_id)
  -> transactions(transfer_account_id)
  -> savings_goals(linked_account_id)

transactions(id)
  -> transaction_tags(transaction_id)
  -> transaction_notes(transaction_id)
  -> expense_matches(transaction_id)
  -> transaction_category_overrides(transaction_id)
  -> income_sources(linked_transaction_id)

categories(id)
  -> categories(parent_category_id)  [self-referencing]
  -> transactions(category_id)
  -> transactions(parent_category_id)
  -> category_mappings(up_category_id)
  -> budgets(category_id)
  -> transaction_category_overrides(override_category_id)
  -> transaction_category_overrides(override_parent_category_id)
  -> merchant_category_rules(category_id)
  -> merchant_category_rules(parent_category_id)

tags(name)
  -> transaction_tags(tag_name)

investments(id)
  -> investment_history(investment_id)
  -> investment_contributions(investment_id)
  -> budget_assignments(asset_id)
  -> budget_item_preferences(asset_id)

savings_goals(id)
  -> budget_assignments(goal_id)
  -> budget_item_preferences(goal_id)

expense_definitions(id)
  -> expense_matches(expense_definition_id)
  -> couple_split_settings(expense_definition_id)

user_budgets(id)
  -> budget_assignments(budget_id)
  -> budget_months(budget_id)
  -> budget_item_preferences(budget_id)
  -> budget_layout_presets(budget_id)
```

---

## Indexes

### Core Tables

| Index | Table | Columns / Expression | Condition |
|-------|-------|---------------------|-----------|
| `idx_partnership_members_user_id` | `partnership_members` | `(user_id)` | |
| `idx_partnership_members_partnership_id` | `partnership_members` | `(partnership_id)` | |
| `idx_accounts_user_id` | `accounts` | `(user_id)` | |
| `idx_accounts_joint_lookup` | `accounts` | `(up_account_id)` | `WHERE ownership_type = 'JOINT'` |
| `idx_transactions_account_id` | `transactions` | `(account_id)` | |
| `idx_transactions_created_at` | `transactions` | `(created_at DESC)` | |
| `idx_transactions_category_id` | `transactions` | `(category_id)` | |
| `idx_transactions_foreign_currency` | `transactions` | `(foreign_currency_code)` | `WHERE foreign_currency_code IS NOT NULL` |
| `idx_transactions_card_method` | `transactions` | `(card_purchase_method)` | `WHERE card_purchase_method IS NOT NULL` |
| `idx_transactions_transfer_account` | `transactions` | `(transfer_account_id)` | `WHERE transfer_account_id IS NOT NULL` |
| `idx_transactions_is_income` | `transactions` | `(is_income)` | `WHERE is_income = TRUE` |
| `idx_transactions_linked_pay_schedule` | `transactions` | `(linked_pay_schedule_id)` | `WHERE linked_pay_schedule_id IS NOT NULL` |
| `idx_transactions_income` | `transactions` | `(is_income, is_one_off_income)` | `WHERE is_income = true` |
| `idx_transactions_performing_customer` | `transactions` | `(performing_customer)` | `WHERE performing_customer IS NOT NULL` |
| `idx_transactions_is_shared` | `transactions` | `(is_shared)` | `WHERE is_shared = TRUE` |
| `idx_transactions_internal_transfer` | `transactions` | `(is_internal_transfer)` | `WHERE is_internal_transfer = true` |

### Tags & Notes

| Index | Table | Columns |
|-------|-------|---------|
| `idx_transaction_tags_tag_name` | `transaction_tags` | `(tag_name)` |
| `idx_transaction_tags_transaction_id` | `transaction_tags` | `(transaction_id)` |
| `idx_transaction_notes_transaction_id` | `transaction_notes` | `(transaction_id)` |
| `idx_transaction_notes_user_id` | `transaction_notes` | `(user_id)` |

### Category Mappings

| Index | Table | Columns |
|-------|-------|---------|
| `idx_category_mappings_up_id` | `category_mappings` | `(up_category_id)` |

### Dashboard Charts

| Index | Table | Columns |
|-------|-------|---------|
| `idx_user_dashboard_charts_user_id` | `user_dashboard_charts` | `(user_id)` |

### Budget System

| Index | Table | Columns / Expression | Condition |
|-------|-------|---------------------|-----------|
| `idx_budget_assignments_partnership_month` | `budget_assignments` | `(partnership_id, month)` | |
| `idx_budget_assignments_month` | `budget_assignments` | `(month)` | |
| `idx_budget_assignments_budget_id` | `budget_assignments` | `(budget_id)` | |
| `idx_budget_assignments_unique_per_view` | `budget_assignments` | `(partnership_id, month, budget_view, assignment_type, COALESCE(budget_id::text,''), COALESCE(category_name,''), COALESCE(subcategory_name,''), COALESCE(goal_id::text,''), COALESCE(asset_id::text,''))` | UNIQUE |
| `idx_budget_assignments_subcategory` | `budget_assignments` | `(partnership_id, month, category_name, subcategory_name)` | `WHERE subcategory_name IS NOT NULL` |
| `idx_budgets_partnership_id` | `budgets` | `(partnership_id)` | |
| `idx_expense_definitions_partnership` | `expense_definitions` | `(partnership_id)` | |
| `idx_expense_definitions_next_due` | `expense_definitions` | `(next_due_date)` | `WHERE is_active = true` |
| `idx_expense_definitions_match_pattern` | `expense_definitions` | `(match_pattern)` | `WHERE match_pattern IS NOT NULL` |
| `idx_expense_definitions_up_txn` | `expense_definitions` | `(linked_up_transaction_id)` | `WHERE linked_up_transaction_id IS NOT NULL` |
| `idx_expense_matches_expense_id` | `expense_matches` | `(expense_definition_id)` | |
| `idx_expense_matches_transaction_id` | `expense_matches` | `(transaction_id)` | |
| `idx_expense_matches_period` | `expense_matches` | `(expense_definition_id, for_period)` | |
| `idx_couple_split_settings_partnership` | `couple_split_settings` | `(partnership_id)` | |
| `idx_budget_months_partnership_month` | `budget_months` | `(partnership_id, month)` | |
| `idx_budget_months_budget_id` | `budget_months` | `(budget_id)` | |
| `budget_months_partnership_budget_month_key` | `budget_months` | `(partnership_id, month, COALESCE(budget_id, '00000000-...'))` | UNIQUE |

### Budget Preferences & Layout

| Index | Table | Columns / Expression | Condition |
|-------|-------|---------------------|-----------|
| `idx_budget_category_prefs_user` | `budget_item_preferences` | `(user_id)` | |
| `idx_budget_category_prefs_partnership` | `budget_item_preferences` | `(partnership_id)` | |
| `idx_budget_item_preferences_budget_id` | `budget_item_preferences` | `(budget_id)` | |
| `idx_budget_item_prefs_unique` | `budget_item_preferences` | `(user_id, partnership_id, item_type, COALESCE(...))` | UNIQUE |
| `idx_budget_layout_presets_budget_id` | `budget_layout_presets` | `(budget_id)` | |
| `idx_unique_active_layout_per_view` | `budget_layout_presets` | `(user_id, partnership_id, budget_view, budget_id)` | `WHERE is_active = true`, UNIQUE |

### User Budgets

| Index | Table | Columns / Expression | Condition |
|-------|-------|---------------------|-----------|
| `idx_user_budgets_partnership` | `user_budgets` | `(partnership_id)` | |
| `idx_user_budgets_default` | `user_budgets` | `(partnership_id)` | `WHERE is_default = true` |
| `idx_user_budgets_slug_lookup` | `user_budgets` | `(slug)` | |
| `idx_user_budgets_slug_unique` | `user_budgets` | `(partnership_id, slug)` | `WHERE is_active = true`, UNIQUE |

### Customization System

| Index | Table | Columns |
|-------|-------|---------|
| `idx_methodology_customizations_partnership` | `methodology_customizations` | `(partnership_id, methodology_name)` |
| `idx_methodology_customizations_user` | `methodology_customizations` | `(user_id, methodology_name)` |
| `idx_category_pin_states_user` | `category_pin_states` | `(user_id, methodology_name)` |
| `idx_transaction_overrides_txn` | `transaction_category_overrides` | `(transaction_id)` |
| `idx_transaction_overrides_user` | `transaction_category_overrides` | `(changed_by)` |

### Shared Expenses

| Index | Table | Columns |
|-------|-------|---------|
| `idx_category_shares_partnership` | `budget_category_shares` | `(partnership_id)` |
| `idx_category_shares_category` | `budget_category_shares` | `(partnership_id, category_name)` |
| `idx_transaction_overrides_partnership` | `transaction_share_overrides` | `(partnership_id)` |
| `idx_transaction_overrides_transaction` | `transaction_share_overrides` | `(transaction_id)` |

### Transaction References & Income

| Index | Table | Columns | Condition |
|-------|-------|---------|-----------|
| `idx_transaction_refs_up_txn` | `transaction_references` | `(up_transaction_id)` | |
| `idx_transaction_refs_type` | `transaction_references` | `(reference_type, reference_id)` | |
| `idx_income_sources_user_id` | `income_sources` | `(user_id)` | |
| `idx_income_sources_partnership_id` | `income_sources` | `(partnership_id)` | |
| `idx_income_sources_up_txn` | `income_sources` | `(linked_up_transaction_id)` | `WHERE linked_up_transaction_id IS NOT NULL` |
| `idx_income_sources_active` | `income_sources` | `(is_active)` | `WHERE is_active = true` |
| `idx_income_sources_manual_partner` | `income_sources` | `(partnership_id)` | `WHERE is_manual_partner_income = true` |

### Partner Link Requests

| Index | Table | Columns | Condition |
|-------|-------|---------|-----------|
| `idx_plr_target` | `partner_link_requests` | `(target_user_id)` | `WHERE status = 'pending'` |
| `idx_plr_requester` | `partner_link_requests` | `(requester_user_id)` | `WHERE status = 'pending'` |

### UP API Configs

| Index | Table | Columns | Condition |
|-------|-------|---------|-----------|
| `idx_up_api_configs_webhook_id` | `up_api_configs` | `(webhook_id)` | `WHERE webhook_id IS NOT NULL` |

### Investments

| Index | Table | Columns |
|-------|-------|---------|
| `idx_investments_partnership_id` | `investments` | `(partnership_id)` |
| `idx_investment_history_investment_id` | `investment_history` | `(investment_id)` |
| `idx_investment_history_recorded_at` | `investment_history` | `(recorded_at DESC)` |
| `idx_investment_history_composite` | `investment_history` | `(investment_id, recorded_at DESC)` |
| `idx_investment_contributions_lookup` | `investment_contributions` | `(investment_id, contributed_at)` |
| `idx_target_allocations_partnership_id` | `target_allocations` | `(partnership_id)` |
| `idx_watchlist_items_partnership_id` | `watchlist_items` | `(partnership_id)` |

### Milestones & Annual Checkups

| Index | Table | Columns |
|-------|-------|---------|
| `idx_milestones_partnership_id` | `milestones` | `(partnership_id)` |
| `idx_milestones_target_date` | `milestones` | `(target_date)` |
| `idx_annual_checkups_partnership_id` | `annual_checkups` | `(partnership_id)` |
| `idx_annual_checkups_fy` | `annual_checkups` | `(partnership_id, financial_year)` |

### Notifications

| Index | Table | Columns | Condition |
|-------|-------|---------|-----------|
| `idx_notifications_user_all` | `notifications` | `(user_id, created_at DESC)` | |
| `idx_notifications_user_unread` | `notifications` | `(user_id, created_at DESC)` | `WHERE read = false` |

### Merchant Category Rules

| Index | Table | Columns |
|-------|-------|---------|
| `idx_merchant_rules_lookup` | `merchant_category_rules` | `(user_id, merchant_description)` |

---

## Row Level Security (RLS) Policies

All tables with RLS enabled are listed below with their policies. `budget_layout_presets` is the only data table without RLS -- access control for it is handled at the application layer.

### profiles
| Policy | Operation | Rule |
|--------|-----------|------|
| Users can view own profile | SELECT | `auth.uid() = id` |
| Users can update own profile | UPDATE | `auth.uid() = id` |

### partnerships
| Policy | Operation | Rule |
|--------|-----------|------|
| Members can view their partnerships | SELECT | Via `partnership_members` |
| Users can create partnerships | INSERT | `true` |
| Owners can update partnerships | UPDATE | Via `partnership_members` WHERE `role = 'owner'` |

### partnership_members
| Policy | Operation | Rule |
|--------|-----------|------|
| Members can view membership | SELECT | Via `private.get_user_partnerships()` |
| Users can join partnerships | INSERT | `user_id = auth.uid()` |

### up_api_configs
| Policy | Operation | Rule |
|--------|-----------|------|
| Enable read for users | SELECT | `auth.uid() = user_id` |
| Enable insert for users | INSERT | `auth.uid() = user_id` |
| Enable update for users | UPDATE | `auth.uid() = user_id` |
| Enable delete for users | DELETE | `auth.uid() = user_id` |

### accounts
| Policy | Operation | Rule |
|--------|-----------|------|
| Users can view own accounts | SELECT | `user_id = auth.uid()` |
| Users can insert own accounts | INSERT | `user_id = auth.uid()` |
| Users can update own accounts | UPDATE | `user_id = auth.uid()` |
| Partners can view each others accounts | SELECT | Via `private.get_partner_user_ids()` |

### transactions
| Policy | Operation | Rule |
|--------|-----------|------|
| Users can view own transactions | SELECT | Via `accounts.user_id = auth.uid()` |
| Users can insert own transactions | INSERT | Via `accounts.user_id = auth.uid()` |
| Users can insert transactions | INSERT | Via `accounts.user_id = auth.uid()` (duplicate policy) |
| Users can update own transactions | UPDATE | Via `accounts.user_id = auth.uid()` |
| Partners can view each others transactions | SELECT | Via `private.get_partner_user_ids()` + accounts |

### categories
| Policy | Operation | Rule |
|--------|-----------|------|
| Anyone can view categories | SELECT | `true` |
| Anyone can insert categories | INSERT | `true` |
| Authenticated users can insert categories | INSERT | `auth.uid() IS NOT NULL` |
| Authenticated users can update categories | UPDATE | `auth.uid() IS NOT NULL` |

### category_mappings
| Policy | Operation | Rule |
|--------|-----------|------|
| Category mappings are viewable by all authenticated users | SELECT | `true` |

### tags
| Policy | Operation | Rule |
|--------|-----------|------|
| Anyone can view tags | SELECT | `true` |
| Anyone can insert tags | INSERT | `true` |
| Authenticated users can update tags | UPDATE | `auth.uid() IS NOT NULL` |

### transaction_tags
| Policy | Operation | Rule |
|--------|-----------|------|
| Users can view their transaction tags | SELECT | Via transactions + accounts |
| Users can insert transaction tags | INSERT | Via transactions + accounts |

### transaction_notes
| Policy | Operation | Rule |
|--------|-----------|------|
| Users can view their own transaction notes | SELECT | `user_id = auth.uid()` |
| Users can insert their own transaction notes | INSERT | `user_id = auth.uid()` |
| Users can update their own transaction notes | UPDATE | `user_id = auth.uid()` |
| Users can delete their own transaction notes | DELETE | `user_id = auth.uid()` |
| Partners can view shared notes | SELECT | `is_partner_visible = TRUE` AND via `private.get_partner_user_ids()` |

### savings_goals
| Policy | Operation | Rule |
|--------|-----------|------|
| Members can view/create/update/delete partnership goals | ALL | Via `partnership_members` |

### budgets
| Policy | Operation | Rule |
|--------|-----------|------|
| Members can view/create/update partnership budgets | SELECT/INSERT/UPDATE | Via `partnership_members` |

### investments
| Policy | Operation | Rule |
|--------|-----------|------|
| Members can view/create/update/delete partnership investments | ALL | Via `partnership_members` |

### investment_history
| Policy | Operation | Rule |
|--------|-----------|------|
| Members can view/insert investment history | SELECT/INSERT | Via investments -> `partnership_members` |

### investment_contributions
| Policy | Operation | Rule |
|--------|-----------|------|
| Members can view investment contributions | SELECT | Via `partnership_members` |
| Members can insert investment contributions | INSERT | Via `partnership_members` |
| Members can delete investment contributions | DELETE | Via `partnership_members` |

### target_allocations
| Policy | Operation | Rule |
|--------|-----------|------|
| Members can view/create/update/delete target allocations | ALL | Via `partnership_members` |

### watchlist_items
| Policy | Operation | Rule |
|--------|-----------|------|
| Members can view/create/update/delete watchlist items | ALL | Via `partnership_members` |

### user_budgets
| Policy | Operation | Rule |
|--------|-----------|------|
| Members can view/create/update/delete partnership budgets | ALL | Via `partnership_members` |

### user_dashboard_charts
| Policy | Operation | Rule |
|--------|-----------|------|
| Users can view/insert/update/delete their own charts | ALL | `auth.uid() = user_id` |

### budget_assignments
| Policy | Operation | Rule |
|--------|-----------|------|
| Members can view/create/update/delete partnership budget assignments | ALL | Via `partnership_members` |

### expense_definitions
| Policy | Operation | Rule |
|--------|-----------|------|
| Members can view/create/update/delete partnership expenses | ALL | Via `partnership_members` |

### expense_matches
| Policy | Operation | Rule |
|--------|-----------|------|
| Members can view/create/delete expense matches | SELECT/INSERT/DELETE | Via expense_definitions -> `partnership_members` |

### couple_split_settings
| Policy | Operation | Rule |
|--------|-----------|------|
| Members can view/create/update/delete partnership split settings | ALL | Via `partnership_members` |

### budget_months
| Policy | Operation | Rule |
|--------|-----------|------|
| Members can view/create/update partnership budget months | SELECT/INSERT/UPDATE | Via `partnership_members` |

### budget_item_preferences
| Policy | Operation | Rule |
|--------|-----------|------|
| Users can view/create/update/delete their own category preferences | ALL | `user_id = auth.uid()` |

### methodology_customizations
| Policy | Operation | Rule |
|--------|-----------|------|
| Members can view partnership customizations | SELECT | Via `partnership_members` |
| Members can manage their own customizations | ALL | `user_id = auth.uid()` OR (NULL user_id + owner role) |

### category_pin_states
| Policy | Operation | Rule |
|--------|-----------|------|
| Users can manage their own pin states | ALL | `user_id = auth.uid()` |

### transaction_category_overrides
| Policy | Operation | Rule |
|--------|-----------|------|
| Users can view overrides for their transactions | SELECT | Via transactions + accounts + partnership_members |
| Users can manage/update/delete overrides for own transactions | INSERT/UPDATE/DELETE | `changed_by = auth.uid()` + via transactions + accounts |

### budget_category_shares
| Policy | Operation | Rule |
|--------|-----------|------|
| Users can view/insert/update/delete their partnership's category shares | ALL | Via `partnership_members` |

### transaction_share_overrides
| Policy | Operation | Rule |
|--------|-----------|------|
| Users can view/insert/update/delete their partnership's transaction overrides | ALL | Via `partnership_members` |

### transaction_references
| Policy | Operation | Rule |
|--------|-----------|------|
| Users can view/insert/delete transaction references | SELECT/INSERT/DELETE | Via `up_transaction_id` in transactions + accounts |

### partner_link_requests
| Policy | Operation | Rule |
|--------|-----------|------|
| Users can view own link requests | SELECT | `requester_user_id = auth.uid()` OR `target_user_id = auth.uid()` |
| Users can create link requests | INSERT | `requester_user_id = auth.uid()` |
| Users can update own link requests | UPDATE | `target_user_id = auth.uid()` OR `requester_user_id = auth.uid()` |

### income_sources
| Policy | Operation | Rule |
|--------|-----------|------|
| Users can view own income sources | SELECT | `auth.uid() = user_id` |
| Users can view partnership income sources | SELECT | Via `partnership_members` |
| Users can insert own income sources | INSERT | `auth.uid() = user_id` |
| Partners can insert income for each other | INSERT | Via `partnership_members` (partner user_ids) |
| Partners can update income sources | UPDATE | Via `partnership_members` (partner user_ids) |
| Partners can delete income sources | DELETE | Via `partnership_members` (partner user_ids) |

### milestones
| Policy | Operation | Rule |
|--------|-----------|------|
| Members can view/create/update/delete partnership milestones | ALL | Via `partnership_members` |

### annual_checkups
| Policy | Operation | Rule |
|--------|-----------|------|
| Members can view/create/update/delete partnership checkups | ALL | Via `partnership_members` |

### net_worth_snapshots
| Policy | Operation | Rule |
|--------|-----------|------|
| Users can view own partnership snapshots | SELECT | Via `partnership_members` |
| Users can insert own partnership snapshots | INSERT | Via `partnership_members` |

### notifications
| Policy | Operation | Rule |
|--------|-----------|------|
| Users can view own notifications | SELECT | `user_id = auth.uid()` |
| Users can insert own notifications | INSERT | `user_id = auth.uid()` |
| Users can update own notifications | UPDATE | `user_id = auth.uid()` |

### merchant_category_rules
| Policy | Operation | Rule |
|--------|-----------|------|
| Users can view/create/update/delete their own merchant rules | ALL | `user_id = auth.uid()` |

---

## Functions

### Public Functions

| Function | Returns | Language | Security | Description |
|----------|---------|----------|----------|-------------|
| `handle_new_user()` | trigger | plpgsql | DEFINER | Auto-creates profile on `auth.users` insert |
| `handle_new_profile()` | trigger | plpgsql | DEFINER | Auto-creates partnership + membership on profile insert (idempotent) |
| `handle_updated_at()` | trigger | plpgsql | -- | Sets `updated_at = now()` on row update |
| `update_share_updated_at()` | trigger | plpgsql | -- | Updates `updated_at` on share tables |
| `update_user_budgets_updated_at()` | trigger | plpgsql | -- | Updates `updated_at` on user_budgets |
| `upsert_up_api_config(UUID, TEXT)` | json | plpgsql | DEFINER | Atomic upsert for UP API config |
| `invalidate_expense_match_on_recategorize()` | trigger | plpgsql | -- | Deletes expense matches when transaction category changes |
| `get_effective_category_id(UUID)` | text | sql | STABLE | Returns effective category considering overrides |
| `merge_partnerships(UUID, UUID, UUID, UUID)` | jsonb | plpgsql | DEFINER | Atomic partnership merge when partners link via 2Up |

### Private Functions

| Function | Returns | Language | Security | Description |
|----------|---------|----------|----------|-------------|
| `private.get_user_partnerships(UUID)` | table(partnership_id) | sql | DEFINER | Gets user's partnership IDs (bypasses RLS) |
| `private.get_partner_user_ids(UUID)` | table(user_id) | sql | DEFINER | Gets all user IDs in same partnerships (bypasses RLS) |

---

## Triggers

| Trigger | Table | Event | Function |
|---------|-------|-------|----------|
| `on_auth_user_created` | `auth.users` | AFTER INSERT | `handle_new_user()` |
| `on_profile_created` | `profiles` | AFTER INSERT | `handle_new_profile()` |
| `set_updated_at_profiles` | `profiles` | BEFORE UPDATE | `handle_updated_at()` |
| `set_updated_at_partnerships` | `partnerships` | BEFORE UPDATE | `handle_updated_at()` |
| `set_updated_at_up_api_configs` | `up_api_configs` | BEFORE UPDATE | `handle_updated_at()` |
| `set_updated_at_accounts` | `accounts` | BEFORE UPDATE | `handle_updated_at()` |
| `set_updated_at_savings_goals` | `savings_goals` | BEFORE UPDATE | `handle_updated_at()` |
| `set_updated_at_budgets` | `budgets` | BEFORE UPDATE | `handle_updated_at()` |
| `set_updated_at_investments` | `investments` | BEFORE UPDATE | `handle_updated_at()` |
| `set_updated_at_transaction_notes` | `transaction_notes` | BEFORE UPDATE | `handle_updated_at()` |
| `set_updated_at_milestones` | `milestones` | BEFORE UPDATE | `handle_updated_at()` |
| `set_updated_at_target_allocations` | `target_allocations` | BEFORE UPDATE | `handle_updated_at()` |
| `set_updated_at_watchlist_items` | `watchlist_items` | BEFORE UPDATE | `handle_updated_at()` |
| `set_updated_at_merchant_category_rules` | `merchant_category_rules` | BEFORE UPDATE | `handle_updated_at()` |
| `set_updated_at_annual_checkups` | `annual_checkups` | BEFORE UPDATE | `handle_updated_at()` |
| `set_user_budgets_updated_at` | `user_budgets` | BEFORE UPDATE | `update_user_budgets_updated_at()` |
| `trigger_invalidate_expense_match` | `transactions` | AFTER UPDATE | `invalidate_expense_match_on_recategorize()` |
| `trigger_category_shares_updated_at` | `budget_category_shares` | BEFORE UPDATE | `update_share_updated_at()` |
| `trigger_transaction_overrides_updated_at` | `transaction_share_overrides` | BEFORE UPDATE | `update_share_updated_at()` |

---

## Private Schema

The `private` schema contains security definer functions that bypass RLS for internal queries:

```sql
CREATE SCHEMA IF NOT EXISTS private;
```

These functions are used in RLS policies to avoid infinite recursion when `partnership_members` policies reference other tables that also reference `partnership_members`.

- `private.get_user_partnerships(user_uuid UUID)` -- Returns all partnership IDs for a user
- `private.get_partner_user_ids(user_uuid UUID)` -- Returns all user IDs in same partnerships
