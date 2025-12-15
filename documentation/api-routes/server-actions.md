# Server Actions Reference

All 13 server action files and their 48+ exported functions.

## Overview
Server actions use the `"use server"` directive and are called directly from client components. All mutation actions use `demoActionGuard()` to prevent changes in demo mode (except `income.ts` which interacts directly with the UP Bank API). Actions use `revalidatePath()` for cache invalidation after mutations.

## transactions.ts
**Path:** `src/app/actions/transactions.ts`

| Function | Parameters | Returns | Description |
|----------|-----------|---------|-------------|
| `markTransactionAsIncome` | `transactionId: string`, `isIncome: boolean`, `incomeType?: string \| null` | `{ success: true }` or `{ error: string }` | Marks transaction as income across all matching descriptions for all user accounts |

**Cache invalidation:** `/activity`, `/home`, `/settings/income`.

**Notable behavior:** `markTransactionAsIncome` marks ALL transactions with the same description across all user accounts, not just the single transaction.

---

## goals.ts
**Path:** `src/app/actions/goals.ts`

| Function | Parameters | Returns | Description |
|----------|-----------|---------|-------------|
| `addFundsToGoal` | `goalId: string`, `amountCents: number` | `{ success: true }` or `{ error: string }` | Adds funds to a savings goal; auto-completes if target reached |
| `markGoalComplete` | `goalId: string` | `{ success: true }` or `{ error: string }` | Manually marks a goal as completed with timestamp |
| `reopenGoal` | `goalId: string` | `{ success: true }` or `{ error: string }` | Reopens a completed goal (sets is_completed to false, clears completed_at) |
| `deleteGoal` | `goalId: string` | `{ success: true }` or `{ error: string }` | Hard-deletes a savings goal |
| `updateGoal` | `goalId: string`, `data: { name?, target_amount_cents?, current_amount_cents?, deadline?, icon?, color?, linked_account_id?, description?, preparation_checklist?, estimated_monthly_impact_cents?, sort_order? }` | `{ success: true }` or `{ error: string }` | Updates goal properties (name, target, deadline, icon, color, linked account, description, checklist, impact estimate, sort order) |
| `toggleGoalChecklistItem` | `goalId: string`, `itemIndex: number` | `{ success: true }` or `{ error: string }` | Toggles a checklist item's done state within a goal's preparation_checklist |

**Cache invalidation:** `/goals`, `/home`, `/plan`.

**Notable behavior:**
- `addFundsToGoal` checks the new total against `target_amount_cents` and auto-completes the goal if the target is reached.
- `addFundsToGoal` records a contribution to `goal_contributions` (source: `manual`) as fire-and-forget.
- Both `addFundsToGoal` and `markGoalComplete` check milestone thresholds (25%, 50%, 75%, 100%) and create notifications via `createNotification` when a threshold is crossed. Notifications are fire-and-forget.
- The UP Bank webhook handler also records contributions (source: `webhook_sync`) when linked saver account balances change.

---

## onboarding.ts
**Path:** `src/app/actions/onboarding.ts`

| Function | Parameters | Returns | Description |
|----------|-----------|---------|-------------|
| `completeOnboarding` | `stepsCompleted: string[]` | `void` | Marks onboarding complete; stores completed step list and timestamp |

**Cache invalidation:** None.

**Notable behavior:** Uses `demoActionGuard()`. Throws `Error("Not authenticated")` instead of returning an error object. Sets `has_onboarded`, `onboarded_at`, and `onboarding_steps_completed` on the profile.

---

## upbank.ts
**Path:** `src/app/actions/upbank.ts`

| Function | Parameters | Returns | Description |
|----------|-----------|---------|-------------|
| `registerUpWebhook` | none | `{ success: true, webhookUrl: string }` or `{ error: string }` | Registers a webhook with the UP Bank API for real-time transaction sync; stores webhook ID and secret in database |
| `deleteUpWebhook` | none | `{ success: true }` or `{ error: string }` | Deletes the registered webhook from UP Bank and clears stored credentials |
| `connectUpBank` | `plaintextToken: string` | `{ success?: boolean; error?: string }` | Validates the token against UP Bank API, encrypts it with AES-256-GCM, stores it via RPC |
| `pingWebhook` | none | `{ success: true }` or `{ error: string }` | Sends a PING event to the webhook to test connectivity |

**Cache invalidation:** `/settings/up-connection` (for register and delete).

**Notable behavior:**
- `registerUpWebhook` resolves the webhook base URL from `NEXT_PUBLIC_APP_URL`, `VERCEL_URL`, `WEBHOOK_BASE_URL`, or defaults to `localhost:3000`.
- If storing credentials fails after registration, it rolls back by deleting the webhook from UP Bank.
- `deleteUpWebhook` treats HTTP 404 as success (webhook already removed).

---

## investments.ts
**Path:** `src/app/actions/investments.ts`

| Function | Parameters | Returns | Description |
|----------|-----------|---------|-------------|
| `createInvestment` | `data: { asset_type, name, ticker_symbol?, quantity?, purchase_value_cents?, current_value_cents, notes? }` | `{ success: true, data: Investment }` or `{ error: string }` | Creates an investment with an initial history entry; auto-assigns to user's partnership |
| `updateInvestment` | `investmentId: string`, `data: { asset_type, name, ticker_symbol?, quantity?, purchase_value_cents?, current_value_cents, notes? }` | `{ success: true }` or `{ error: string }` | Updates investment properties; only adds history entry if value changed |
| `deleteInvestment` | `investmentId: string` | `{ success: true }` or `{ error: string }` | Hard-deletes an investment |
| `updateInvestmentPriceFromAPI` | `investmentId: string` | `{ success: true, price, change, source }` or `{ error: string }` | Fetches current price via CoinGecko (crypto) or Yahoo Finance (stock/ETF); updates value, history, and net worth snapshot |
| `logInvestmentContribution` | `investmentId: string`, `amountCents: number`, `contributedAt: string`, `notes?: string` | `{ success: true }` or `{ error: string }` | Records an investment contribution to the `investment_contributions` table |
| `refreshAllPrices` | none | `{ refreshed, errors[] }` or `{ error: string }` | Batch refreshes all investments with tickers: crypto via single CoinGecko call, stocks/ETFs via Yahoo Finance; updates net worth |

**Cache invalidation:** `/invest`.

**Notable behavior:**
- `createInvestment` uses `getUserPartnershipId()` to auto-create a partnership if one doesn't exist.
- `updateInvestment` compares the old `current_value_cents` with the new value and only inserts a history row when the value has actually changed.
- `updateInvestmentPriceFromAPI` requires a `ticker_symbol` on the investment. After updating, calls `upsertInvestmentNetWorth()` to keep net worth snapshots current.
- `refreshAllPrices` batches all crypto into a single CoinGecko API call. Stocks/ETFs are fetched via Yahoo Finance (free, no rate limit).

---

## watchlist.ts
**Path:** `src/app/actions/watchlist.ts`

| Function | Parameters | Returns | Description |
|----------|-----------|---------|-------------|
| `deleteWatchlistItem` | `id: string` | `{ success: true }` or `{ error: string }` | Removes a watchlist item |
| `refreshWatchlistPrice` | `id: string` | `{ success: true, price }` or `{ error: string }` | Fetches current price for a watchlist item and updates `last_price_cents` |

**Cache invalidation:** `/invest`.

**Notable behavior:** `refreshWatchlistPrice` passes `quantity=1` to get the unit price.

---

## expenses.ts
**Path:** `src/app/actions/expenses.ts`

| Function | Parameters | Returns | Description |
|----------|-----------|---------|-------------|
| `createExpenseFromTransaction` | `transactionId: string`, `options?: { customName?, category?, recurrence?, expectedAmountCents?, nextDueDate? }` | `{ success: true, expense }` or `{ success: false, error: string }` | Creates an expense definition from a transaction, creates an initial expense match, and retroactively matches all historical transactions |
| `getExpenseForTransaction` | `transactionId: string` | `{ linked: boolean, expense?: { id, name, emoji } }` | Checks if a transaction is already linked to a recurring expense |
| `deleteExpense` | `expenseId: string` | `ActionResult` | Deletes an expense definition with ownership verification; cascades to matches and split settings; cleans up transaction references |
| `getVendorTransactionHistory` | `partnershipId: string`, `vendorPattern: string` | `{ transactions: VendorTransaction[] }` or `{ transactions: [], error: string }` | Finds all debit transactions matching a vendor name pattern within a partnership |

**Exported types:** `VendorTransaction` (id, up_transaction_id, description, amount_cents, created_at, status, merchant_name, category_name).

**Cache invalidation:** None (these are primarily read/creation actions without explicit revalidation).

**Notable behavior:**
- `createExpenseFromTransaction` auto-calculates `next_due_date` based on recurrence type if not provided. It maps `'irregular'` recurrence to `'one-time'` for database constraint compatibility.
- After creating the expense definition, it imports and calls `matchExpenseToTransactions()` to retroactively match all historical transactions.
- `deleteExpense` cleans up orphaned `transaction_references` before deleting the expense definition.

---

## income-sources.ts
**Path:** `src/app/actions/income-sources.ts`

| Function | Parameters | Returns | Description |
|----------|-----------|---------|-------------|
| `createIncomeSource` | `data: IncomeSource` | `{ success: true, data: IncomeSource }` or `{ success: false, error: string }` | Creates a new income source (recurring salary or one-off) |
| `getIncomeSources` | `userId: string` | `{ success: true, data: IncomeSource[] }` or `{ success: false, error: string, data: [] }` | Gets all active income sources for a user (no demo guard -- reads allowed in demo) |
| `getManualPartnerIncomeSources` | `partnershipId: string` | `{ success: true, data: IncomeSource[] }` or `{ success: false, error: string, data: [] }` | Gets all active manual partner income sources for a partnership |
| `updateIncomeSource` | `id: string`, `data: Partial<IncomeSource>` | `{ success: true, data: IncomeSource }` or `{ success: false, error: string }` | Updates income source properties |
| `deleteIncomeSource` | `id: string` | `{ success: true }` or `{ success: false, error: string }` | Soft-deletes an income source (sets `is_active: false`) |
| `markOneOffReceived` | `id: string` | `{ success: true, data }` or `{ success: false, error: string }` | Marks a one-off income source as received with current timestamp |

**Exported types:** `IncomeSource` (id, user_id, partnership_id, name, source_type, one_off_type, amount_cents, frequency, last_pay_date, next_pay_date, expected_date, received_date, is_received, linked_transaction_id, match_pattern, notes, is_active, is_manual_partner_income).

**Cache invalidation:** None (no `revalidatePath` calls).

**Notable behavior:**
- Read operations (`getIncomeSources`, `getManualPartnerIncomeSources`) skip the demo guard since they are read-only.
- `deleteIncomeSource` is a soft delete -- it sets `is_active: false` rather than removing the row.

---

## income.ts
**Path:** `src/app/actions/income.ts`

| Function | Parameters | Returns | Description |
|----------|-----------|---------|-------------|
| `syncIncomeTagsFromUpBank` | none | `{ synced: number }` or `{ synced: 0, error: string }` | Fetches all transactions tagged `'Income'` from UP Bank and syncs the `is_income` flag locally |
| `createIncomeSourceFromTransaction` | `transactionId: string`, `mode: 'recurring' \| 'one-off'`, `options?: { customName?, oneOffType? }` | `{ success: true, incomeSource }` or `{ success: false, error: string }` | Creates an income source from a transaction; for recurring mode, analyzes pay pattern and predicts next date |

**Cache invalidation:** `/activity`, `/home`, `/settings/income`, `/analysis`.

**Notable behavior:**
- Does NOT use `demoActionGuard()` -- these actions interact directly with the UP Bank API.
- `createIncomeSourceFromTransaction` prevents duplicates by checking for an existing income source with the same `linked_up_transaction_id`.
- For recurring mode, uses `analyzeIncomePattern()` and uses `lastPayAmountCents` (not average) for the income source amount.

---

## partner.ts
**Path:** `src/app/actions/partner.ts`

| Function | Parameters | Returns | Description |
|----------|-----------|---------|-------------|
| `saveManualPartner` | `data: ManualPartnerData` | `{ success: true }` or `{ success: false, error: string }` | Saves or updates manual partner data on the user's partnership (name, DOB, retirement age, super balance, contribution rate) |
| `removeManualPartner` | none | `{ success: true }` or `{ success: false, error: string }` | Clears manual partner data from partnership and soft-deletes their income sources |
| `getManualPartnerInfo` | none | `{ success: true, data: ManualPartnerData \| null }` or `{ success: false, error: string }` | Gets manual partner info; returns null if no manual partner configured |

**Exported types:** `ManualPartnerData` (name, date_of_birth?, target_retirement_age?, super_balance_cents?, super_contribution_rate?).

**Cache invalidation:** `/settings/partner`, `/settings/income`, `/budget`, `/plan` (for mutations).

**Notable behavior:**
- Uses `demoActionGuard()` for mutations (`saveManualPartner`, `removeManualPartner`).
- `getManualPartnerInfo` is read-only and has no demo guard.
- `removeManualPartner` also soft-deletes all income sources where `is_manual_partner_income = true` for the partnership.

---

## fire.ts
**Path:** `src/app/actions/fire.ts`

| Function | Parameters | Returns | Description |
|----------|-----------|---------|-------------|
| `updateFireProfile` | `data: { date_of_birth, target_retirement_age, super_balance_cents, super_contribution_rate, expected_return_rate, outside_super_return_rate, income_growth_rate, spending_growth_rate, fire_variant, annual_expense_override_cents }` | `{ success: true }` or `{ error: string }` | Updates FIRE profile parameters and sets `fire_onboarded: true` |

**FIRE variant options:** `'lean'`, `'regular'`, `'fat'`, `'coast'`.

**Cache invalidation:** `/plan`, `/settings/fire`.

**Notable behavior:** `updateFireProfile` automatically sets `fire_onboarded: true` on every update. Includes growth rate fields (`income_growth_rate`, `spending_growth_rate`) and an optional separate return rate for outside-super investments (`outside_super_return_rate`).

---

## budgets.ts
**Path:** `src/app/actions/budgets.ts`

| Function | Parameters | Returns | Description |
|----------|-----------|---------|-------------|
| `getBudgets` | `partnershipId: string` | `{ data: UserBudget[], error: null }` or `{ data: [], error: string }` | Fetches all active budgets for a partnership, sorted with defaults first |
| `createBudget` | `input: CreateBudgetInput` | `{ data: UserBudget, error: null }` or `{ data: null, error: string }` | Creates a new budget with seeded assignments (subcategories, goals, investments) and optional initial layout. Rolls back on seed failure. |
| `updateBudget` | `budgetId: string`, `updates: Partial<Pick<UserBudget, 'name' \| 'emoji' \| 'methodology' \| 'budget_view' \| 'period_type' \| 'category_filter' \| 'color'>>` | `{ data: UserBudget, error: null }` or `{ data: null, error: string }` | Updates budget properties; regenerates slug when name changes |
| `deleteBudget` | `budgetId: string` | `{ error: null }` or `{ error: string }` | Soft-deletes a budget (sets is_active: false, is_default: false) |
| `setDefaultBudget` | `budgetId: string`, `partnershipId: string` | `{ error: null }` or `{ error: string }` | Sets a budget as the default, clearing the previous default |
| `duplicateBudget` | `budgetId: string`, `newName: string` | `{ data: UserBudget, error: null }` or `{ data: null, error: string }` | Duplicates a budget with its current month assignments |

**Exported types:** `UserBudget` (id, partnership_id, name, slug, emoji, budget_type, methodology, budget_view, period_type, is_active, is_default, color, template_source, category_filter, carryover_mode, total_budget, start_date, end_date, created_by, created_at, updated_at), `CreateBudgetInput`.

**Cache invalidation:** `/budget`.

**Notable behavior:**
- `createBudget` auto-makes the first budget the default. It generates a unique slug from the name. On creation, it seeds the budget with $0 assignment rows for all subcategories within included parent categories, plus rows for active savings goals and investments.
- `deleteBudget` is a soft delete (sets `is_active: false`), not a hard delete.
- `duplicateBudget` copies assignments from the current month to the new budget.

---

## checkup.ts
**Path:** `src/app/actions/checkup.ts`

| Function | Parameters | Returns | Description |
|----------|-----------|---------|-------------|
| `startOrResumeCheckup` | `financialYear?: number` | `AnnualCheckup` | Starts a new annual financial checkup or resumes an existing one for the given financial year (defaults to current Australian FY) |
| `saveCheckupStep` | `financialYear: number`, `step: number`, `stepData: Record<string, unknown>` | `void` (throws on error) | Saves data for a specific checkup step; advances current_step to the next step |
| `completeCheckup` | `financialYear: number`, `actionItems: { text, priority, done }[]` | `void` (throws on error) | Marks a checkup as completed with action items and timestamp |
| `resetCheckup` | `financialYear: number` | `void` (throws on error) | Deletes a checkup record to allow starting fresh |

**Cache invalidation:** `/plan`.

**Notable behavior:**
- Uses Australian Financial Year convention (July 1 to June 30). FY2026 = Jul 2025 - Jun 2026.
- Uses `getUserPartnershipId()` to scope checkups to the user's partnership.
- All mutation functions throw `Error` on failure rather than returning structured error objects.

---

## Common Patterns

### Demo Guard
Most mutation actions call `demoActionGuard()`:
```typescript
const blocked = demoActionGuard(); if (blocked) return blocked;
```
Exceptions:
- `income.ts` -- does not use any demo guard (directly calls UP Bank API).
- Read-only functions in `income-sources.ts` (`getIncomeSources`, `getManualPartnerIncomeSources`) and `partner.ts` (`getManualPartnerInfo`) skip the guard.

### Cache Invalidation
After mutations, actions call `revalidatePath()` for affected routes:
```typescript
revalidatePath("/budget");
revalidatePath("/home");
revalidatePath("/goals");
```
Some action files (notably `income-sources.ts`) do not call `revalidatePath` at all.

### Error Handling
Actions use two patterns:

**Structured result pattern** (most actions):
```typescript
return { success: false, error: "Description" };
// or
return { success: true, data: result };
```

**Void/throw pattern** (`onboarding.ts`, `checkup.ts`):
```typescript
// Throws Error on auth failure (onboarding.ts, checkup.ts)
```

### Authentication
All actions authenticate via Supabase:
```typescript
const supabase = await createClient();
const { data: { user } } = await supabase.auth.getUser();
if (!user) return { error: "Not authenticated" };
```

### Partnership Resolution
Actions that need the user's partnership use one of:
- `partnership_members` table lookup (most actions)
- `getUserPartnershipId()` helper (investments.ts, budgets.ts, checkup.ts -- auto-creates if missing)
