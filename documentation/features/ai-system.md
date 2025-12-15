# AI Integration

## Overview
PiggyBack integrates with multiple AI providers for transaction categorization and a financial chat assistant ("Piggy Chat"). Users bring their own API keys (BYOK model) -- no API keys are stored by the application itself; they live per-user in the `profiles` table.

## Supported Providers
Configured via Settings > AI Assistant. Provider, API key, and model stored per-user in the `profiles` table (`ai_provider`, `ai_api_key`, `ai_model` columns).

| Provider | SDK Package | Default Model |
|----------|------------|---------------|
| Google Gemini | `@ai-sdk/google` | `gemini-2.0-flash` |
| OpenAI GPT | `@ai-sdk/openai` | `gpt-4o-mini` |
| Anthropic Claude | `@ai-sdk/anthropic` | `claude-sonnet-4-5-20250929` |

All three providers are used identically through the Vercel AI SDK abstraction layer, meaning any provider can power both the chat assistant and the auto-categorization pipeline.

---

## AI Chat (Piggy Chat)

### Architecture

The chat system has three layers:

1. **Context Building** (`/api/ai/context`) -- pre-loads a financial snapshot for the UI
2. **Chat Endpoint** (`/api/ai/chat`) -- streaming multi-step tool-calling conversation
3. **Client UI** (`src/components/ai/piggy-chat.tsx`) -- React chat interface with tool status indicators

### Context Building System (`/api/ai/context`)

The `/api/ai/context` GET endpoint builds a plaintext financial snapshot sent to the client on page load. This context is displayed in the chat UI as orientation text and is NOT injected into the LLM system prompt (the LLM uses tools instead). The context endpoint fetches:

| Data | Source Table | Details |
|------|-------------|---------|
| Account balances | `accounts` | All active accounts for the user, summed into total balance |
| Current month income | `transactions` | Positive-amount, non-transfer transactions this month |
| Current month spending | `transactions` | Negative-amount, non-transfer, non-income transactions this month |
| Last month spending | `transactions` | Same criteria for prior month, used for month-over-month comparison |
| Spending by category | `transactions` + `category_mappings` | Top 8 categories by spend, mapped to display names via `category_mappings` |
| Recent transactions | `transactions` | Last 15 transactions this month with description, amount, category |
| Upcoming bills | `expense_definitions` | Active bills due in the next 14 days (partnership-scoped) |
| Savings goals | `savings_goals` | Incomplete goals with current/target amounts and deadlines (partnership-scoped) |

The endpoint also returns `hasApiKey: boolean` so the UI can show a setup prompt if the user hasn't configured an AI provider yet.

### Chat Endpoint (`/api/ai/chat`)

**Route:** `POST /api/ai/chat`

**Request body:** `{ messages: UIMessage[] }` -- the full conversation history including tool call/result parts.

**Rate limiting:** 10 requests per minute per user. Exceeding this limit returns HTTP 429 (Too Many Requests).

**Flow:**
1. Authenticate user via Supabase session
2. Load AI settings from `profiles` table (provider, API key, model)
3. Return 400 if no API key configured
4. Initialize the chosen AI provider via the corresponding `@ai-sdk/*` package
5. Wrap the model with `addToolInputExamplesMiddleware()` to serialize `inputExamples` into tool descriptions for providers that don't natively support them
6. Fetch user's active `accountIds` and `partnershipId` for tool scoping
7. Create the 35 financial tools via `createFinancialTools()`
8. Convert UI messages to model messages via `convertToModelMessages()`
9. Call `streamText()` with tools, system prompt, and step configuration
10. Return the stream as a `UIMessageStreamResponse`

### Streaming Implementation

The chat uses the Vercel AI SDK's `streamText()` function, which returns a server-sent event (SSE) stream. The response is converted to a UI message stream via `result.toUIMessageStreamResponse()`.

**Client-side:** The `piggy-chat.tsx` component uses the `useChat()` hook from `@ai-sdk/react` with a `DefaultChatTransport` pointed at `/api/ai/chat`. This hook manages:
- Message state (user + assistant messages with tool call parts)
- Streaming text display (tokens appear as they arrive)
- Tool invocation status indicators (shown during multi-step execution)
- Automatic conversation history management

**Multi-step execution:** The `stopWhen: stepCountIs(15)` configuration allows the model to make up to 15 sequential tool calls in a single response. The `prepareStep` callback controls tool-calling behavior per step:

| Step | Tool Choice | Rationale |
|------|-------------|-----------|
| 0 (all providers) | `required` | Forces the model to call a tool immediately instead of asking clarifying questions |
| 1-2 (Gemini only) | `required` | Gemini is unreliable with `auto` mode and frequently skips tools; forced for 3 steps |
| 1+ (non-Gemini) / 3+ (Gemini) | `auto` | Model can freely choose between calling more tools or producing a final text response |

**Step logging:** Each completed step is logged via `onStepFinish` with the tool names called, finish reason, and token usage (input/output).

### Tool Repair Mechanism

The `experimental_repairToolCall` callback handles two categories of malformed tool calls:

**1. Non-existent tool names (`AI_NoSuchToolError`):**
- Logs a warning with the invalid tool name
- Attempts fuzzy matching: searches all available tool names for a case-insensitive substring match (e.g., if the model calls `get_spending_summary`, it matches to `getSpendingSummary`)
- If a match is found, returns the corrected tool call with the right name but original arguments
- If no match is found, returns `null` to skip the broken call

**2. Invalid input parameters:**
- Logs a warning with the validation error message
- Returns `null` to skip the broken call (the model continues with its next step)

In both cases, the repair is transparent to the user -- the system prompt instructs the model to never expose tool errors or retries.

### Error Handling for AI Provider Failures

Errors are handled at multiple levels:

**Route-level try/catch:** The entire `POST` handler is wrapped in a try/catch. If any unhandled error occurs (provider API failure, network timeout, authentication error), the error message is extracted and returned as a JSON response with status 500:
```json
{ "error": "Error message from provider" }
```

**Missing API key:** Returns status 400 with a user-friendly message directing them to Settings.

**Tool execution errors:** Each tool's `execute` function catches Supabase query errors and returns them as `{ error: "message" }` within the tool result (not thrown). The model sees the error in the tool output and can adapt its response.

**Client-side:** The `useChat` hook handles stream errors and displays them in the chat UI.

### System Prompt

The system prompt establishes the AI's persona ("PiggyBack"), injects the current date, and provides:
- A critical rule to never ask clarifying questions and always use tools proactively
- Example multi-tool strategies for common questions (e.g., "help me save" triggers 3 tools)
- A categorized list of all 35 tools with brief descriptions
- Communication style guidelines (warm, concise, data-driven, AUD formatting)
- Data rules (always call tools first, use multiple tools, confirm before write actions)

---

## Financial Tools Reference (35 tools)

All tools are defined in `src/lib/ai-tools.ts` via `createFinancialTools()`. Every tool queries Supabase with the user's authenticated context. Account-scoped tools filter by `accountIds`, partnership-scoped tools filter by `partnershipId`. Row Level Security (RLS) is enforced at the database level.

### Query Tools (16 tools)

#### `searchTransactions`
Search and filter the user's transactions by merchant, category, date range, or amount.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `query` | `string` | No | Search text matched against transaction descriptions (ilike) |
| `category` | `string` | No | Filter by category ID (e.g., `groceries`, `restaurants-and-cafes`) |
| `dateFrom` | `string` | No | Start date (YYYY-MM-DD) |
| `dateTo` | `string` | No | End date (YYYY-MM-DD) |
| `minAmount` | `number` | No | Minimum absolute amount in dollars |
| `maxAmount` | `number` | No | Maximum absolute amount in dollars |
| `type` | `"spending" \| "income" \| "all"` | No | Filter by transaction direction (default: `all`) |
| `limit` | `number` | No | Max results (default 25, max 50) |

**Returns:** `{ count, transactions: [{ description, amount, amountCents, isSpending, category, parentCategory, date, type }] }`

---

#### `getSpendingSummary`
Spending breakdown by category for a given month. Excludes transfers. Optionally includes subcategory-level breakdown within each parent category.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `month` | `string` | Yes | Month in YYYY-MM format |
| `includeSubcategories` | `boolean` | No | Include subcategory breakdown within each parent category (default: false) |

**Returns:** `{ month, totalSpending, totalSpendingCents, transactionCount, categories: [{ category, amount, amountCents, percentage, subcategories?: [{ name, amount, amountCents, percentage }] }] }`

When `includeSubcategories` is true, each category includes a `subcategories` array with individual subcategory spending and percentages relative to the parent. Category and subcategory names are resolved from raw UP Bank category IDs to display names via the `category_mappings` table (`new_parent_name` and `new_child_name`).

---

#### `getIncomeSummary`
Income breakdown for a given month. Groups by transaction type/category.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `month` | `string` | Yes | Month in YYYY-MM format |

**Returns:** `{ month, totalIncome, totalIncomeCents, sources: [{ source, amount, count }], topTransactions: [{ description, amount, date, type }] }`

Excludes internal transfers, round-ups, and external transfers. Top 10 individual income transactions included.

---

#### `getAccountBalances`
Current balances for all active bank accounts. No parameters required.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| *(none)* | | | |

**Returns:** `{ totalBalance, totalBalanceCents, accounts: [{ name, type, balance, isActive, lastUpdated }] }`

---

#### `getUpcomingBills`
Upcoming recurring bills/expenses from `expense_definitions` with last-paid status from `expense_matches`.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `includeInactive` | `boolean` | No | Include paused/inactive bills (default: false) |

**Returns:** `{ totalMonthlyEstimate, billCount, bills: [{ name, emoji, category, amount, recurrence, nextDue, isActive, lastPaid, merchant }] }`

Monthly estimate normalizes all frequencies (weekly, fortnightly, quarterly, yearly) to monthly equivalents. Requires partnership.

---

#### `getSavingsGoals`
Savings goal progress with target amounts, current balances, and deadlines.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `includeCompleted` | `boolean` | No | Include completed goals (default: false) |

**Returns:** `{ goals: [{ name, target, current, remaining, progress, deadline, isCompleted, completedAt, icon }] }`

Requires partnership.

---

#### `getMonthlyTrends`
Spending and income trends over multiple months with savings rate calculations.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `months` | `number` | No | Months to look back (default 6, max 24) |

**Returns:** `{ periodMonths, averageMonthlySpending, averageMonthlyIncome, averageMonthlySavings, trends: [{ month, spending, income, net, savingsRate, transactionCount }] }`

Excludes internal transfers, round-ups, and external transfers from calculations.

---

#### `getMerchantSpending`
Deep-dive spending history at a specific merchant with monthly breakdown.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `merchant` | `string` | Yes | Merchant name (partial match via ilike) |
| `months` | `number` | No | Months to look back (default 12) |

**Returns:** `{ merchant, totalTransactions, totalSpent, averageTransaction, visitCount, recentTransactions: [{ description, amount, isSpending, date }], monthlyBreakdown: [{ month, amount }] }`

---

#### `comparePeriods`
Side-by-side comparison of spending between two months, broken down by category.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `month1` | `string` | Yes | First month (YYYY-MM) |
| `month2` | `string` | Yes | Second month (YYYY-MM) |

**Returns:** `{ month1, month2, month1Total, month2Total, totalDifference, comparison: [{ category, month1Amount, month2Amount, difference, percentChange }] }`

Results sorted by largest absolute difference.

---

#### `getTopMerchants`
Top merchants/payees ranked by total spending.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `month` | `string` | No | Month in YYYY-MM (omit for all time) |
| `limit` | `number` | No | Number of merchants (default 15) |

**Returns:** `{ period, merchants: [{ rank, merchant, totalSpent, visits, averageSpend }] }`

---

#### `getBudgetStatus`
Budget assignments vs. actual spending for a period. Uses the budget engine for accurate calculations including expense-default fills, split-aware spending, and support for weekly/fortnightly/monthly period types. Supports multi-budget architecture and individual/shared views.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `month` | `string` | No | Month in YYYY-MM format (defaults to current month) |
| `periodType` | `"weekly" \| "fortnightly" \| "monthly"` | No | Period type override (default: auto-detected from budget settings) |
| `budgetView` | `"individual" \| "shared"` | No | Which budget view (default: from user's default budget, typically 'shared') |
| `budgetId` | `string` | No | Specific budget ID for multi-budget users (default: user's default budget from `user_budgets`) |

**Returns:** `{ periodLabel, periodType, budgetView, income, toBeBudgeted, totalBudgeted, totalSpent, totalRemaining, rows: [{ name, parentCategory, type, budgeted, spent, remaining, percentUsed, isOverBudget, isExpenseDefault }], summary: { onTrackCount, overBudgetCount, rowCount } }`

The tool looks up the user's default budget from `user_budgets` if no `budgetId` is provided. Uses `getEffectiveAccountIds()` for proper account scoping per budget view (including JOINT account deduplication for shared view). Calls `calculateBudgetSummary()` from the budget engine with full input data (income sources, assignments, transactions, expense definitions, split settings, category mappings). Requires partnership.

---

#### `getPaySchedule`
Income schedule information including next pay dates and amounts from `income_sources`.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| *(none)* | | | |

**Returns:** `{ incomeSources: [{ name, type, frequency, nextPayDate, amount, notes }] }`

Uses `advancePayDate()` to ensure pay dates are always in the future. Scoped to partnership if available, otherwise user-only.

---

#### `getCategoryList`
All spending categories with parent/child hierarchy and special system categories.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| *(none)* | | | |

**Returns:** `{ categories: [{ name, icon, subcategories: string[] }], specialCategories: ["internal-transfer", "external-transfer", "round-up", "salary-income", "interest", "investments"] }`

---

#### `getDailySpending`
Day-by-day spending breakdown for a given month, including biggest purchase per day.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `month` | `string` | Yes | Month in YYYY-MM format |

**Returns:** `{ month, totalSpent, daysWithSpending, averageDailySpend, days: [{ date, total, transactions, biggestPurchase }] }`

Excludes internal transfers, round-ups, and external transfers.

---

#### `detectRecurringExpenses`
Detect recurring expense patterns from transaction history. Wraps `detectRecurringTransactions()` from `recurring-detector.ts`. Cross-references against existing `expense_definitions` to flag already-tracked expenses. The system prompt instructs the model to call this BEFORE `createExpenseDefinition` to pre-fill from real data.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `query` | `string` | No | Filter by description (e.g. "Netflix"). Omit to detect all patterns. |
| `months` | `number` | No | Lookback period in months (default 6, max 12) |

**Returns:** `{ patterns: [{ description, averageAmount, averageAmountCents, frequency, nextExpectedDate, count, emoji, alreadyTracked, existingExpenseId, existingExpenseName }], totalDetected, alreadyTracked, untracked }`

---

#### `detectIncomePatterns`
Detect income patterns from transaction history (salary, freelance, etc.). Groups positive transactions by normalized description, runs `analyzeIncomePattern()` from `income-pattern-analysis.ts` per group. Cross-references against existing `income_sources`. The system prompt instructs the model to call this BEFORE `createIncomeSource` to pre-fill from real data.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `query` | `string` | No | Filter by description (e.g. "salary"). Omit to detect all patterns. |
| `months` | `number` | No | Lookback period in months (default 6, max 12) |

**Returns:** `{ patterns: [{ description, frequency, averageAmount, averageAmountCents, nextPredictedPayDate, confidence, count, alreadyTracked, existingSourceId, existingSourceName }], totalDetected, alreadyTracked, untracked }`

---

### Power Query Tool (1 tool)

#### `queryFinancialData`
General-purpose read-only query against any financial table. The most flexible tool, used for complex questions the predefined tools cannot answer.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `table` | `string` | Yes | Table name (see allowed list below) |
| `select` | `string` | No | Supabase select syntax (default: `*`) |
| `filters` | `array` | No | Array of `{ column, operator, value }` objects |
| `orderBy` | `object` | No | `{ column, ascending? }` sort order |
| `limit` | `number` | No | Max rows (default 100, max 500) |

**Filter operators:** `eq`, `neq`, `gt`, `gte`, `lt`, `lte`, `like`, `ilike`, `is`, `in`, `not.in`

**Allowed tables:** `transactions`, `accounts`, `expense_definitions`, `expense_matches`, `savings_goals`, `income_sources`, `budget_assignments`, `budget_months`, `category_mappings`, `categories`, `couple_split_settings`, `investments`, `investment_history`, `transaction_category_overrides`, `tags`, `transaction_tags`, `net_worth_snapshots`, `budget_category_shares`, `user_budgets`, `goal_contributions`, `target_allocations`, `transaction_share_overrides`, `annual_checkups`, `watchlist_items`, `profiles`

**Auto-scoping:** The tool automatically injects security filters based on table type:
- **Account-scoped** (`transactions`): filtered by user's `accountIds`
- **Partnership-scoped** (`expense_definitions`, `expense_matches`, `savings_goals`, `budget_assignments`, `budget_months`, `couple_split_settings`, `budget_category_shares`, `transaction_share_overrides`, `user_budgets`, `target_allocations`, `investments`, `net_worth_snapshots`, `annual_checkups`, `watchlist_items`): filtered by `partnershipId`
- **User-scoped** (`income_sources`): filtered by `userId`
- **Profile-scoped** (`profiles`): filtered by `userId` via `id` column
- **RLS-only** (`goal_contributions`, `investment_history`): scoped via foreign keys; RLS handles security
- **Account-ID-scoped** (`accounts`): filtered by user's `accountIds`
- **Global** (`category_mappings`, `categories`, `tags`): no additional scoping

**Large result optimization:** When results exceed 50 rows, the tool compacts the response to reduce token consumption. Instead of returning all rows, it returns:
- `numericSummaries`: per-column min/max/avg/sum for numeric fields
- `firstRows`: first 15 rows
- `lastRows`: last 5 rows
- A note explaining the compaction

**Returns (small):** `{ table, rowCount, rows }`
**Returns (large):** `{ table, rowCount, note, numericSummaries, firstRows, lastRows }`

The tool description includes full schema documentation for all queryable tables so the model knows exact column names and types.

---

### Financial Health & Planning Tools (5 tools)

#### `getFinancialHealth`
Comprehensive financial health snapshot with metrics and actionable recommendations. Shows savings rate, emergency fund months, essential vs discretionary spending ratio, goals progress, bills payment rate, and net worth trend. Reuses pure functions from the Plan page (`generateHealthMetrics()`, `generatePriorityRecommendations()` from `plan-health-calculations.ts`).

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `months` | `number` | No | Lookback months for calculations (default: 3, max: 12) |

**Returns:** `{ metrics: [{ id, label, value, status, trend, statusLabel }], recommendations: [{ priority, title, description, impact }], summary: { monthlyIncome, monthlySpending, monthlySavings, savingsRate, emergencyFundMonths, essentialPercent, discretionaryPercent, billsPaymentRate } }`

Runs 7 parallel queries: accounts, transactions (last N months), category mappings, net worth snapshots, savings goals, expense definitions + matches, and income sources. Calls `classifySpending()` from `fire-spending-classifier.ts` to split spending into essential vs discretionary categories. Requires partnership.

---

#### `getNetWorthHistory`
Net worth trend over time with change tracking, high/low values, and trend direction.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `period` | `"1M" \| "3M" \| "6M" \| "1Y" \| "ALL"` | No | Time period for history (default: '6M') |

**Returns:** `{ period, latestNetWorth, latestDate, changeOverPeriod, changePercent, highestValue, highestDate, lowestValue, lowestDate, trend, dataPointCount, dataPoints: [{ date, value }] }`

Queries `net_worth_snapshots` ordered by `snapshot_date`. For token efficiency, data points are sampled down to ~15 when the full set is larger. Returns formatted currency strings (e.g. "$250,000.00").

---

#### `getGoalDetails`
Detailed savings goal information with status classification (on-track, behind, ahead, overdue), contribution history, linked account balance, and budget allocations. Uses `classifyGoalStatus()` from `goal-calculations.ts`.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `goalName` | `string` | No | Name of a specific goal (partial match via ilike). If omitted, returns all active goals. |
| `includeContributions` | `boolean` | No | Include recent contribution history (default: false) |

**Returns:** `{ goals: [{ name, icon, target, current, remaining, progress, deadline, monthsRemaining, status, monthlySavingsNeeded, currentMonthlySavingsRate, budgetAllocation, linkedAccount?: { name, balance }, recentContributions?: [{ date, amount, source }] }] }`

Fetches goals with linked saver accounts, contribution history (from `goal_contributions`), and budget allocations (from `budget_assignments` where `assignment_type = 'goal'`). Status classification: `on-track` (within 7 days of pace), `ahead` (>7 days ahead), `behind` (>7 days behind), `overdue` (past deadline with incomplete progress). Requires partnership.

---

#### `getInvestmentPortfolio`
Investment portfolio summary with total value, performance metrics, top gainers/losers, and optional rebalancing suggestions. Uses `calculatePerformanceMetrics()`, `calculateTopMovers()`, `calculateRebalancing()`, and `aggregatePortfolioHistory()` from `portfolio-aggregation.ts`.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `includeHistory` | `boolean` | No | Include portfolio value history (default: false) |
| `period` | `"1M" \| "3M" \| "6M" \| "1Y" \| "ALL"` | No | History period if `includeHistory` is true (default: '3M') |

**Returns:** `{ totalValue, totalCost, totalGain, totalROI, investments: [{ name, type, ticker, currentValue, purchaseValue, gain, gainPercent }], performance: { bestPerformer, worstPerformer }, topGainers: [{ name, gainPercent }], topLosers: [{ name, gainPercent }], rebalancing?: [{ assetType, currentPercent, targetPercent, action }], portfolioHistory?: [{ date, value }] }`

Queries `investments` table (partnership-scoped), plus `investment_history` and `target_allocations` if requested. Rebalancing suggestions are included only if the user has configured target allocations.

---

#### `getFIREProgress`
FIRE (Financial Independence, Retire Early) projections. Uses `projectFireDate()`, `calculateAge()`, `generateRecommendations()`, and `calculateSavingsImpact()` from `fire-calculations.ts`, plus `generateFireGameplan()` from `fire-gameplan.ts`. Supports what-if scenarios via `extraMonthlySavingsDollars`.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `extraMonthlySavingsDollars` | `number` | No | What-if: additional monthly savings to model |

**Returns:** `{ currentAge, retirementAge, fireDate, yearsToFire, progress, currentNetWorth, fireNumber, annualSpending, savingsRate, monthlyInvestmentIncome, variants: { lean, regular, fat, coast }, twoSuperBuckets, recommendations, gameplan, whatIf? }`

Queries accounts, transactions, investments, income sources, savings goals, and the user's FIRE profile from `profiles`. Requires partnership.

---

### Analysis Tools (4 tools)

#### `getSpendingVelocity`
Current month burn rate analysis with per-category velocity tracking against budgets.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `month` | `string` | No | Month in YYYY-MM (defaults to current month) |

**Returns:** `{ month, dayOfMonth, daysInMonth, daysRemaining, totalSpent, dailyBurnRate, projectedMonthEnd, totalBudget, budgetedDailyRate, remainingBudget, safeToSpendPerDay, onTrack, categoryVelocity: [{ category, budgeted, spent, projected, onTrack, percentUsed }] }`

Compares actual daily burn rate to budgeted pace. Projects month-end spending based on current velocity. Calculates safe-to-spend-per-day for remaining days.

---

#### `getCashflowForecast`
Forward-looking cash flow projection combining balances, income, recurring expenses, and discretionary spending.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `monthsAhead` | `number` | No | Months to forecast (default 3, max 6) |

**Returns:** `{ currentBalance, monthlyIncome, monthlyFixedExpenses, monthlyDiscretionary, monthlySurplus, nextPayDate, daysUntilPay, safeToSpendToday, projections: [{ month, projectedBalance, projectedBalanceCents, income, fixedExpenses, discretionary, surplus }] }`

**Income calculation:** Uses actual income from the last 3 months of transactions (averaged) rather than `income_sources` table entries, which may be stale.

**Expense breakdown:**
- Fixed expenses: summed from active `expense_definitions`, normalized to monthly
- Discretionary: average total spending (3 months) minus fixed expenses
- Monthly surplus: income minus total expenses

**Safe-to-spend-today:** If next pay date is known, calculates remaining balance after fixed obligations until pay day, divided by days until pay. Otherwise falls back to average daily discretionary spend.

---

#### `getSubscriptionCostTrajectory`
Subscription/bill cost analysis with price change detection over time.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `months` | `number` | No | Months of history to analyze for price changes (default 12) |

**Returns:** `{ subscriptionCount, totalMonthlyCost, totalQuarterlyCost, totalAnnualCost, subscriptions: [{ name, merchant, emoji, category, currentAmount, frequency, annualCost, nextDueDate, priceChanges: [{ date, from, to, changePercent }], matchedTransactions }] }`

Price changes are detected by finding matching transactions for each expense definition's merchant name and flagging amount differences greater than 5%. Requires partnership.

---

#### `getCoupleSplitAnalysis`
Expense split fairness analysis between partners using configured split settings and income ratios.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `month` | `string` | No | Month in YYYY-MM (defaults to current month) |

**Returns:** `{ month, user1MonthlyIncome, user2MonthlyIncome, incomeRatio, totalSpent, categoryBreakdown: [{ category, totalSpent, user1Share, user1ShouldPay, user2ShouldPay, hasCustomSplit }], configuredSplits }`

Split types: `equal` (50/50), `custom` (configurable percentage), `individual-owner` (100% owner), `individual-partner` (100% partner). Falls back to income-based ratio for categories without explicit split settings. Requires partnership.

---

### Action Tools (9 tools)

All action tools require user confirmation before execution. The system prompt instructs the model to describe the planned action and ask "Shall I go ahead?" before calling these. All write tools that create records include hard duplicate checks -- they query for existing records by name (ilike) before inserting, returning the existing record details if a match is found.

#### `createBudget`
Create a new budget with name, type, period, and methodology. Automatically seeds all category assignment rows, savings goal rows, and investment rows for the current month. Generates a unique slug via `generateUniqueSlug()`. If seeding fails, rolls back by deleting the created budget.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `name` | `string` | Yes | Budget name (e.g. "Weekly Essentials") |
| `budgetType` | `enum` | Yes | `personal`, `household`, `custom` |
| `emoji` | `string` | No | Emoji icon (default "...") |
| `methodology` | `string` | No | `zero-based`, `50-30-20`, `envelope`, `pay-yourself-first` (default: `zero-based`) |
| `periodType` | `enum` | No | `weekly`, `fortnightly`, `monthly` (default: `monthly`) |
| `budgetView` | `enum` | No | `individual`, `shared` (defaults based on budgetType) |
| `categoryFilter` | `object` | No | `{ included: string[] }` -- parent categories to include (omit for all) |
| `totalBudget` | `number` | No | Total budget cap in dollars |

**Returns:** `{ success, id, name, emoji, budgetType, methodology, periodType, budgetView, seededCategories, seededGoals, seededInvestments, isDefault }`

Uses `ALL_PARENT_CATEGORIES` and `getSubcategoriesForParents()` from `budget-templates.ts` for category seeding. First budget for a partnership is automatically set as default. Requires partnership.

---

#### `createBudgetAssignment`
Create or update a budget allocation for a category or subcategory in a given month. Supports multi-budget architecture, individual/shared views, and handles race conditions with automatic retry on unique constraint violations.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `month` | `string` | Yes | Month in YYYY-MM format |
| `categoryName` | `string` | Yes | The parent category name to budget for (use `getCategoryList` to find valid names) |
| `amountDollars` | `number` | Yes | Budget amount in dollars (e.g. 600 for $600). Use 0 to clear. |
| `subcategoryName` | `string` | No | Subcategory name for subcategory-level budgeting (e.g. 'Groceries' within 'Food & Dining') |
| `budgetView` | `"individual" \| "shared"` | No | Which budget view (default: from user's default budget) |
| `budgetId` | `string` | No | Target budget ID (default: user's default budget from `user_budgets`) |

**Returns:** `{ success, category, subcategory, month, amount, action: "created" | "updated", budgetView, totalMonthlyBudget }`

The tool looks up the user's default budget from `user_budgets` if no `budgetId` is provided. Uniqueness is determined by the combination of partnership, month, budget_id, budget_view, category_name, and subcategory_name. On unique constraint violation (PostgreSQL error code `23505`), the tool automatically retries as an update. After upserting, calls the `update_budget_month_totals` RPC for atomic total recalculation with a client-side fallback if the RPC is unavailable.

---

#### `createExpenseDefinition`
Create a new recurring bill or expense. Performs a hard duplicate check by name and merchant before inserting. Automatically infers an emoji if none provided via keyword matching against 20+ category patterns. The system prompt enforces calling `detectRecurringExpenses` first to pre-fill from real transaction data.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `name` | `string` | Yes | Display name (e.g., "Netflix") |
| `categoryName` | `string` | Yes | Category name |
| `amountDollars` | `number` | Yes | Expected amount in dollars |
| `recurrenceType` | `enum` | Yes | `weekly`, `fortnightly`, `monthly`, `quarterly`, `yearly`, `one-time` |
| `nextDueDate` | `string` | Yes | Next due date (YYYY-MM-DD) |
| `merchantName` | `string` | No | Merchant name for auto-matching |
| `matchPattern` | `string` | No | Text pattern for transaction matching |
| `emoji` | `string` | No | Emoji icon |
| `notes` | `string` | No | Notes |

**Returns:** `{ success, id, name, amount, recurrence, nextDue, category }`

---

#### `createSavingsGoal`
Create a new savings goal with optional starting balance, deadline, and visual customization. Performs a hard duplicate check by name. Creates an initial `goal_contributions` record if `currentAmountDollars` > 0.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `name` | `string` | Yes | Goal name |
| `targetAmountDollars` | `number` | Yes | Target amount in dollars |
| `currentAmountDollars` | `number` | No | Starting amount (default 0) |
| `deadline` | `string` | No | Target date (YYYY-MM-DD) |
| `icon` | `string` | No | Emoji icon |
| `color` | `string` | No | Color hex code |

**Returns:** `{ success, id, name, target, current, deadline }`

---

#### `updateSavingsGoal`
Add funds to or modify an existing savings goal. Looks up the goal by name (fuzzy ilike match). Returns an error listing all matches if multiple goals match (instead of crashing). Records a `goal_contributions` entry when funds are added. Automatically marks as completed if current amount reaches target.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `goalName` | `string` | Yes | Name of the goal to update (partial match) |
| `addFundsDollars` | `number` | No | Amount to add to current savings |
| `newTargetDollars` | `number` | No | New target amount |
| `newDeadline` | `string` | No | New deadline (YYYY-MM-DD) |

**Returns:** `{ success, name, previousAmount, newAmount, target, progress, isCompleted, deadline }`

---

#### `recategorizeTransaction`
Change the category of a transaction. Creates a `transaction_category_overrides` record preserving the original category, then updates the transaction's `category_id` AND `parent_category_id` (looked up from `category_mappings`).

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `transactionDescription` | `string` | Yes | Transaction description to search for (ilike) |
| `transactionDate` | `string` | No | Date to narrow search (YYYY-MM-DD) |
| `newCategoryId` | `string` | Yes | New category ID |
| `notes` | `string` | No | Reason for recategorization |

**Returns:** `{ success, transaction, amount, date, previousCategory, newCategory, newParentCategory }`

---

#### `createIncomeSource`
Add a new income source. Performs a hard duplicate check by name. Sets `source_type`, `match_pattern`, and `is_active` columns. Calculates monthly equivalent for the response. Associates with partnership if available. The system prompt enforces calling `detectIncomePatterns` first to pre-fill from real transaction data.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `name` | `string` | Yes | Income source name |
| `amountDollars` | `number` | Yes | Amount per period in dollars |
| `frequency` | `enum` | Yes | `weekly`, `fortnightly`, `monthly`, `quarterly`, `yearly` |
| `sourceType` | `enum` | No | `salary`, `freelance`, `government`, `investment`, `other` (default: `other`) |
| `nextPayDate` | `string` | No | Next expected payment date (YYYY-MM-DD) |
| `notes` | `string` | No | Notes |

**Returns:** `{ success, id, name, amount, frequency, monthlyEquivalent, nextPayDate }`

---

#### `createInvestment`
Add a new investment to the user's portfolio. Performs a hard duplicate check by name and ticker symbol. Creates an initial `investment_history` entry for value tracking.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `assetType` | `enum` | Yes | `stock`, `etf`, `crypto`, `property`, `other` |
| `name` | `string` | Yes | Investment name (e.g. "VDHG", "Bitcoin") |
| `tickerSymbol` | `string` | No | Ticker symbol (e.g. "VDHG.AX") |
| `quantity` | `number` | No | Number of units/shares held |
| `purchaseValueDollars` | `number` | No | Total purchase cost in dollars |
| `currentValueDollars` | `number` | Yes | Current total value in dollars |
| `notes` | `string` | No | Notes |

**Returns:** `{ success, id, name, assetType, currentValue, purchaseValue }`

Requires partnership.

---

#### `updateInvestment`
Update an existing investment's value, quantity, or notes. Looks up by name (fuzzy ilike match). Records an `investment_history` entry when the value changes.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `investmentName` | `string` | Yes | Name of the investment to update (partial match) |
| `currentValueDollars` | `number` | No | New current value in dollars |
| `quantity` | `number` | No | New quantity |
| `notes` | `string` | No | New notes |

**Returns:** `{ success, name, assetType, previousValue, newValue, gain, gainPercent }`

Requires partnership.

---

## AI Categorization

### Overview

The categorization system uses a multi-layered approach to assign categories to bank transactions. The layers are ordered by cost (free first, then AI) and are invoked at different points: during webhook processing (single transaction) and via manual batch action (bulk).

### Categorization Stack

#### Layer 1: Rule-Based Inference (`src/lib/infer-category.ts`)

The `inferCategoryId()` function handles transactions that UP Bank leaves uncategorized using deterministic rules. It checks in order:

1. **UP Bank category provided** -- use it as-is
2. **Internal transfer** -- if `transfer_account_id` is set, assign `internal-transfer`
3. **Round-ups** -- if `round_up_amount_cents` is non-zero or type is "Round Up", assign `round-up`
4. **Salary** -- if type is "Salary", assign `salary-income`
5. **Interest** -- if type is "Interest", assign `interest`
6. **Investment platforms** -- description contains "pearler", "vanguard", or "spaceship", assign `investments`
7. **External transfers** -- if type is "Transfer" or "Scheduled Transfer", assign `external-transfer`
8. **Incoming payments** -- positive amounts with types like "Osko Payment Received", "Deposit", "Direct Credit", etc., assign `salary-income`
9. **Uncategorized** -- return null (falls through to next layer)

This layer is called during transaction sync (webhook and batch) and is completely free (no API calls).

#### Layer 2: Merchant Category Rules

The webhook handler checks `merchant_category_rules` for user-defined category overrides after rule-based inference. If a matching rule exists for the transaction description, it takes precedence over the inferred category. User-created `transaction_category_overrides` have the highest priority and are preserved across webhook updates.

#### Layer 3: AI-Powered Categorization (`src/lib/ai-categorize.ts`)

Two entry points exist:

**Single transaction: `aiCategorizeTransaction()`**

Designed to be called fire-and-forget (never blocks the caller). Steps:
1. **Merchant cache lookup** -- queries `transactions` table for any other transaction with the same `description` that already has a `category_id`. If found, copies that category (zero API calls).
2. **Load AI settings** -- reads the user's provider/key/model from `profiles`. Skips if no API key.
3. **Load category whitelist** -- fetches all `category_mappings` to build a valid category list.
4. **AI structured output** -- calls `generateObject()` with the transaction description, amount, and full category list. Schema enforces `{ category_id: string, confidence: number }`.
5. **Validate** -- rejects if the AI returns an invalid category ID or confidence below 0.5.
6. **Apply** -- updates the transaction's `category_id` in the database.

**Batch: `batchAiCategorize()`**

Used by the manual "Auto-Categorize" action. More efficient than single calls:

1. **Find uncategorized** -- queries transactions with `category_id = null` and `is_categorizable = true`
2. **Group by description** -- deduplicates to avoid redundant AI calls for identical merchants
3. **Pass 1: Merchant cache** -- for each unique description, checks if any previously categorized transaction has the same description. Applies cached category to ALL transactions in the group. Zero API calls.
4. **Pass 2: Bulk AI call** -- remaining uncategorized descriptions are sent in a SINGLE `generateObject()` call. The prompt includes all descriptions with average amounts and transaction counts. Schema enforces `{ categorizations: [{ description, category_id, confidence }] }`.
5. **Validate and apply** -- each AI result is validated against the category whitelist. Results with invalid categories or confidence below 0.4 are skipped. Valid results are applied in batch updates.
6. **Error handling** -- if the bulk AI call fails entirely, all remaining transactions are counted as errors but no data is corrupted.

**Returns:** `{ categorized: number, skipped: number, errors: number }`

### AI Categorization Prompt Details

The categorization prompt includes domain-specific rules for Australian banking:
- Person names (P2P payments) are categorized contextually (beauty services, social payments, gifts, or `life-admin` as default)
- ATM transactions default to `life-admin`
- Online shopping (Amazon, eBay, AliExpress) defaults to `hobbies` unless clearly another category
- Software subscriptions default to `games-and-software`
- Hair/nail/beauty services default to `personal-care-and-beauty`
- Food/restaurant transactions are split between `restaurants-and-cafes` and `takeaway`
- Fitness/PT defaults to `fitness-and-wellbeing`

---

## Key Files

| File | Purpose |
|------|---------|
| `src/lib/ai-tools.ts` | 35 financial tool definitions for the chat assistant |
| `src/lib/ai-categorize.ts` | AI categorization with merchant cache + bulk AI |
| `src/lib/infer-category.ts` | Rule-based category inference (deterministic) |
| `src/app/api/ai/chat/route.ts` | Chat endpoint (streaming, tool calling, repair) |
| `src/app/api/ai/context/route.ts` | Context builder (financial snapshot for UI) |
| `src/components/ai/piggy-chat.tsx` | Chat UI with tool status indicators |
