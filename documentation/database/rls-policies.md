# Row Level Security (RLS) Policies Reference

> **Generated from:** Consolidated migration file `supabase/migrations/00000000000000_initial_schema.sql`
> **Scope:** Final state of RLS policies after all migrations applied

---

## Table of Contents

1. [RLS Strategy Overview](#rls-strategy-overview)
2. [Helper Functions](#helper-functions)
3. [Security Patterns](#security-patterns)
4. [Table-by-Table Policy Listing](#table-by-table-policy-listing)
5. [Tables Without RLS](#tables-without-rls)

---

## RLS Strategy Overview

PiggyBack uses Supabase Row Level Security to enforce data isolation at the database level. The application is built around a **partnership model** (couples/household finance tracking) with the following access tiers:

| Access Tier | Description | Example Tables |
|---|---|---|
| **Direct user ownership** | `user_id = auth.uid()` | `profiles`, `up_api_configs`, `accounts`, `notifications`, `merchant_category_rules` |
| **Partnership-scoped** | User must be a member of the partnership that owns the row | `savings_goals`, `budgets`, `expense_definitions`, `investments`, `user_budgets`, `milestones`, `annual_checkups` |
| **Partner visibility** | User can see data owned by anyone in their partnership | `accounts` (partner view), `transactions` (partner view), `income_sources` (partner view) |
| **Public read** | Any authenticated (or anonymous) user can read | `categories`, `category_mappings`, `tags` |
| **FOR ALL policies** | Single policy covers SELECT/INSERT/UPDATE/DELETE | `category_pin_states`, `methodology_customizations` (manage own) |

All tables that store user data have RLS enabled. Server-side operations (webhook handlers) use the **service role key** which bypasses RLS entirely.

---

## Helper Functions

### `private.get_user_partnerships(user_uuid uuid)`

**Schema:** `private` (not accessible to client)
**Security:** `SECURITY DEFINER` (executes as function owner, bypasses RLS)

```sql
CREATE OR REPLACE FUNCTION private.get_user_partnerships(user_uuid uuid)
RETURNS TABLE(partnership_id uuid)
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT partnership_id
  FROM public.partnership_members
  WHERE user_id = user_uuid;
$$;
```

**Purpose:** Returns all partnership IDs for a given user. Used in RLS policies to avoid infinite recursion when `partnership_members` policies would otherwise self-reference.

**Used by:** `partnership_members` SELECT policy.

---

### `private.get_partner_user_ids(user_uuid uuid)`

**Schema:** `private` (not accessible to client)
**Security:** `SECURITY DEFINER` (executes as function owner, bypasses RLS)

```sql
CREATE OR REPLACE FUNCTION private.get_partner_user_ids(user_uuid uuid)
RETURNS TABLE(user_id uuid)
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT DISTINCT pm2.user_id
  FROM public.partnership_members pm1
  JOIN public.partnership_members pm2 ON pm1.partnership_id = pm2.partnership_id
  WHERE pm1.user_id = user_uuid;
$$;
```

**Purpose:** Returns all user IDs that share a partnership with the given user (including the user themselves). Enables "partner can view partner's data" policies without infinite recursion.

**Used by:** Policies on `accounts`, `transactions`, `transaction_notes`, `income_sources`.

---

### `public.upsert_up_api_config(p_user_id UUID, p_encrypted_token TEXT)`

**Security:** `SECURITY DEFINER` (bypasses RLS for atomic upsert)

Performs atomic upsert of UP API configuration. Includes manual `auth.uid()` check before executing.

---

### `public.merge_partnerships(...)`

**Security:** `SECURITY DEFINER` (bypasses RLS for cross-partnership data migration)

Atomic operation that moves a user and their data from one partnership to another when partners link via 2Up.

---

## Security Patterns

### Pattern 1: Direct User Ownership
```sql
-- User can only access rows where user_id matches their auth ID
FOR SELECT USING (user_id = auth.uid())
FOR INSERT WITH CHECK (user_id = auth.uid())
```
**Used on:** `profiles`, `up_api_configs`, `accounts`, `user_dashboard_charts`, `budget_item_preferences`, `transaction_notes`, `category_pin_states`, `notifications`, `merchant_category_rules`

### Pattern 2: Partnership Membership
```sql
-- User can access rows belonging to their partnership(s)
FOR SELECT USING (
  partnership_id IN (
    SELECT partnership_id FROM public.partnership_members
    WHERE user_id = auth.uid()
  )
)
```
**Used on:** `partnerships`, `savings_goals`, `budgets`, `investments`, `budget_assignments`, `expense_definitions`, `couple_split_settings`, `budget_months`, `methodology_customizations`, `budget_category_shares`, `transaction_share_overrides`, `target_allocations`, `watchlist_items`, `milestones`, `annual_checkups`, `net_worth_snapshots`, `user_budgets`, `investment_contributions`

### Pattern 3: Partner Visibility (via SECURITY DEFINER helper)
```sql
-- User can see data from all users in their partnership(s)
FOR SELECT USING (
  user_id IN (
    SELECT user_id FROM private.get_partner_user_ids((SELECT auth.uid()))
  )
)
```
**Used on:** `accounts`, `transactions`, `transaction_notes` (with `is_partner_visible` check), `income_sources` (partner insert/update/delete)

### Pattern 4: Indirect Ownership (via parent table)
```sql
-- Access controlled through relationship to parent table
FOR SELECT USING (
  investment_id IN (
    SELECT id FROM public.investments
    WHERE partnership_id IN (
      SELECT partnership_id FROM public.partnership_members
      WHERE user_id = auth.uid()
    )
  )
)
```
**Used on:** `investment_history`, `expense_matches`, `transaction_category_overrides`, `transaction_references`

### Pattern 5: Public Read Access
```sql
FOR SELECT USING (true)
```
**Used on:** `categories`, `tags`, `category_mappings`

### Pattern 6: FOR ALL Policies
```sql
-- Single policy covering all operations
FOR ALL USING (user_id = auth.uid())
```
**Used on:** `category_pin_states`, `methodology_customizations` (manage own)

### Pattern 7: Role-Based (Owner Only)
```sql
-- Only partnership owners can perform this action
FOR UPDATE USING (
  id IN (
    SELECT partnership_id FROM public.partnership_members
    WHERE user_id = auth.uid() AND role = 'owner'
  )
)
```
**Used on:** `partnerships` (update only)

---

## Table-by-Table Policy Listing

### `profiles`
**RLS Enabled:** Yes
**Access Pattern:** Direct user ownership

| Policy Name | Operation | Condition |
|---|---|---|
| `Users can view own profile` | SELECT | `auth.uid() = id` |
| `Users can update own profile` | UPDATE | `auth.uid() = id` |

> **Note:** No INSERT policy -- profiles are created by the `handle_new_user()` trigger (SECURITY DEFINER) on `auth.users` insert. No DELETE policy -- users cannot delete their own profile via the client.

---

### `partnerships`
**RLS Enabled:** Yes
**Access Pattern:** Partnership membership + role-based update

| Policy Name | Operation | Condition |
|---|---|---|
| `Members can view their partnerships` | SELECT | `id IN (SELECT partnership_id FROM partnership_members WHERE user_id = auth.uid())` |
| `Users can create partnerships` | INSERT | `true` (any authenticated user) |
| `Owners can update partnerships` | UPDATE | `id IN (SELECT partnership_id FROM partnership_members WHERE user_id = auth.uid() AND role = 'owner')` |

> **Note:** No DELETE policy. The `Users can create partnerships` INSERT policy is permissive (`WITH CHECK (true)`) because partnership creation is handled by the `handle_new_profile()` trigger, but the open policy also allows manual creation.

---

### `partnership_members`
**RLS Enabled:** Yes
**Access Pattern:** Partnership membership (via SECURITY DEFINER helper)

| Policy Name | Operation | Condition |
|---|---|---|
| `Members can view membership` | SELECT | `partnership_id IN (SELECT partnership_id FROM private.get_user_partnerships((SELECT auth.uid())))` |
| `Users can join partnerships` | INSERT | `user_id = auth.uid()` |

> **Note:** No UPDATE or DELETE policies.

---

### `up_api_configs`
**RLS Enabled:** Yes
**Access Pattern:** Direct user ownership (full CRUD)

| Policy Name | Operation | Condition |
|---|---|---|
| `Enable read for users` | SELECT | `auth.uid() = user_id` |
| `Enable insert for users` | INSERT | `auth.uid() = user_id` |
| `Enable update for users` | UPDATE | `auth.uid() = user_id` |
| `Enable delete for users` | DELETE | `auth.uid() = user_id` |

---

### `accounts`
**RLS Enabled:** Yes
**Access Pattern:** Direct user ownership + partner visibility

| Policy Name | Operation | Condition |
|---|---|---|
| `Users can view own accounts` | SELECT | `user_id = auth.uid()` |
| `Users can insert own accounts` | INSERT | `user_id = auth.uid()` |
| `Users can update own accounts` | UPDATE | `user_id = auth.uid()` |
| `Partners can view each others accounts` | SELECT | `user_id IN (SELECT user_id FROM private.get_partner_user_ids((SELECT auth.uid())))` |

> **Note:** No DELETE policy.

---

### `transactions`
**RLS Enabled:** Yes
**Access Pattern:** Indirect ownership via `accounts` + partner visibility

| Policy Name | Operation | Condition |
|---|---|---|
| `Users can view own transactions` | SELECT | `account_id IN (SELECT id FROM accounts WHERE user_id = auth.uid())` |
| `Users can insert own transactions` | INSERT | `account_id IN (SELECT id FROM accounts WHERE user_id = auth.uid())` |
| `Users can insert transactions` | INSERT | `account_id IN (SELECT id FROM accounts WHERE user_id = auth.uid())` (duplicate policy) |
| `Users can update own transactions` | UPDATE | `account_id IN (SELECT id FROM accounts WHERE user_id = auth.uid())` |
| `Partners can view each others transactions` | SELECT | `account_id IN (SELECT a.id FROM accounts a WHERE a.user_id IN (SELECT user_id FROM private.get_partner_user_ids((SELECT auth.uid()))))` |

> **Note:** Two INSERT policies exist with equivalent conditions but different names. No DELETE policy.

---

### `categories`
**RLS Enabled:** Yes
**Access Pattern:** Public read + authenticated write

| Policy Name | Operation | Condition |
|---|---|---|
| `Anyone can view categories` | SELECT | `true` |
| `Anyone can insert categories` | INSERT | `true` |
| `Authenticated users can insert categories` | INSERT | `auth.uid() IS NOT NULL` |
| `Authenticated users can update categories` | UPDATE | `auth.uid() IS NOT NULL` |

> **Note:** Categories have both write policies (public and authenticated INSERT). Categories are primarily synced from UP Bank API using the service role, but these policies allow client-side creation too.

---

### `tags`
**RLS Enabled:** Yes
**Access Pattern:** Public read + authenticated write

| Policy Name | Operation | Condition |
|---|---|---|
| `Anyone can view tags` | SELECT | `true` |
| `Anyone can insert tags` | INSERT | `true` |
| `Authenticated users can update tags` | UPDATE | `auth.uid() IS NOT NULL` |

> **Note:** Tags are primarily synced from UP Bank API using the service role. No DELETE policy.

---

### `savings_goals`
**RLS Enabled:** Yes
**Access Pattern:** Partnership membership (full CRUD)

| Policy Name | Operation | Condition |
|---|---|---|
| `Members can view partnership goals` | SELECT | Partnership member check |
| `Members can create partnership goals` | INSERT | Partnership member check |
| `Members can update partnership goals` | UPDATE | Partnership member check |
| `Members can delete partnership goals` | DELETE | Partnership member check |

---

### `budgets`
**RLS Enabled:** Yes
**Access Pattern:** Partnership membership (SELECT/INSERT/UPDATE)

| Policy Name | Operation | Condition |
|---|---|---|
| `Members can view partnership budgets` | SELECT | Partnership member check |
| `Members can create partnership budgets` | INSERT | Partnership member check |
| `Members can update partnership budgets` | UPDATE | Partnership member check |

> **Note:** No DELETE policy on budgets.

---

### `investments`
**RLS Enabled:** Yes
**Access Pattern:** Partnership membership (full CRUD)

| Policy Name | Operation | Condition |
|---|---|---|
| `Members can view partnership investments` | SELECT | Partnership member check |
| `Members can create partnership investments` | INSERT | Partnership member check |
| `Members can update partnership investments` | UPDATE | Partnership member check |
| `Members can delete partnership investments` | DELETE | Partnership member check |

---

### `investment_history`
**RLS Enabled:** Yes
**Access Pattern:** Indirect via `investments` -> `partnerships`

| Policy Name | Operation | Condition |
|---|---|---|
| `Members can view investment history` | SELECT | `investment_id IN (SELECT id FROM investments WHERE partnership_id IN (SELECT partnership_id FROM partnership_members WHERE user_id = auth.uid()))` |
| `Members can insert investment history` | INSERT | Same nested check |

> **Note:** No UPDATE or DELETE policies.

---

### `investment_contributions`
**RLS Enabled:** Yes
**Access Pattern:** Partnership membership (SELECT/INSERT/DELETE)

| Policy Name | Operation | Condition |
|---|---|---|
| `Members can view investment contributions` | SELECT | Partnership member check |
| `Members can insert investment contributions` | INSERT | Partnership member check |
| `Members can delete investment contributions` | DELETE | Partnership member check |

> **Note:** No UPDATE policy. Contributions are created or deleted, not modified.

---

### `transaction_tags`
**RLS Enabled:** Yes
**Access Pattern:** Indirect via `transactions` -> `accounts`

| Policy Name | Operation | Condition |
|---|---|---|
| `Users can view their transaction tags` | SELECT | `transaction_id IN (SELECT t.id FROM transactions t INNER JOIN accounts a ON a.id = t.account_id WHERE a.user_id = auth.uid())` |
| `Users can insert transaction tags` | INSERT | Same nested check |

> **Note:** No UPDATE or DELETE policies. Tags are managed by the sync process.

---

### `transaction_notes`
**RLS Enabled:** Yes
**Access Pattern:** Direct user ownership + partner visibility (conditional)

| Policy Name | Operation | Condition |
|---|---|---|
| `Users can view their own transaction notes` | SELECT | `user_id = auth.uid()` |
| `Users can insert their own transaction notes` | INSERT | `user_id = auth.uid()` |
| `Users can update their own transaction notes` | UPDATE | `user_id = auth.uid()` |
| `Users can delete their own transaction notes` | DELETE | `user_id = auth.uid()` |
| `Partners can view shared notes` | SELECT | `is_partner_visible = TRUE AND user_id IN (SELECT user_id FROM private.get_partner_user_ids((SELECT auth.uid())))` |

---

### `transaction_references`
**RLS Enabled:** Yes
**Access Pattern:** Indirect via `transactions` -> `accounts`

| Policy Name | Operation | Condition |
|---|---|---|
| `Users can view transaction references` | SELECT | `up_transaction_id IN (SELECT t.up_transaction_id FROM transactions t INNER JOIN accounts a ON t.account_id = a.id WHERE a.user_id = auth.uid())` |
| `Users can insert transaction references` | INSERT | Same check |
| `Users can delete transaction references` | DELETE | Same check |

> **Note:** No UPDATE policy.

---

### `transaction_category_overrides`
**RLS Enabled:** Yes
**Access Pattern:** Indirect via `transactions` -> `accounts` + user ownership

| Policy Name | Operation | Condition |
|---|---|---|
| `Users can view overrides for their transactions` | SELECT | `transaction_id IN (SELECT t.id FROM transactions t JOIN accounts a ON a.id = t.account_id JOIN partnership_members pm ON pm.user_id = a.user_id WHERE pm.user_id = auth.uid())` |
| `Users can manage overrides for their own transactions` | INSERT | `changed_by = auth.uid() AND transaction_id IN (SELECT ... WHERE a.user_id = auth.uid())` |
| `Users can update their own overrides` | UPDATE | `changed_by = auth.uid() AND transaction_id IN (...)` |
| `Users can delete their own overrides` | DELETE | `changed_by = auth.uid() AND transaction_id IN (...)` |

> **Note:** The SELECT policy joins through `partnership_members` (allowing partners to see overrides), while INSERT/UPDATE/DELETE are restricted to the transaction owner.

---

### `transaction_share_overrides`
**RLS Enabled:** Yes
**Access Pattern:** Partnership membership (full CRUD)

| Policy Name | Operation | Condition |
|---|---|---|
| `Users can view their partnership's transaction overrides` | SELECT | Partnership member check |
| `Users can insert transaction overrides for their partnership` | INSERT | Partnership member check |
| `Users can update their partnership's transaction overrides` | UPDATE | Partnership member check |
| `Users can delete their partnership's transaction overrides` | DELETE | Partnership member check |

---

### `user_dashboard_charts`
**RLS Enabled:** Yes
**Access Pattern:** Direct user ownership (full CRUD)

| Policy Name | Operation | Condition |
|---|---|---|
| `Users can view their own charts` | SELECT | `auth.uid() = user_id` |
| `Users can insert their own charts` | INSERT | `auth.uid() = user_id` |
| `Users can update their own charts` | UPDATE | `auth.uid() = user_id` |
| `Users can delete their own charts` | DELETE | `auth.uid() = user_id` |

---

### `user_budgets`
**RLS Enabled:** Yes
**Access Pattern:** Partnership membership (full CRUD)

| Policy Name | Operation | Condition |
|---|---|---|
| `Members can view partnership budgets` | SELECT | Partnership member check |
| `Members can create partnership budgets` | INSERT | Partnership member check |
| `Members can update partnership budgets` | UPDATE | Partnership member check |
| `Members can delete partnership budgets` | DELETE | Partnership member check |

> **Note:** These policy names overlap with `budgets` table policies. PostgreSQL policy names are scoped per-table, so there is no conflict.

---

### `budget_assignments`
**RLS Enabled:** Yes
**Access Pattern:** Partnership membership (full CRUD)

| Policy Name | Operation | Condition |
|---|---|---|
| `Members can view partnership budget assignments` | SELECT | Partnership member check |
| `Members can create partnership budget assignments` | INSERT | Partnership member check |
| `Members can update partnership budget assignments` | UPDATE | Partnership member check |
| `Members can delete partnership budget assignments` | DELETE | Partnership member check |

---

### `budget_months`
**RLS Enabled:** Yes
**Access Pattern:** Partnership membership (SELECT/INSERT/UPDATE)

| Policy Name | Operation | Condition |
|---|---|---|
| `Members can view partnership budget months` | SELECT | Partnership member check |
| `Members can create partnership budget months` | INSERT | Partnership member check |
| `Members can update partnership budget months` | UPDATE | Partnership member check |

> **Note:** No DELETE policy.

---

### `budget_category_shares`
**RLS Enabled:** Yes
**Access Pattern:** Partnership membership (full CRUD)

| Policy Name | Operation | Condition |
|---|---|---|
| `Users can view their partnership's category shares` | SELECT | Partnership member check |
| `Users can insert category shares for their partnership` | INSERT | Partnership member check |
| `Users can update their partnership's category shares` | UPDATE | Partnership member check |
| `Users can delete their partnership's category shares` | DELETE | Partnership member check |

---

### `budget_item_preferences`
**RLS Enabled:** Yes
**Access Pattern:** Direct user ownership (full CRUD)

| Policy Name | Operation | Condition |
|---|---|---|
| `Users can view their own category preferences` | SELECT | `user_id = auth.uid()` |
| `Users can create their own category preferences` | INSERT | `user_id = auth.uid()` |
| `Users can update their own category preferences` | UPDATE | `user_id = auth.uid()` |
| `Users can delete their own category preferences` | DELETE | `user_id = auth.uid()` |

> **Note:** Policy names still reference the old table name `category_preferences`. Functionally correct since policies are bound to the table object, not the name.

---

### `income_sources`
**RLS Enabled:** Yes
**Access Pattern:** Direct user ownership + partnership visibility + partner write access

| Policy Name | Operation | Condition |
|---|---|---|
| `Users can view own income sources` | SELECT | `auth.uid() = user_id` |
| `Users can view partnership income sources` | SELECT | `partnership_id IN (SELECT partnership_id FROM partnership_members WHERE user_id = auth.uid())` |
| `Users can insert own income sources` | INSERT | `auth.uid() = user_id` |
| `Partners can insert income for each other` | INSERT | `user_id IN (SELECT pm.user_id FROM partnership_members pm WHERE pm.partnership_id IN (SELECT partnership_id FROM partnership_members WHERE user_id = auth.uid()))` |
| `Partners can update income sources` | UPDATE | Same partner user_ids check |
| `Partners can delete income sources` | DELETE | Same partner user_ids check |

> **Note:** Partners can create, update, and delete income sources for each other (e.g., for manual partner income tracking). Two separate SELECT policies provide access: one for own sources, one for partnership-scoped sources.

---

### `expense_definitions`
**RLS Enabled:** Yes
**Access Pattern:** Partnership membership (full CRUD)

| Policy Name | Operation | Condition |
|---|---|---|
| `Members can view partnership expenses` | SELECT | Partnership member check |
| `Members can create partnership expenses` | INSERT | Partnership member check |
| `Members can update partnership expenses` | UPDATE | Partnership member check |
| `Members can delete partnership expenses` | DELETE | Partnership member check |

---

### `expense_matches`
**RLS Enabled:** Yes
**Access Pattern:** Indirect via `expense_definitions` -> `partnerships`

| Policy Name | Operation | Condition |
|---|---|---|
| `Members can view expense matches` | SELECT | `expense_definition_id IN (SELECT id FROM expense_definitions WHERE partnership_id IN (...))` |
| `Members can create expense matches` | INSERT | Same nested check |
| `Members can delete expense matches` | DELETE | Same nested check |

> **Note:** No UPDATE policy. Matches are created or deleted, not modified.

---

### `couple_split_settings`
**RLS Enabled:** Yes
**Access Pattern:** Partnership membership (full CRUD)

| Policy Name | Operation | Condition |
|---|---|---|
| `Members can view partnership split settings` | SELECT | Partnership member check |
| `Members can create partnership split settings` | INSERT | Partnership member check |
| `Members can update partnership split settings` | UPDATE | Partnership member check |
| `Members can delete partnership split settings` | DELETE | Partnership member check |

---

### `methodology_customizations`
**RLS Enabled:** Yes
**Access Pattern:** Partnership membership (SELECT) + user ownership or owner role (ALL)

| Policy Name | Operation | Condition |
|---|---|---|
| `Members can view partnership customizations` | SELECT | Partnership member check |
| `Members can manage their own customizations` | ALL | `user_id = auth.uid() OR (user_id IS NULL AND partnership_id IN (SELECT ... WHERE role = 'owner'))` |

> **Note:** The ALL policy allows partnership owners to manage partnership-wide customizations (where `user_id IS NULL`), while regular members can only manage their own.

---

### `category_pin_states`
**RLS Enabled:** Yes
**Access Pattern:** Direct user ownership (FOR ALL)

| Policy Name | Operation | Condition |
|---|---|---|
| `Users can manage their own pin states` | ALL | `user_id = auth.uid()` |

---

### `category_mappings`
**RLS Enabled:** Yes
**Access Pattern:** Authenticated read-only

| Policy Name | Operation | Condition |
|---|---|---|
| `Category mappings are viewable by all authenticated users` | SELECT | `true` |

> **Note:** No write policies. Managed by migrations only.

---

### `milestones`
**RLS Enabled:** Yes
**Access Pattern:** Partnership membership (full CRUD)

| Policy Name | Operation | Condition |
|---|---|---|
| `Members can view partnership milestones` | SELECT | Partnership member check |
| `Members can create partnership milestones` | INSERT | Partnership member check |
| `Members can update partnership milestones` | UPDATE | Partnership member check |
| `Members can delete partnership milestones` | DELETE | Partnership member check |

---

### `annual_checkups`
**RLS Enabled:** Yes
**Access Pattern:** Partnership membership (full CRUD)

| Policy Name | Operation | Condition |
|---|---|---|
| `Members can view partnership checkups` | SELECT | Partnership member check |
| `Members can create partnership checkups` | INSERT | Partnership member check |
| `Members can update partnership checkups` | UPDATE | Partnership member check |
| `Members can delete partnership checkups` | DELETE | Partnership member check |

---

### `net_worth_snapshots`
**RLS Enabled:** Yes
**Access Pattern:** Partnership membership (SELECT/INSERT)

| Policy Name | Operation | Condition |
|---|---|---|
| `Users can view own partnership snapshots` | SELECT | Partnership member check |
| `Users can insert own partnership snapshots` | INSERT | Partnership member check |

> **Note:** No UPDATE or DELETE policies. Snapshots are immutable once created.

---

### `target_allocations`
**RLS Enabled:** Yes
**Access Pattern:** Partnership membership (full CRUD)

| Policy Name | Operation | Condition |
|---|---|---|
| `Members can view target allocations` | SELECT | Partnership member check |
| `Members can create target allocations` | INSERT | Partnership member check |
| `Members can update target allocations` | UPDATE | Partnership member check |
| `Members can delete target allocations` | DELETE | Partnership member check |

---

### `watchlist_items`
**RLS Enabled:** Yes
**Access Pattern:** Partnership membership (full CRUD)

| Policy Name | Operation | Condition |
|---|---|---|
| `Members can view watchlist items` | SELECT | Partnership member check |
| `Members can create watchlist items` | INSERT | Partnership member check |
| `Members can update watchlist items` | UPDATE | Partnership member check |
| `Members can delete watchlist items` | DELETE | Partnership member check |

---

### `partner_link_requests`
**RLS Enabled:** Yes
**Access Pattern:** Requester or target user

| Policy Name | Operation | Condition |
|---|---|---|
| `Users can view own link requests` | SELECT | `requester_user_id = auth.uid() OR target_user_id = auth.uid()` |
| `Users can create link requests` | INSERT | `requester_user_id = auth.uid()` |
| `Users can update own link requests` | UPDATE | `target_user_id = auth.uid() OR requester_user_id = auth.uid()` |

> **Note:** No DELETE policy. The UPDATE policy allows both the requester (to cancel) and the target (to accept/decline) to update the request.

---

### `notifications`
**RLS Enabled:** Yes
**Access Pattern:** Direct user ownership (SELECT/INSERT/UPDATE)

| Policy Name | Operation | Condition |
|---|---|---|
| `Users can view own notifications` | SELECT | `user_id = auth.uid()` |
| `Users can insert own notifications` | INSERT | `user_id = auth.uid()` |
| `Users can update own notifications` | UPDATE | `user_id = auth.uid()` |

> **Note:** No DELETE policy. Notifications are updated (read/actioned) but not deleted.

---

### `merchant_category_rules`
**RLS Enabled:** Yes
**Access Pattern:** Direct user ownership (full CRUD)

| Policy Name | Operation | Condition |
|---|---|---|
| `Users can view their own merchant rules` | SELECT | `user_id = auth.uid()` |
| `Users can create their own merchant rules` | INSERT | `user_id = auth.uid()` |
| `Users can update their own merchant rules` | UPDATE | `user_id = auth.uid()` |
| `Users can delete their own merchant rules` | DELETE | `user_id = auth.uid()` |

---

## Tables Without RLS

### Tables in the Schema With No RLS

| Table | Reason |
|---|---|
| `budget_layout_presets` | RLS is not enabled in the consolidated migration. No `ALTER TABLE ... ENABLE ROW LEVEL SECURITY` and no `CREATE POLICY` statements exist. Access control is handled at the application layer. |

> **Note:** The `budgeting_methodologies`, `partnership_budget_methodology`, `pay_schedules`, `goal_contributions`, `custom_budget_columns`, and `budget_section_memberships` tables are no longer present in the consolidated migration and have been removed from the database.
