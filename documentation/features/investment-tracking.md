# Investment Tracking System

## Overview
PiggyBack includes a comprehensive investment portfolio tracker supporting stocks, ETFs, cryptocurrency, property, and other asset types. The system features real-time price fetching, portfolio analytics, cross-app integration (FIRE planning, budget, net worth), and a watchlist for tracking unowned assets.

## Supported Asset Types
- **Stock** — Individual company shares (Yahoo Finance API for pricing, auto-tries `.AX` suffix for ASX)
- **ETF** — Exchange-traded funds (Yahoo Finance API)
- **Crypto** — Cryptocurrencies (CoinGecko API, free, no key needed)
- **Property** — Real estate holdings (manual value entry only)
- **Other** — Catch-all for alternative investments

## Database Tables

### `investments`
Core table for portfolio holdings.
- `id`, `partnership_id` FK, `asset_type`, `name`, `ticker_symbol`, `quantity`, `purchase_value_cents`, `current_value_cents`, `notes`, `created_at`, `updated_at`
- RLS: Via `partnership_members`

### `investment_history`
Price history for chart data and performance tracking.
- `id`, `investment_id` FK, `value_cents`, `recorded_at`
- Composite index on `(investment_id, recorded_at)` for efficient time-range queries
- New entry created on: investment creation, manual edit (if value changed), API price refresh

### `investment_contributions`
Records of contributions/purchases made to investments, used by the budget engine to track investment spending.
- `id`, `investment_id` FK, `partnership_id` FK, `amount_cents`, `contributed_at`, `notes`, `created_at`
- Referenced by the budget engine (`budget-engine.ts`) and budget summary API to calculate investment spending within budget periods

### `target_allocations`
Desired allocation percentages per asset type.
- `id`, `partnership_id` FK, `asset_type`, `target_percentage` (decimal)
- Unique on `(partnership_id, asset_type)`
- Must sum to 100%

### `watchlist_items`
Investments tracked but not owned.
- `id`, `partnership_id` FK, `asset_type`, `name`, `ticker_symbol`, `notes`, `last_price_cents`, `last_price_updated_at`

### Related columns in other tables
- `net_worth_snapshots.investment_total_cents` — Sum of all investment values, updated on price refresh

## Price APIs

### CoinGecko (Crypto)
- **Free**: No API key required, 10,000+ cryptocurrencies
- **Batch support**: `fetchMultipleCryptoPrices()` sends one API call for all crypto assets
- **Cache**: 5-minute revalidation via Next.js `next: { revalidate: 300 }`
- **Symbol mapping**: Common tickers (BTC, ETH, SOL, etc.) mapped to CoinGecko IDs
- **File**: `src/lib/price-apis.ts`

### Yahoo Finance (Stocks/ETFs)
- **Free**: No API key required, excellent ASX coverage (VDHG, CBA, etc.)
- **ASX support**: Automatically tries `.AX` suffix for Australian stocks
- **Cache**: 1-hour revalidation via Next.js `next: { revalidate: 3600 }`
- **API**: Yahoo Finance v8 chart endpoint

### Refresh Strategies
1. **Individual refresh**: Click refresh icon on a holding row -> `updateInvestmentPriceFromAPI()`
2. **Refresh All**: Header button -> `refreshAllPrices()` — batches crypto into single CoinGecko call, fetches stocks/ETFs via Yahoo Finance
3. **No automatic refresh**: All refreshes are user-initiated (no cron)

## Server Actions

### `src/app/actions/investments.ts`
- `createInvestment(data)` — Creates investment + initial history entry
- `updateInvestment(id, data)` — Updates fields, adds history if value changed
- `deleteInvestment(id)` — Deletes investment (cascades history via FK)
- `updateInvestmentPriceFromAPI(id)` — Fetches price via API, updates value + history + net worth
- `logInvestmentContribution(investmentId, amountCents, contributedAt, notes?)` — Logs a contribution to the `investment_contributions` table (validates investment belongs to user's partnership)
- `refreshAllPrices()` — Batch refresh: crypto via CoinGecko, stocks via Yahoo Finance, updates net worth

### `src/app/actions/watchlist.ts`
- `deleteWatchlistItem(id)` — Remove from watchlist
- `refreshWatchlistPrice(id)` — Fetch current price for watchlist item

## Portfolio Aggregation Library

**File**: `src/lib/portfolio-aggregation.ts` (pure functions, no side effects)

### `aggregatePortfolioHistory(investments, historyRecords, startDate, endDate)`
- Groups history records by date (truncated to day)
- Forward-fills the latest known value per investment for missing dates
- Returns `{date, valueCents}[]` for the portfolio chart

### `calculatePerformanceMetrics(investments)`
- Total ROI %, Total Gain $
- Best/worst performer by gain %

### `calculateTopMovers(investments)`
- Top 3 gainers and losers by gain %

### `calculateRebalancing(currentAllocation[], targetAllocation[], totalValue)`
- Per-type delta: overweight/underweight, $ amount to rebalance
- Only shown when target allocations are set

### `getStartDateForPeriod(period, now)`
- Maps period strings (1W, 1M, 3M, 6M, 1Y, ALL) to start dates

## Net Worth Integration

**File**: `src/lib/net-worth-helpers.ts`

- `upsertInvestmentNetWorth(supabase, partnershipId)` — Sums all investment values for the partnership and upserts today's `net_worth_snapshots.investment_total_cents`
- Called after: individual price refresh, batch refresh
- Carries forward the most recent `total_balance_cents` and `account_breakdown` from bank data if creating a new snapshot

The dashboard net worth chart (`/home`) displays `total_balance_cents + investment_total_cents` as true net worth.

## Page Architecture

### Main Page: `/invest`
- **Server component**: `src/app/(app)/invest/page.tsx`
  - Fetches investments, history, target allocations, budget assignments, FIRE profile, watchlist, dividend transactions in parallel
  - Computes portfolio history, performance metrics, top movers, rebalancing deltas, FIRE progress, budget contributions, monthly dividends
  - Empty state if no investments
- **Client component**: `src/components/invest/invest-client.tsx`
  - 2-column dashboard layout (3-col grid, left=2, right=1)
  - **Left column**: Portfolio value chart (AreaChart), Holdings table, Performance + Movers side-by-side, Investment Income bar chart, Rebalancing
  - **Right column**: Allocation donut (SVG), FIRE progress card, Budget contributions card, Watchlist (collapsible)
  - Header: "Investing" title + asset count + Refresh All + Add Asset buttons
  - Quick stats strip: Cost Basis, Unrealized P&L, Annual Income, Diversity

### Detail Page: `/invest/[id]`
- **Server component**: `src/app/(app)/invest/[id]/page.tsx`
  - Fetches investment, price history, portfolio total for weight calculation
  - Calculates annualized return
- **Client component**: `src/components/invest/invest-detail-client.tsx`
  - 2-column layout: chart (left, 260px AreaChart with period pills) + stats sidebar (right)
  - Stats: Purchase Cost, Quantity, Portfolio Weight, Return, Days Held, Last Updated
  - Notes section (if present)

### Add Page: `/invest/add`
- Client-side form page (`"use client"`)
- Fields: Asset Type (select), Name, Ticker Symbol, Quantity, Purchase Value, Current Value, Notes
- Calls `createInvestment()` server action

### Edit Page: `/invest/[id]/edit`
- Server component fetches investment, passes to client form
- **Client component**: `src/components/invest/invest-edit-client.tsx`
  - Same fields as add + Save, Delete, Cancel buttons
  - Calls `updateInvestment()` or `deleteInvestment()`

## Charts & Visualization

### Portfolio Value Chart
- Recharts `AreaChart` with gradient fill
- Period selector pills: 1W, 1M, 3M, 6M, 1Y, ALL (via `?period` searchParam)
- Green gradient for positive periods, coral for negative
- Period change footer showing $ and % change

### Allocation Donut
- Pure SVG implementation (zero dependencies)
- `stroke-dasharray` technique on `<circle>` elements
- 120px diameter, 22px stroke width
- Legend with color dots, labels, percentages, and dollar amounts
- Uses hex color fallbacks (`ASSET_HEX` map) since CSS variables don't work in SVG `stroke` attributes

### Investment Income Bar Chart
- Recharts `BarChart`, 120px height
- Monthly investment income over last 12 months
- Shows annual total and monthly average

### Detail Page Chart
- Recharts `AreaChart`, 260px height
- Individual investment price history with period selector

## Color Scheme
```
stock:    var(--pastel-blue)    / #7BA4D9
etf:      var(--pastel-purple)  / #B08BD9
crypto:   var(--pastel-yellow)  / #E8D44D
property: var(--pastel-mint)    / #6CC4A1
other:    var(--pastel-coral)   / #E88B8B
```

## Cross-App Integration

### FIRE Progress
- Shows if `fire_onboarded` is true in user profile
- Progress = `(investmentTotal + superBalance) / fireNumber * 100`
- Links to `/plan`

### Budget Contributions
- Queries `budget_assignments` where `assignment_type='asset'` for current month
- Shows total allocated to investments from budget
- Links to `/budget`

### Net Worth (Dashboard)
- Investment total included in net worth snapshots
- Dashboard chart at `/home` shows combined bank + investment net worth

### Dividend Income
- Queries `transactions` where `income_type='investment'` for last 12 months
- Monthly bar chart + annual total + monthly average

## File Reference

| File | Purpose |
|------|---------|
| `src/app/(app)/invest/page.tsx` | Main page server component |
| `src/app/(app)/invest/loading.tsx` | Skeleton loading state |
| `src/app/(app)/invest/[id]/page.tsx` | Detail page server component |
| `src/app/(app)/invest/[id]/loading.tsx` | Detail page skeleton |
| `src/app/(app)/invest/[id]/edit/page.tsx` | Edit page server component |
| `src/app/(app)/invest/[id]/edit/loading.tsx` | Edit page skeleton |
| `src/app/(app)/invest/add/page.tsx` | Add investment client form |
| `src/components/invest/invest-client.tsx` | Main dashboard client component |
| `src/components/invest/invest-detail-client.tsx` | Detail page client component |
| `src/components/invest/invest-edit-client.tsx` | Edit form client component |
| `src/app/actions/investments.ts` | Investment CRUD + price refresh + contribution logging actions |
| `src/app/actions/watchlist.ts` | Watchlist delete + price refresh actions |
| `src/lib/portfolio-aggregation.ts` | Pure aggregation/analytics functions |
| `src/lib/price-apis.ts` | CoinGecko + Yahoo Finance API clients |
| `src/lib/net-worth-helpers.ts` | Net worth snapshot upsert helper |
| `src/lib/invest-calculations.ts` | Portfolio totals, allocation, dividends, returns |
| `src/lib/__tests__/portfolio-aggregation.test.ts` | Aggregation unit tests |
| `src/lib/__tests__/price-apis.test.ts` | Price API unit tests |
| `src/lib/__tests__/invest-calculations.test.ts` | Investment calculation unit tests |
