# Budget System

## 1. Overview

PiggyBack's budget system lets users create budgets with flexible methodologies, period types, and partner split configurations. All budget math is handled by a **pure calculation engine** on the server — the client displays results and sends mutations.

### Key Concepts

- **Methodologies**: Zero-based, 50/30/20, 80/20, Pay Yourself First, Envelope
- **Period types**: Weekly (month-aligned: 1-7, 8-14, 15-21, 22-end), Fortnightly (1-14, 15-end), Monthly
- **Views**: "My Budget" (individual — user's accounts only) and "Our Budget" (shared — all partnership accounts with JOINT dedup)
- **TBB (To Be Budgeted)**: `Income + Carryover - Budgeted` — the core zero-based metric

---

## 2. Architecture

```
page.tsx (Server Component)
  │
  ├── Fetches budget record, expenses, category mappings, initial summary
  │
  └── Renders BudgetProvider + BudgetPageShell
        │
        BudgetProvider (contexts/budget-context.tsx)
        │   Holds: budget, summary, currentDate, isLoading
        │   Actions: navigatePeriod, setDate, assignAmount, updateSettings, refresh
        │
        └── Calls: GET /api/budget/summary?budget_id=xxx&date=yyy
              │
              ├── 10 parallel Supabase queries
              ├── 2 sequential follow-up queries (goal transfers, investment contributions)
              ├── Maps data to engine input types
              ├── Calls calculateBudgetSummary() from budget-engine
              ├── Annotates rows with icons, names, metadata
              └── Returns BudgetSummaryResponse
```

Data flows **one direction**: page.tsx → BudgetProvider → /api/budget/summary → budget-engine → response → UI.

Mutations (assign, settings changes) go through API routes, then the provider re-fetches the summary.

---

## 3. Budget Engine (`src/lib/budget-engine.ts`)

### Design

- **Pure functions** — no database access, no side effects, no imports from Supabase
- All data passed in via `BudgetSummaryInput`, all results returned as `BudgetSummary`
- ~1030 lines, 12 exported functions, 18 exported types
- Tested with 75 unit tests in `budget-engine.test.ts` (plus additional tests across `budget-zero-calculations.test.ts`, `budget-expense-defaults.test.ts`, `budget-period-helpers.test.ts`, and `shared-budget-calculations.test.ts`)

### Calculation Pipeline

`calculateBudgetSummary()` orchestrates 7 steps:

1. **Income** — sum income sources converted to target period, or use `totalBudget` override
2. **Budgeted** — sum manual assignments + expense defaults for unassigned subcategories
3. **Spent** — group transactions by `Parent::Child` subcategory key, apply split adjustments
4. **Carryover** — read from `budget_months` table (stored per-period)
5. **TBB** — `income + carryover - budgeted`
6. **Total spent** — sum of all spent map values + goal contributions + asset contributions
7. **Row building** — the 8-layer waterfall (see below)

### Row Building Waterfall

Rows are built in priority order. Each layer only creates rows for items not already in the map:

| Layer | Source | What it creates |
|-------|--------|----------------|
| 1 | Assignments (subcategory) | Manual amounts, or `$0` assignments that defer to expense defaults |
| 2 | Assignments (goal) | Goal rows with real name resolution via `goalLookup` |
| 3 | Assignments (asset) | Asset rows with real name resolution via `assetLookup` |
| 4 | `input.goals` | Default rows for goals with no assignment this period (budgeted=0) |
| 5 | `input.assets` | Default rows for assets with no assignment this period (budgeted=0) |
| 6 | `expenseDefaultLookup` | Subcategories with a matching expense definition but no assignment |
| 7 | `spentMap` | Unplanned spending — transactions with no assignment or expense default |
| 8 | `layoutSubcategoryKeys` | Layout placeholders — subcategories in the layout config with no data |

Layers 4-5 ensure goals/assets always appear (even in months with no assignment). Layer 8 ensures layout-referenced subcategories always have a row.

### Expense Default Lookup

The `expenseDefaultLookup` maps `"Parent::Child"` → `{ amount, expense }`:

- Multiple expense definitions can map to the same subcategory — their amounts are **summed**
- Manual assignments take precedence: if a subcategory has `assigned_cents > 0`, it's excluded
- When an assignment exists with `assigned_cents === 0`, the expense default takes over (`isExpenseDefault: true`)
- Amounts are calculated using `countOccurrencesInPeriod` (anchor-based) or `convertToTargetPeriod` (fallback)

### `countOccurrencesInPeriod` — Anchor-Based Counting

Uses `next_due_date` as an anchor to project occurrence dates into a period window:

- **Weekly/fortnightly**: steps the anchor backward/forward in fixed intervals to find the first occurrence >= `periodStart`, then counts forward until `periodEnd`
- **Monthly/quarterly/yearly**: uses month-based arithmetic to snap to the recurrence grid, then iterates month intervals
- **One-time**: checks if the anchor falls within the period
- Returns a count (multiply by `expected_amount_cents` for the total budgeted amount)

### Period Navigation

Periods are **month-aligned** (not rolling):
- Weekly: 1-7, 8-14, 15-21, 22-end
- Fortnightly: 1-14, 15-end
- Monthly: 1st to last day

`getNextPeriodDate` / `getPreviousPeriodDate` return the start date of the adjacent period. `getMonthKeyForPeriod` returns `YYYY-MM-01` for assignment storage.

---

## 4. Summary API (`/api/budget/summary`)

**`GET /api/budget/summary?budget_id=xxx&date=2026-02-15`**

Single endpoint that replaces the 21+ parallel queries previously done in `page.tsx`.

### 10 Parallel Supabase Queries + 2 Sequential Follow-ups

| # | Table | Purpose |
|---|-------|---------|
| 1 | `income_sources` | Active income for the partnership |
| 2 | `budget_assignments` | Manual amounts for this budget + month + view |
| 3 | `transactions` | Expenses in period for effective accounts |
| 4 | `expense_definitions` | With nested `expense_matches→transactions` for category inference |
| 5 | `couple_split_settings` | Split configuration for individual view adjustments |
| 6 | `category_mappings` | UP Bank `category_id` → display parent/child names + icons |
| 7 | `budget_months` | Carryover from previous period |
| 8 | `budget_layout_presets` | Active layout config for methodology sections |
| 9 | `savings_goals` | Goal names, icons, targets, linked_account_id for goal rows |
| 10 | `investments` | Asset names, types, values for asset rows |

After the parallel batch, two sequential queries fetch contribution data:

| # | Table | Purpose |
|---|-------|---------|
| 11 | `transactions` (internal transfers) | Goal contributions — transfers to goal-linked saver accounts in the period |
| 12 | `investment_contributions` | Asset contributions — manual investment contribution records in the period |

These populate `goalContributions` and `assetContributions` Maps passed to the engine, which uses them for goal/asset row `spent` values and includes them in the total `spent` figure.

### Expense Subcategory Inference

Expense definitions don't have a direct category. The subcategory is **inferred from matched transactions**:

1. For each expense, collect `category_id` values from all matched transactions
2. Count occurrences of each `category_id`
3. Pick the most common one (majority vote)
4. Look up parent/child names from `category_mappings`

This "most-common-category" heuristic handles expenses that match across multiple categories.

### PostgREST Relation Gotchas

Two places where Supabase PostgREST returns unexpected shapes:

1. **`expense_matches` on transactions**: FK has a unique constraint → PostgREST returns a single **object** (not array). Code uses `Array.isArray()` to handle both shapes.
2. **`transactions` inside `expense_matches`**: each match has exactly one transaction (many-to-one FK) → returns an object, not an array.

### Post-Processing Annotation

After the engine returns rows, the route enriches them with display metadata:

- **Goal rows**: real name, icon, target amount, current amount
- **Asset rows**: real name, asset type, current value
- **Subcategory rows**: icon from `category_mappings` (child name → icon), parent icon

### Layout Subcategory Key Extraction

Layout config stores drag IDs like `"subcategory-Parent::Child"`. The route:

1. Collects all `itemIds` from layout sections + `hiddenItemIds`
2. Strips the `"subcategory-"` prefix to get `"Parent::Child"` keys
3. Passes these as `layoutSubcategoryKeys` to the engine
4. Engine creates placeholder rows for any that don't already exist

---

## 5. Budget Context (`src/contexts/budget-context.tsx`)

### Design

- **Lean provider** — no client-side caching, no local calculations
- Replaces the old `BudgetZeroProvider` which cached data and ran math in the browser
- Every navigation or mutation triggers a fresh fetch from `/api/budget/summary`

### State

| Field | Type | Description |
|-------|------|-------------|
| `budget` | `UserBudget` | The budget record (name, methodology, view, period type, etc.) |
| `summary` | `BudgetSummaryResponse` | Latest engine output (income, budgeted, spent, tbb, rows, etc.) |
| `currentDate` | `Date` | Date within the currently displayed period |
| `isLoading` | `boolean` | Whether a fetch is in progress |

### Actions

| Action | What it does |
|--------|-------------|
| `navigatePeriod("next" \| "prev")` | Computes next/prev period start date, fetches new summary |
| `setDate(date)` | Jumps to a specific date's period |
| `assignAmount(params)` | POSTs to `/api/budget/zero/assign`, then refreshes |
| `updateSettings(changes)` | Calls `updateBudget` server action, then refreshes |
| `refresh()` | Re-fetches summary for the current date |

### Stale-Response Prevention

`fetchIdRef` is a monotonically increasing counter. Each fetch increments it and captures the current value. When the response arrives, it's only applied if the captured ID matches the current ref — otherwise a newer request has been fired and this response is discarded.

### Stale-Closure Avoidance

`budgetRef` and `currentDateRef` mirror the latest state values. Callbacks created via `useCallback` capture closures at creation time. Without refs, `navigatePeriod` would read the date from when the callback was created, not the latest date. The refs ensure callbacks always access current values.

---

## 6. Budget Page Shell (`src/components/budget/budget-page-shell.tsx`)

### Two-Component Pattern

- **`BudgetPageShell`** (outer): wraps children in `BudgetSharingProvider` for couple split state
- **`BudgetPageShellContent`** (inner): consumes contexts and renders the tab UI

This split is necessary because a component can't both provide and consume the same context.

### Engine → UI Row Mapping

`mapEngineRowsToUI()` translates engine `BudgetRow` → UI `BudgetRow`:

| Engine field | UI field |
|-------------|----------|
| `budgeted` | `assigned` |
| `spent` | `spent` |
| `id` ("Parent::Child") | `id` (same), `name` (child portion only) |
| `id` ("goal::uuid") | `id` (uuid only) |
| `type` | `type` (same) |

Only subcategory, goal, and asset rows are emitted. Parent category rows are not needed — the layout system handles grouping.

### Expense Split Enrichment (`viewAdjustedExpenses`)

In "individual" budget view, recurring expense amounts are adjusted by the user's split percentage:

- Uses `expenseSplits` from `BudgetSharingProvider` (key format: `expense:{id}`)
- Scales `expected_amount_cents` by the percentage
- Preserves `original_amount_cents` for reference

### Period-Aware Expense Matching (`periodAwareExpenses`)

`is_matched` from SSR reflects the initial page load period. When the user navigates to a different period, it becomes stale. This memo recalculates `is_matched` client-side using `hasPaymentInPeriod()` with the current period boundaries.

---

## 7. Detail Panel (`src/components/budget/budget-detail-panel.tsx`)

Side panel (desktop) / bottom sheet (mobile) showing details for a selected budget item.

### Expected Bills Calculation

For each expense linked to the selected item:

1. **Window expansion** (`getEffectiveWindow`): for sub-monthly budgets (weekly/fortnightly), monthly+ expenses need the evaluation window expanded to the full calendar month. Without this, a fortnightly budget would show 0 expected payments for a monthly bill due outside the fortnight.

2. **Expected count** (`getExpectedPaymentsInPeriod`): delegates to `countOccurrencesInPeriod` from the budget engine using the expense's `next_due_date`. This ensures the Expected Bills card matches the engine's AUTO budget calculation exactly. Falls back to a simple heuristic for expenses without a due date.

3. **Matched count** (`getMatchedPaymentsInPeriod`): counts matched transactions within the period using `settled_at` (preferred) or `created_at`.

4. **Display**: shows "All bills paid" when `matched >= expected`, otherwise lists individual unpaid bills with remaining amounts.

### Transaction Fetching

Fetches transactions from `/api/budget/row-transactions` filtered by item type, name, period, and partnership. Subcategories include `parent_category` for disambiguation.

### Transaction Split Display

In individual view, `transactionSplitMap` pre-computes per-transaction split percentages from expense match data. Displayed as a percentage badge on each transaction row.

---

## 8. Layout System

### Storage

Layouts are stored in `budget_layout_presets` with a `layout_config` JSON column containing:

```typescript
interface LayoutConfig {
  sections: Section[];      // Named groups of items with optional percentage targets
  columns: Column[];        // Visible columns (built-in + custom formula)
  density: 'compact' | 'comfortable' | 'spacious';
  groupBy: 'none' | 'methodology' | 'sections';
  hiddenItemIds: string[];  // Items hidden from the budget view
}
```

### Drag IDs

Items are identified by prefixed IDs:
- Subcategories: `"subcategory-Parent::Child"`
- Goals: `"goal-{uuid}"`
- Assets: `"asset-{uuid}"`

These are used for drag-and-drop reordering within and across sections.

### Methodology Sections

For percentage-based methodologies (50/30/20, 80/20, Pay Yourself First), sections have a `percentage` field. The engine calculates `target = income * percentage / 100` and returns `MethodologySection` objects with target vs actual budgeted/spent.

### Custom Formula Columns

Users can add calculated columns with formulas like `{assigned} - {spent}`. Formulas support placeholders (`{assigned}`, `{spent}`, `{income}`, `{target}`, etc.), arithmetic operators, and functions (`MAX`, `MIN`, `ROUND`, `ABS`, `FLOOR`, `CEIL`, `DAYS_REMAINING`). Evaluated safely via `src/lib/formula-evaluator.ts`.

---

## 9. Expense Defaults (AUTO Amounts)

Recurring expenses auto-populate budget amounts when no manual assignment exists.

### How it Works

1. Expense definitions are stored in `expense_definitions` with `expected_amount_cents`, `recurrence_type`, and `next_due_date`
2. The summary route **infers** each expense's subcategory from its matched transactions (most-common-category)
3. The engine builds an `expenseDefaultLookup` mapping `"Parent::Child"` → amount
4. If a subcategory has no manual assignment (or has a `$0` assignment), the expense default amount is used
5. Amount is calculated via `countOccurrencesInPeriod` × `expected_amount_cents`

### Precedence

Manual assignment (`assigned_cents > 0`) **always** takes precedence over expense defaults. The `isExpenseDefault` flag on rows indicates whether the budgeted amount came from an expense definition vs a manual assignment.

### Individual View Adjustment

In "individual" budget view, expense default amounts are scaled by the user's split percentage from `couple_split_settings`.

---

## 10. Partner Splits

### Two Budget Views

- **Individual ("My Budget")**: shows only the user's accounts. Shared expenses are scaled by the user's split percentage.
- **Shared ("Our Budget")**: shows all partnership accounts with JOINT dedup (earliest `user_id` alphabetically wins).

### Split Resolution Cascade

The engine's `resolveSplitPercentage()` determines what percentage a user pays:

| Split Type | Owner Percentage | Partner Percentage |
|-----------|-----------------|-------------------|
| `equal` | 50% | 50% |
| `custom` | `owner_percentage` | `100 - owner_percentage` |
| `individual-owner` | 100% | 0% |
| `individual-partner` | 0% | 100% |

### Where Splits Apply

1. **Budgeted amounts**: expense defaults in individual view are scaled by split percentage
2. **Spent amounts**: transactions in individual view are scaled by split percentage (with per-transaction override support)
3. **Expected Bills**: expense amounts in the detail panel are scaled via `viewAdjustedExpenses`

### Split Priority (for transactions)

1. Per-transaction `split_override_percentage` (highest priority)
2. Expense-level split (via `matched_expense_id` → `couple_split_settings`)
3. Category-level split (via parent category name → `couple_split_settings`)
4. Default: 100% (personal expense, no split)

---

## Key Files

| File | Purpose |
|------|---------|
| `src/lib/budget-engine.ts` | Pure calculation engine — all budget math |
| `src/app/api/budget/summary/route.ts` | Summary API — fetches data, runs engine, annotates rows |
| `src/contexts/budget-context.tsx` | Client state provider — holds summary, dispatches actions |
| `src/components/budget/budget-page-shell.tsx` | Main UI shell — maps engine rows to UI, renders tabs |
| `src/components/budget/budget-detail-panel.tsx` | Item detail panel — Expected Bills, transactions |
| `src/components/budget/unified-budget-table.tsx` | Budget table with layout support |
| `src/lib/budget-row-types.ts` | Canonical BudgetRow discriminated union types + type guards |
| `src/lib/layout-persistence.ts` | Layout CRUD helpers |
| `src/lib/formula-evaluator.ts` | Custom column formula evaluation |
| `src/lib/expense-projections.ts` | Expense timeline and payment projections |
| `src/app/(app)/budget/page.tsx` | Server component — initial data fetch + SSR |
