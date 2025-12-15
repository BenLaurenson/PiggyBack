# Library Functions Reference

Complete reference for all 45 library files in `src/lib/`.

## Core Utilities

### utils.ts
| Export | Signature | Description |
|--------|-----------|-------------|
| `cn` | `(...inputs: ClassValue[]) => string` | Tailwind CSS class merging (clsx + tailwind-merge) |

### demo-guard.ts
| Export | Signature | Description |
|--------|-----------|-------------|
| `isDemoMode` | `() => boolean` | Checks `NEXT_PUBLIC_DEMO_MODE` env var |
| `demoModeResponse` | `() => Response` | Returns 200 JSON response with demo mode message |
| `demoActionGuard` | `() => { error, demo, success } \| null` | Returns error object if demo mode active, null otherwise |
| `getCurrentDate` | `() => Date` | Returns frozen date (2026-01-28) in demo mode, real date otherwise |

### user-display.ts
| Export | Signature | Description |
|--------|-----------|-------------|
| `getDisplayName` | `(profileName, fullName, email) => string` | Resolves display name: profile > metadata first name > email prefix > "there" |
| `formatLastSynced` | `(dateStr: string \| null) => string` | Relative time: "Just now", "X min ago", "X hours ago", "X days ago", or locale date |

### slugify.ts
| Export | Signature | Description |
|--------|-----------|-------------|
| `slugify` | `(name: string) => string` | Convert name to URL-safe slug (handles &, apostrophes, truncates at 80 chars) |
| `generateUniqueSlug` | `(supabase, partnershipId, name, excludeBudgetId?) => Promise<string>` | Generate unique slug within a partnership's budgets (appends -2, -3, etc. on collision) |

## Expense & Transaction Matching

### expense-matcher.ts

Types: `Transaction`, `ExpenseDefinition`, `MatchResult`

| Export | Signature | Description |
|--------|-----------|-------------|
| `matchesPattern` | `(description: string, pattern: string) => boolean` | SQL LIKE pattern matching (supports `%` and `_` wildcards) |
| `calculateMatchConfidence` | `(transaction, expense) => number` | 0-1 confidence score based on description (40pts), amount (40pts), timing (20pts) |
| `findBestMatch` | `(transaction, expenses, minConfidence?) => MatchResult \| null` | Returns highest confidence match; prioritizes direct UP transaction ID links |
| `batchMatchTransactions` | `(transactions, expenses, minConfidence?) => MatchResult[]` | Match all transactions against all expenses; deduplicates by transaction |
| `normalizeDescription` | `(description: string) => string` | Lowercase, remove numbers/special chars, normalize whitespace |
| `suggestMatchPattern` | `(description: string) => string` | Generate SQL LIKE pattern from first 2-3 significant words |
| `suggestExpenseCategory` | `(description: string) => string` | Keyword-based category suggestion (Housing, Transport, Food, etc.) |
| `suggestExpenseEmoji` | `(name: string, category: string) => string` | Infer emoji from expense name and category keywords |
| `isValidMatch` | `(transaction, expense, minConfidence?) => boolean` | Check if transaction meets confidence threshold for expense |
| `isAmountReasonable` | `(transactionAmount, expectedAmount) => boolean` | Check if amounts are within 50% tolerance |
| `getExpensesDueInRange` | `(expenses, startDate, endDate) => ExpenseDefinition[]` | Filter active expenses due within date range |
| `getExpensesDueThisMonth` | `(expenses) => ExpenseDefinition[]` | Filter expenses due in current calendar month |
| `getUpcomingExpenses` | `(expenses) => ExpenseDefinition[]` | Filter expenses due in next 30 days |
| `detectRecurrenceFromGaps` | `(transactions) => string` | Detect frequency from transaction date gaps (weekly/fortnightly/monthly/quarterly/yearly/irregular) |
| `checkAmountConsistency` | `(transactions) => boolean` | True if 70%+ of transactions are within 10% of average |
| `checkTimingConsistency` | `(transactions) => boolean` | True if coefficient of variation < 0.25 |
| `predictNextDate` | `(lastTransactionDate: string, recurrence: string) => string` | Predict next occurrence date as ISO string |

### match-expense-transactions.ts

Types: `MatchOptions`

| Export | Signature | Description |
|--------|-----------|-------------|
| `matchExpenseToTransactions` | `(expenseId, partnershipId, options?) => Promise<{ matched, error? }>` | Batch match: merchant name ILIKE + amount tolerance; advances `next_due_date` |
| `matchSingleTransactionToExpenses` | `(transactionId, description, accountId, transactionDate, amountCents) => Promise<{ matched, error? }>` | Webhook match: single transaction against all active expenses; uses service role client |
| `matchSingleTransactionToIncomeSources` | `(transactionId, description, accountId, transactionDate, amountCents) => Promise<{ matched, error? }>` | Webhook match: income transaction against income sources; advances `next_pay_date` |

### advance-pay-date.ts
| Export | Signature | Description |
|--------|-----------|-------------|
| `advancePayDate` | `(storedDate: string \| null, frequency: string \| null) => string \| null` | Pure function: advance date forward by frequency until today or later |
| `advanceStaleIncomeSources` | `<T>(supabase, sources: T[]) => T[]` | Advance all stale income source dates; persists updates fire-and-forget |

## Categorization

### infer-category.ts
| Export | Signature | Description |
|--------|-----------|-------------|
| `inferCategoryId` | `({ upCategoryId, transferAccountId, roundUpAmountCents, transactionType, description, amountCents }) => string \| null` | Rule-based categorization: internal transfers, round-ups, salary, interest, investments, external transfers |

### ai-categorize.ts
| Export | Signature | Description |
|--------|-----------|-------------|
| `aiCategorizeTransaction` | `({ transactionId, description, amountCents, userId }) => Promise<{ source, categoryId, confidence? } \| null>` | AI-powered categorization: merchant cache first, then AI model (Google/OpenAI/Anthropic) |
| `batchAiCategorize` | `(userId, accountIds) => Promise<{ categorized, skipped, errors }>` | Two-pass batch: merchant cache pass (free), then bulk AI call for remaining |

### recurring-detector.ts

Types: `RecurringTransaction`

| Export | Signature | Description |
|--------|-----------|-------------|
| `detectRecurringTransactions` | `(transactions) => RecurringTransaction[]` | Identify recurring patterns (weekly/fortnightly/monthly) from 2+ occurrences |
| `calculateSafeToSpend` | `(currentBalance, upcomingBills, daysUntilPay) => number` | Balance minus upcoming bills minus 10% safety buffer |
| `calculateProjections` | `(transactions, currentBalance, monthsToProject?) => Projection[]` | 12-month balance projections based on 6-month income/expense averages |

## Budget Engine

### budget-engine.ts

Pure calculation engine for all budget math. Zero database access -- all data passed in via typed inputs.

Types: `PeriodType`, `CarryoverMode`, `BudgetView`, `SplitType`, `PeriodRange`, `IncomeSourceInput`, `AssignmentInput`, `ExpenseDefInput`, `SplitSettingInput`, `TransactionInput`, `CategoryMapping`, `GoalInput`, `AssetInput`, `BudgetRow`, `MethodologySection`, `BudgetSummary`, `BudgetSummaryInput`, `CarryoverInput`

**Period Calculations:**
| Export | Signature | Description |
|--------|-----------|-------------|
| `getBudgetPeriodRange` | `(date: Date, periodType: PeriodType) => PeriodRange` | Month-aligned period boundaries: weeks (1-7, 8-14, 15-21, 22-end), fortnights (1-14, 15-end), monthly (full month) |
| `getNextPeriodDate` | `(date: Date, periodType: PeriodType) => Date` | Navigate to the next period boundary |
| `getPreviousPeriodDate` | `(date: Date, periodType: PeriodType) => Date` | Navigate to the previous period boundary |
| `getMonthKeyForPeriod` | `(date: Date) => string` | Format date as `YYYY-MM-01` month key |

**Core Calculations:**
| Export | Signature | Description |
|--------|-----------|-------------|
| `convertToTargetPeriod` | `(amount, fromFrequency, toPeriodType) => number` | Frequency normalisation (weekly <-> fortnightly <-> monthly) |
| `countOccurrencesInPeriod` | `(anchorDate, frequency, periodStart, periodEnd) => number` | Anchor-based recurrence projection within a period |
| `calculateIncome` | `(incomeSources, periodRange, periodType, ...) => number` | Aggregate income for a budget period |
| `calculateBudgeted` | `(assignments, expenseDefs, periodRange, periodType, ...) => number` | Aggregate budgeted amounts including expense auto-fill |
| `calculateSpent` | `(transactions, categoryMappings, splitSettings, ...) => Map<string, number>` | Category-level spending from transactions with split support |
| `resolveSplitPercentage` | `(categoryName, splitSettings, ...) => number` | Partner split resolution for shared budgets |
| `calculateCarryover` | `(input: CarryoverInput) => number` | Previous-period surplus calculation |
| `calculateBudgetSummary` | `(input: BudgetSummaryInput) => BudgetSummary` | Main orchestrator: income, budgeted, spent, carryover, TBB, full row set |

### budget-row-types.ts

Canonical type definitions for all budget table rows. Uses discriminated unions for type-safe handling.

Types: `SuggestedSavingsBreakdown`, `ExpenseData`, `BudgetRowShareConfig`, `BudgetRowSplitConfig`, `CategoryBudgetRow`, `SubcategoryBudgetRow`, `GoalBudgetRow`, `AssetBudgetRow`, `BudgetRow`

| Export | Signature | Description |
|--------|-----------|-------------|
| `isCategoryRow` | `(row: BudgetRow) => row is CategoryBudgetRow` | Type guard for category rows |
| `isSubcategoryRow` | `(row: BudgetRow) => row is SubcategoryBudgetRow` | Type guard for subcategory rows |
| `isGoalRow` | `(row: BudgetRow) => row is GoalBudgetRow` | Type guard for goal rows |
| `isAssetRow` | `(row: BudgetRow) => row is AssetBudgetRow` | Type guard for asset rows |

### budget-templates.ts

Pre-built budget configurations for new budget creation.

Types: `BudgetTemplateSection`, `BudgetTemplate`

| Export | Signature | Description |
|--------|-----------|-------------|
| `ALL_PARENT_CATEGORIES` | `readonly string[]` | All 11 known parent categories in the PiggyBack system |
| `BUDGET_TEMPLATES` | `BudgetTemplate[]` | Array of pre-built budget templates (essentials-only, etc.) |
| `CATEGORY_SUBCATEGORIES` | `Record<string, string[]>` | Map of parent categories to their subcategories |
| `getSubcategoriesForParents` | `(parentNames: string[]) => Record<string, string[]>` | Get subcategories for a list of parent category names |

## Budget Calculations

### budget-zero-calculations.ts

Types: `BudgetAssignment`, `ExpenseDefinition`, `CoupleSplitSetting`, `SplitResult`, `ToBeBudgetedResult`, `CategoryBudgetData`, `QuickAssignSuggestion`, `ExpenseStatus`, `BudgetMonthSummary`

**Core TBB:**
| Export | Signature | Description |
|--------|-----------|-------------|
| `calculateToBeBudgeted` | `(income, assigned, carryover) => number` | Core formula: TBB = Income + Carryover - Assigned |
| `getMonthKey` | `(date: Date) => string` | Format date as `YYYY-MM-01` |
| `parseMonthKey` | `(monthKey: string) => Date` | Parse month key to Date |
| `getPreviousMonth` | `(monthKey: string) => string` | Get previous month key |
| `getNextMonth` | `(monthKey: string) => string` | Get next month key |
| `isCurrentMonth` | `(monthKey: string) => boolean` | Check if month key matches current month |

**Category Calculations:**
| Export | Signature | Description |
|--------|-----------|-------------|
| `calculateAvailable` | `(assigned, spent) => number` | Available = Assigned - Spent |
| `calculatePercentage` | `(spent, assigned) => number` | Percentage spent of assigned |
| `getCategoryStatus` | `(spent, assigned) => string` | Returns 'under', 'at' (95%+), 'over' (100%+), or 'none' |

**Couple Split:**
| Export | Signature | Description |
|--------|-----------|-------------|
| `calculateSplit` | `(amount, expenseId, categoryName, settings) => SplitResult` | Split amount with priority: expense-specific > category > default |
| `getUserBudgetPortion` | `(assignments, userId, partnershipId, isOwner, settings) => BudgetAssignment[]` | Apply split to all assignments for a user |

**Expense Due Dates:**
| Export | Signature | Description |
|--------|-----------|-------------|
| `calculateNextDueDate` | `(currentDueDate: Date, recurrenceType: string) => Date` | Advance date by one frequency interval |
| `isExpenseOverdue` | `(dueDate: Date) => boolean` | Check if due date is in the past |
| `getDaysUntilDue` | `(dueDate: Date) => number` | Days until due (negative if overdue) |
| `getExpenseUrgency` | `(dueDate: Date) => string` | Returns 'overdue', 'due-today', 'due-soon', 'upcoming', or 'future' |
| `getExpenseGroup` | `(expense, now?) => string` | Time-based group: 'paid', 'this-week', 'this-month', 'this-quarter', 'this-year', 'next-year', 'overdue' |

**Budget Suggestions & Health:**
| Export | Signature | Description |
|--------|-----------|-------------|
| `suggestBudgetAmount` | `(historicalSpending, method?) => number` | Suggest budget from history (average/median/last-month) |
| `calculateBudgetHealth` | `(toBeBudgeted, assignments, spending, expenses, matches) => number` | 0-100 budget health score (5 criteria, 20pts each) |
| `getQuickAssignSuggestions` | `(categoryName, historicalSpending) => QuickAssignSuggestion[]` | Quick assign buttons: Last Month, Avg 3mo, Avg 6mo, +10% |
| `getExpenseStatus` | `(expense, isMatched) => ExpenseStatus` | Returns status object with label, color, and icon |
| `validateAssignment` | `(amount, availableToBudget) => { valid, error? }` | Validate budget assignment amount |
| `validateExpense` | `(expense) => { valid, error? }` | Validate expense definition fields |
| `groupExpensesByUrgency` | `(expenses, matches) => Record<string, ExpenseDefinition[]>` | Group into overdue/this-week/next-week/this-month/future |

**Period & Rollover:**
| Export | Signature | Description |
|--------|-----------|-------------|
| `calculatePeriodIncome` | `(monthlyIncome, periodType) => number` | Prorate monthly income for weekly (÷4) or fortnightly (÷2) |
| `getPeriodLabel` | `(date, periodType) => string` | Human-readable period label |
| `formatCurrency` | `(cents: number) => string` | Format cents as AUD currency (no decimals) |
| `formatCurrencyDetailed` | `(cents: number) => string` | Format cents as AUD currency (2 decimals) |
| `calculateCarryover` | `(previousTBB: number) => number` | Max(0, previousTBB) |
| `processMonthRollover` | `(income, assigned, previousCarryover) => { carryover, finalTBB }` | End-of-month rollover calculation |
| `calculateBudgetSummary` | `(income, carryover, assignments, categorySpending, totalCategories) => BudgetMonthSummary` | Complete month summary stats |

### shared-budget-calculations.ts

Types: `CategoryShareConfig`, `TransactionOverride`, `ShareConfig`, `Transaction`

| Export | Signature | Description |
|--------|-----------|-------------|
| `calculateMyBudgetAmount` | `(transaction, config) => number` | User's portion: override % > category % > full amount |
| `calculateOurBudgetAmount` | `(transaction, config) => number` | Shared view: full amount if shared, 0 if personal |
| `isTransactionShared` | `(transaction, config) => boolean` | Check if transaction appears in shared view |
| `getTransactionSharePercentage` | `(transaction, config) => number` | User's share %: override > category > 100 (personal) |
| `calculateCategoryMyBudgetSpending` | `(transactions, categoryName, config) => number` | Sum user's portion for all transactions in category |
| `calculateCategoryOurBudgetSpending` | `(transactions, categoryName, config) => number` | Sum shared amounts for all transactions in category |
| `calculateIncomeProportionalSplit` | `(userIncome, partnerIncome) => number` | Income-based split percentage (0-100) |
| `buildShareConfig` | `(categoryShares, transactionOverrides) => ShareConfig` | Build ShareConfig from raw database arrays |
| `calculateShareSummary` | `(transactions, config) => { totalShared, totalPersonal, userShareOfShared, partnerShareOfShared }` | Summary statistics for shared vs personal spending |

### budget-period-helpers.ts

Types: `PeriodBoundaries`

| Export | Signature | Description |
|--------|-----------|-------------|
| `getPeriodStartDate` | `(referenceDate, periodType) => Date` | Month-aligned period start: weeks (1-7, 8-14, 15-21, 22-end), fortnights (1-14, 15-end), monthly (1st) |
| `getPeriodEndDate` | `(referenceDate, periodType) => Date` | Period end date matching aligned boundaries |
| `getCurrentPeriodBoundaries` | `(referenceDate, periodType) => PeriodBoundaries` | Current period start, end, and label |
| `prorateBudgetForPeriod` | `(monthlyAmount, periodType) => number` | Prorate: weekly (÷4), fortnightly (÷2), monthly (as-is) |

### expense-period-utils.ts
| Export | Signature | Description |
|--------|-----------|-------------|
| `calculatePeriodStart` | `(date, recurrenceType) => Date` | Billing period start for transaction (weekly=Monday, monthly=1st, quarterly=Q start, yearly=Jan 1) |
| `formatPeriodDate` | `(date: Date) => string` | Format as `YYYY-MM-DD` using local date (not UTC) |
| `getPeriodForTransaction` | `(transactionDate, recurrenceType) => string` | Convenience: `calculatePeriodStart` + `formatPeriodDate` |
| `isTransactionInPeriod` | `(transactionDate, periodStart, periodEnd) => boolean` | Check if transaction date falls within period |
| `getPeriodLabel` | `(periodDate, recurrenceType) => string` | Human-readable: "Week of 6 Jan", "January 2026", "Q1 2026" |

### expense-projections.ts

Types: `ExpenseData`, `ExpenseMatch`, `ExpenseWithMatches`, `PaidExpenseInstance`, `ProjectedExpense`, `TimelineGroup`, `CondensedExpense`, `CondensedTimelineGroup`, `CondensedPaidExpense`, `CashFlowSummary`

| Export | Signature | Description |
|--------|-----------|-------------|
| `generateProjectedOccurrences` | `(expense, monthsAhead?, referenceDate?) => ProjectedExpense[]` | Project future expense dates from `next_due_date` |
| `groupExpensesByTimeline` | `(expenses, referenceDate?) => TimelineGroup[]` | Group projections into month buckets (This Month, Next Month, etc.) |
| `generateTimelineFromExpenses` | `(expenses, monthsAhead?, referenceDate?) => TimelineGroup[]` | Full pipeline: project all expenses then group into timeline |
| `separatePaidExpenses` | `(expenses, periodStart, periodEnd) => { paid, unpaid }` | Split by transaction date in period (not stale `is_matched` flag) |
| `generatePaidInstances` | `(expenses, periodStart, periodEnd) => PaidExpenseInstance[]` | Extract individual paid instances from match data within period |
| `condensePaidInstances` | `(instances) => CondensedPaidExpense[]` | Group paid instances by expense ID (e.g., "Gym x3") |
| `calculateCashFlowSummary` | `(timelineGroups, remainingBudget) => CashFlowSummary` | Net cash flow: this month (paid/remaining), next month total, shortfall |
| `condenseRecurringExpenses` | `(group: TimelineGroup) => CondensedTimelineGroup` | Condense recurring expenses within a single timeline group |
| `condenseTimelineGroups` | `(groups) => CondensedTimelineGroup[]` | Condense all timeline groups |

## Methodology & Layout

### methodology-mapper.ts

Types: `Methodology`, `MethodologyCategory`

Constants: `METHODOLOGY_MAPPINGS` (zero-based, 50-30-20, envelope, pay-yourself-first, 80-20)

| Export | Signature | Description |
|--------|-----------|-------------|
| `getMethodologyCategories` | `(methodology) => MethodologyCategory[]` | Get category structure for methodology |
| `mapUpBankCategoryToMethodology` | `(upBankCategory, methodology) => string` | Map UP Bank category to methodology section name |
| `getTargetAllocation` | `(methodologyCategory, income, methodology) => number` | Target amount based on percentage allocation |
| `getMergedMethodology` | `(methodology, customCategories) => MethodologyCategory[]` | Merge base methodology with user customizations |
| `validateMethodologyCustomizations` | `(methodology, customCategories) => string \| null` | Validate percentages sum to 100%, unique names; returns error or null |

### methodology-section-generator.ts

Types: `SectionTemplate`, `TemplateConfig`

Constants: `BUILT_IN_TEMPLATES` (50-30-20, pay-yourself-first, 80-20)

| Export | Signature | Description |
|--------|-----------|-------------|
| `getTemplateConfig` | `(templateId: SectionTemplate) => TemplateConfig \| undefined` | Get template configuration by ID |
| `generateSectionsFromTemplate` | `(templateId, categoryMappings) => Section[]` | Generate layout sections from template, validating against user's categories |
| `getAvailableTemplates` | `() => Pick<TemplateConfig, 'id' \| 'name' \| 'description' \| 'icon'>[]` | List available templates with metadata |
| `getDefaultHiddenItemIds` | `(categoryMappings) => string[]` | Non-essential subcategory IDs to hide by default in 50-30-20 |

### layout-persistence.ts

Types: `BudgetLayoutPreset`, `LayoutConfig`, `Section`, `Column`

| Export | Signature | Description |
|--------|-----------|-------------|
| `exportLayout` | `(layout: BudgetLayoutPreset) => string` | Serialize layout to JSON string (version 1.0) |
| `importLayout` | `(json: string) => { valid, layout?, error? }` | Deserialize and validate layout from JSON |
| `createDefaultLayoutConfig` | `() => LayoutConfig` | Default config: Item/Assigned/Spent/Progress columns, comfortable density |
| `generateItemId` | `(type, identifier, parentCategory?) => string` | Generate section item ID (e.g., `subcategory-Food & Dining::Groceries`) |
| `parseItemId` | `(itemId: string) => { type, identifier, parentCategory? } \| null` | Parse item ID back to components |
| `validateLayoutConfig` | `(config) => { valid, error? }` | Validate layout structure (sections, columns, density, groupBy) |
| `getDensitySpacing` | `(density) => { rowPadding, rowGap, fontSize }` | Get Tailwind class names for density level |

### formula-evaluator.ts

Types: `FormulaContext`

Constants: `FORMULA_SUGGESTIONS` (7 pre-built formulas: Available, Overspend, % of Income, etc.)

| Export | Signature | Description |
|--------|-----------|-------------|
| `evaluateFormula` | `(formula: string, context: FormulaContext) => number \| null` | Evaluate formula with placeholders ({assigned}, {spent}, etc.) and functions (MAX, MIN, ROUND, ABS, FLOOR, CEIL, DAYS_REMAINING) |
| `validateFormula` | `(formula: string) => { valid, error? }` | Check syntax, placeholders, parentheses; test with dummy data |
| `formatFormulaResult` | `(value, dataType, formatConfig?) => string` | Format result as currency/percentage/number/text |

### assignment-distributor.ts

Types: `DistributionStrategy` (`'equal' | 'proportional' | 'manual'`), `CategoryDistribution`

| Export | Signature | Description |
|--------|-----------|-------------|
| `distributeMethodologyAssignment` | `(totalAmount, underlyingCategories, historicalSpending, strategy, manualAmounts?) => CategoryDistribution[]` | Distribute budget across categories (equal, proportional to history, or manual) |
| `validateDistribution` | `(distribution, expectedTotal) => { valid, actualTotal, difference }` | Validate amounts sum correctly |
| `getHistoricalSpending` | `(categoryNames, partnershipId, months?) => Promise<Map<string, number>>` | Fetch historical spending from API (client-side) |

## Income

### income-frequency-converter.ts

Types: `IncomeFrequency`, `DisplayPeriod`

| Export | Signature | Description |
|--------|-----------|-------------|
| `convertIncomeFrequency` | `(amountCents, fromFrequency, toDisplayPeriod) => number` | Convert between frequencies using intuitive multipliers (weekly x4 = monthly, fortnightly x2 = monthly) |
| `getFrequencyLabel` | `(frequency: IncomeFrequency) => string` | Human-readable: "per week", "per fortnight", etc. |

### income-pattern-analysis.ts

Types: `IncomeTransaction`, `DetectedPaySchedule`

| Export | Signature | Description |
|--------|-----------|-------------|
| `analyzeIncomePattern` | `(transactions: IncomeTransaction[]) => DetectedPaySchedule` | Detect pay frequency, average amount, next predicted date, and confidence level |
| `calculateMonthlyEquivalent` | `(amount, frequency) => number` | Convert to monthly using intuitive multipliers |

### apply-split.ts
| Export | Signature | Description |
|--------|-----------|-------------|
| `calculateSplit` | `(supabase, partnershipId, categoryName, expenseDefinitionId, totalAmountCents) => Promise<{ ownerAmount, partnerAmount, splitType, ownerPercent }>` | Server-side split with hierarchy lookup: expense > category > partnership default > 50/50 |

## Goals

### goal-calculations.ts

Pure calculation functions for goal analytics. No side effects, no database access.

| Export | Signature | Description |
|--------|-----------|-------------|
| `aggregateGoalHistory` | `(goals, contributions, startDate, endDate) => GoalDataPoint[]` | Combine contributions across multiple goals into a savings timeline for charts. Forward-fills gaps. |
| `aggregateSingleGoalHistory` | `(goal, contributions, startDate, endDate) => GoalDataPoint[]` | Wrapper for single goal history |
| `calculateSavingsRate` | `(contributions, periodDays?) => { dailyRate, monthlyRate, weeklyRate }` | Average savings rate from recent contributions (default 90 days). Excludes `initial` source. |
| `calculateProjectedCompletion` | `(goal, contributions, budgetAllocationCents?) => Date \| null` | Estimated completion date using actual rate or budget allocation, whichever is higher |
| `classifyGoalStatus` | `(goal, contributions, budgetAllocationCents?) => GoalStatus` | Classifies: on-track (within 7 days), ahead, behind, overdue, no-deadline, completed |
| `calculateSuggestedSavings` | `(remainingCents, deadline?, now?) => SuggestedSavings` | Weekly / fortnightly / monthly amounts needed to reach goal by deadline |
| `getStartDateForPeriod` | `(period, now?) => Date` | Period start date for chart filters (1M, 3M, 6M, 1Y, ALL) |

Types: `GoalContribution`, `GoalDataPoint`, `GoalForCalculation`, `GoalStatus`, `GoalStatusType`, `SuggestedSavings`

---

## FIRE Planning

### fire-calculations.ts

Constants: `PRESERVATION_AGE` (60), `AGE_PENSION_AGE` (67), `SAFE_WITHDRAWAL_RATE` (0.04), `DEFAULT_SG_RATE` (11.5), `FIRE_MULTIPLIER` (25), `FAT_FIRE_MULTIPLIER` (1.25)

Types: `FireProfile`, `SpendingData`, `InvestmentData`, `FireVariantResult`, `TwoBucketBreakdown`, `FireResult`, `ProjectionYear`, `FireRecommendation`, `SavingsImpactResult`

| Export | Signature | Description |
|--------|-----------|-------------|
| `calculateAge` | `(dob: Date, now?: Date) => number` | Age from date of birth |
| `calculateAnnualExpenses` | `(spending, variant, overrideCents) => number` | Annual expenses by FIRE variant: lean (essentials), regular (total), fat (125% total) |
| `calculateFireNumber` | `(annualExpensesCents) => number` | FIRE number = annual expenses x 25 (4% rule) |
| `calculateTwoBucket` | `(annualExpenses, currentAge, targetAge, investments) => TwoBucketBreakdown` | Australian two-bucket: outside-super (pre-60) + super (post-60) |
| `calculateCoastFire` | `(fireNumberCents, yearsToTarget, annualReturnRate) => number` | Coast FIRE threshold: amount needed now for compound growth to reach FIRE number |
| `projectFireDate` | `(profile, spending, investments) => FireResult` | Complete FIRE analysis: all four variants, two-bucket breakdown, year-by-year projection |
| `calculateSavingsImpact` | `(result, extraMonthlyCents, profile, spending, investments) => SavingsImpactResult` | Impact of additional monthly savings on FIRE date |
| `generateRecommendations` | `(result, spending, profile) => FireRecommendation[]` | Actionable recommendations: boost savings, increase income, salary sacrifice, coast achieved, on track |

### fire-spending-classifier.ts

Types: `SpendingClassification`

| Export | Signature | Description |
|--------|-----------|-------------|
| `classifySpending` | `(transactions, categoryMappings) => SpendingClassification` | Split essential vs discretionary spending for Lean FIRE; uses parent/child category rules with overrides |

### fire-gameplan.ts

Pure functions composing `fire-calculations.ts` to produce actionable gameplan data.

Types: `FireGameplan`, `GameplanAction`, `FireMilestone`, `CoastFireData`, `SavingsRatePoint`, `WithdrawalComparison`, `EtfSuggestion`

| Export | Signature | Description |
|--------|-----------|-------------|
| `generateFireGameplan` | `(profile, spending, investments, fireResult) => FireGameplan` | Generate complete FIRE gameplan with actions, milestones, and visualisation data |
| `findRequiredExtraIncome` | `(profile, spending, investments, fireResult, targetAge) => number` | Binary search for extra monthly income needed to reach FIRE by target age |
| `findRequiredExtraSavings` | `(profile, spending, investments, fireResult, targetAge) => number` | Binary search for extra monthly savings needed to reach FIRE by target age |
| `computeMilestones` | `(spending, investments, fireResult, profile) => FireMilestone[]` | Compute milestone markers for coast, lean, regular, fat FIRE |
| `computeCoastFire` | `(profile, investments, fireResult) => CoastFireData` | Coast FIRE progress data |
| `computeSavingsRateCurve` | `(profile, spending, investments, fireResult) => SavingsRatePoint[]` | Savings rate vs retirement age curve for charts |
| `computeWithdrawalComparison` | `(spending) => WithdrawalComparison[]` | Compare 3%, 3.5%, 4%, 4.5% withdrawal rates |
| `getEtfSuggestions` | `() => EtfSuggestion[]` | Curated list of Australian ETF suggestions |

### plan-health-calculations.ts

Pure functions for the Financial Health Snapshot and Priority Recommendations.

Types: `MetricStatus`, `TrendDirection`, `HealthMetric`, `PriorityRecommendation`, `GoalInteraction`, `NetWorthSnapshot`, `GoalSummary`, `GoalForTimeline`, `HealthMetricInputs`, `RecommendationInputs`

Constants: `SUPER_CONCESSIONAL_CAP_CENTS` (3,000,000 = $30,000)

| Export | Signature | Description |
|--------|-----------|-------------|
| `calculateNetWorthTrend` | `(snapshots: NetWorthSnapshot[]) => HealthMetric` | Net worth metric with trend direction |
| `calculateSavingsRateMetric` | `(income, spending, previous) => HealthMetric` | Savings rate metric with good/warning/concern thresholds |
| `calculateEmergencyFundMetric` | `(liquid, essentials) => HealthMetric` | Emergency fund months metric |
| `calculateGoalsProgressMetric` | `(goals: GoalSummary[]) => HealthMetric` | Goal progress metric |
| `calculateSpendingRatioMetric` | `(essential, discretionary) => HealthMetric` | Essential vs discretionary spending ratio |
| `calculateBillsPaymentMetric` | `(total, matched) => HealthMetric` | Bill payment coverage metric |
| `calculateDebtToIncomeMetric` | `(homeLoan, annualIncome) => HealthMetric` | Debt-to-income ratio metric |
| `generateHealthMetrics` | `(data: HealthMetricInputs) => HealthMetric[]` | Generate all health metrics from input data |
| `calculateSuperCapRoom` | `(sgRate, annualIncome) => number` | Super concessional contribution cap room |
| `generatePriorityRecommendations` | `(data: RecommendationInputs) => PriorityRecommendation[]` | Generate priority-sorted financial recommendations |
| `analyzeGoalInteractions` | `(goals, emergencyFundMonths, liquidBalance, essentials) => GoalInteraction[]` | Analyse how goal withdrawals would impact emergency fund |

## Integrations

### up-api.ts

Types: `UpAccount`, `UpTransaction`, `UpCategory`, `UpPaginatedResponse<T>`, `UpApiError`, `UpApiClient`

| Export | Signature | Description |
|--------|-----------|-------------|
| `createUpApiClient` | `(token: string) => UpApiClient` | Create UP Bank API client instance |

`UpApiClient` class methods:
| Method | Description |
|--------|-------------|
| `ping()` | Verify token validity |
| `getAccounts(params?)` | List accounts (filter by type, ownership) |
| `getAccount(id)` | Get single account |
| `getTransactions(params?)` | List transactions (filter by status, date range, category, tag) |
| `getAccountTransactions(accountId, params?)` | List transactions for specific account |
| `getTransaction(id)` | Get single transaction |
| `getCategories(params?)` | List categories (filter by parent) |
| `getCategory(id)` | Get single category |
| `categorizeTransaction(transactionId, categoryId)` | Set or clear transaction category |
| `addTags(transactionId, tags)` | Add tags to transaction |
| `removeTags(transactionId, tags)` | Remove tags from transaction |
| `getAllPages<T>(initialResponse)` | Auto-paginate through all pages (MAX_PAGES=100 safety limit) |

### price-apis.ts
| Export | Signature | Description |
|--------|-----------|-------------|
| `fetchCryptoPrice` | `(symbol: string) => Promise<PriceResult \| null>` | CoinGecko API in AUD (free, no key, 5min cache) |
| `fetchMultipleCryptoPrices` | `(symbols: string[]) => Promise<Map<string, PriceResult>>` | Batch CoinGecko fetch (single API call for all crypto) |
| `fetchYahooFinancePrice` | `(symbol: string) => Promise<PriceResult \| null>` | Yahoo Finance v8 API (free, no key, 1hr cache, ASX .AX suffix) |
| `fetchStockPrice` | `(symbol: string) => Promise<PriceResult \| null>` | Stock/ETF price via Yahoo Finance |
| `fetchInvestmentPrice` | `(assetType, ticker?, quantity?) => Promise<{ valueCents, priceData } \| null>` | Router: crypto via CoinGecko, stock/ETF via Yahoo Finance |

### invest-calculations.ts

Pure functions for investment page data processing. No side effects, no database access.

Types: `InvestmentRecord`, `AllocationEntry`, `BudgetContribution`, `DividendMonth`

| Export | Signature | Description |
|--------|-----------|-------------|
| `calculatePortfolioTotals` | `(investments) => { totalValue, totalPurchaseValue, totalGain, totalGainPercentage }` | Portfolio value totals and gain/loss |
| `groupByAssetType` | `(investments) => Record<string, InvestmentRecord[]>` | Group investments by asset type |
| `calculateAllocation` | `(investments) => AllocationEntry[]` | Allocation breakdown by asset type (type, value, count) |
| `calculateFireProgress` | `(totalInvestmentCents, superBalanceCents, annualExpenseOverride, fireVariant, calculateFireNumber) => object \| null` | FIRE progress calculation for invest page |
| `mapBudgetContributions` | `(assignments, investments) => { contributions, total }` | Map budget assignments to investment names |
| `aggregateDividendsByMonth` | `(transactions, now) => { monthly, annualTotal, monthlyAvg }` | 12-month rolling dividend aggregation |
| `calculateAnnualizedReturn` | `(currentValueCents, purchaseValueCents, createdAt, now?) => number` | Annualized return % (simple for <1yr, compound for >1yr) |
| `calculatePortfolioWeight` | `(investmentValueCents, totalPortfolioCents) => number` | Single investment weight as percentage of portfolio |

### portfolio-aggregation.ts

Pure functions for portfolio chart aggregation. No side effects, no database access.

| Export | Signature | Description |
|--------|-----------|-------------|
| `aggregatePortfolioHistory` | `(investments, historyRecords, startDate, endDate) => {date, valueCents}[]` | Groups history by date, forward-fills missing dates per investment, returns portfolio chart data |
| `calculatePerformanceMetrics` | `(investments) => { totalROI, totalGain, bestPerformer, worstPerformer }` | Total ROI %, gain $, best/worst by gain % |
| `calculateTopMovers` | `(investments) => { gainers, losers }` | Top 3 gainers and losers by gain % |
| `calculateRebalancing` | `(currentAllocation[], targetAllocation[], totalValue) => RebalancingResult[]` | Per-type delta: overweight/underweight, $ amount to rebalance |
| `getStartDateForPeriod` | `(period: string, now?: Date) => Date` | Maps period strings (1W, 1M, 3M, 6M, 1Y, ALL) to start dates |

### net-worth-helpers.ts
| Export | Signature | Description |
|--------|-----------|-------------|
| `upsertInvestmentNetWorth` | `(supabase, partnershipId) => Promise<void>` | Sum all investment values for partnership and upsert today's `net_worth_snapshots.investment_total_cents`. Carries forward most recent bank data if creating new snapshot. |

## Data Helpers

### get-user-partnership.ts
| Export | Signature | Description |
|--------|-----------|-------------|
| `getUserPartnershipId` | `(supabase, userId) => Promise<string \| null>` | Get user's partnership_id (limit 1, read-only) |

### get-effective-account-ids.ts
| Export | Signature | Description |
|--------|-----------|-------------|
| `getEffectiveAccountIds` | `(supabase, partnershipId, userId, view) => Promise<string[]>` | Account IDs with JOINT dedup for shared view; individual view returns only user's accounts |

### analysis-data.ts

Server-side data fetching for the analysis page.

Types: `AnalysisTransaction`, `AnalysisIncomeTransaction`, `AnalysisCategoryMapping`, `AnalysisCategory`, `AnalysisSubcategory`, `AnalysisIncomeSource`, `AnalysisNetWorthSnapshot`, `AnalysisData`

| Export | Signature | Description |
|--------|-----------|-------------|
| `getAnalysisData` | `(supabase, userId) => Promise<AnalysisData \| null>` | Fetch all analysis page data: 2yr transactions, categories, income sources, net worth snapshots |

### spending-insights.ts

Types: `Insight`

| Export | Signature | Description |
|--------|-----------|-------------|
| `generateInsights` | `(transactions, categoryMappings, expenseDefinitions) => Insight[]` | Generates sorted insights: spending anomalies (vs 3-month avg), merchant frequency alerts, day-of-week patterns, subscription duplicates, category trends (quarter-over-quarter), savings opportunities |

### create-notification.ts

Types: `NotificationType`, `CreateNotificationParams`, `NotificationPreferences`, `ScheduleConfig`

| Export | Signature | Description |
|--------|-----------|-------------|
| `createNotification` | `(supabase, params: CreateNotificationParams) => Promise<{ success, error? }>` | Insert notification into `notifications` table |
| `getNotificationPreferences` | `(supabase, userId) => Promise<NotificationPreferences>` | Get user's notification preferences (deep-merged with defaults) |
| `isNotificationEnabled` | `(supabase, userId, type) => Promise<boolean>` | Check if a notification type is enabled for user |
| `getScheduleConfig` | `(supabase, userId, type) => Promise<ScheduleConfig>` | Get schedule config for payment_reminder or weekly_summary |
| `DEFAULT_PREFERENCES` | `NotificationPreferences` | Default notification preferences constant |

### rate-limiter.ts
| Export | Signature | Description |
|--------|-----------|-------------|
| `rateLimit` | Rate limiting utility | Per-user rate limiting for API endpoints |

### token-encryption.ts
| Export | Signature | Description |
|--------|-----------|-------------|
| `encrypt` / `decrypt` | Token encryption functions | Encrypt/decrypt API tokens for secure storage |

### verify-partnership.ts
| Export | Signature | Description |
|--------|-----------|-------------|
| `verifyPartnership` | Partnership verification | Verify user belongs to a partnership before allowing access |

### audit-logger.ts
| Export | Signature | Description |
|--------|-----------|-------------|
| `auditLog` | Audit logging utility | Log security-relevant actions for audit trail |

## AI Tools

### ai-tools.ts
| Export | Signature | Description |
|--------|-----------|-------------|
| `createFinancialTools` | `(supabase, accountIds, partnershipId, userId?) => Record<string, Tool>` | Creates 35 AI financial tools for the chat assistant |

Tool inventory:

**Query Tools (16):**
| Tool | Description |
|------|-------------|
| `searchTransactions` | Search/filter transactions by query, category, date, amount, type |
| `getSpendingSummary` | Spending breakdown by category for a date range |
| `getIncomeSummary` | Income totals and breakdown by source |
| `getAccountBalances` | All account balances and types |
| `getUpcomingBills` | Upcoming expense definitions with due dates |
| `getSavingsGoals` | All savings goals with progress |
| `getMonthlyTrends` | Monthly income/expense/savings trend for N months |
| `getMerchantSpending` | Spending breakdown for a specific merchant |
| `comparePeriods` | Compare spending between two date ranges |
| `getTopMerchants` | Top N merchants by total spending |
| `getBudgetStatus` | Budget assignments vs actual spending |
| `getPaySchedule` | Income source schedule with next pay dates |
| `getCategoryList` | All available spending categories |
| `getDailySpending` | Day-by-day spending for a date range |
| `getSpendingVelocity` | Spending pace: current vs projected vs budget |
| `getCashflowForecast` | Multi-month cash flow forecast |

**Power Query (1):**
| Tool | Description |
|------|-------------|
| `queryFinancialData` | Flexible SQL-like query for advanced analysis across allowed tables |

**Financial Health & Planning (5):**
| Tool | Description |
|------|-------------|
| `getFinancialHealth` | Comprehensive financial health score and metrics |
| `getNetWorthHistory` | Net worth snapshots over time |
| `getGoalDetails` | Detailed goal progress and projections |
| `getInvestmentPortfolio` | Investment portfolio summary with allocations |
| `getFIREProgress` | FIRE planning progress and projections |

**Analysis Tools (4):**
| Tool | Description |
|------|-------------|
| `getSubscriptionCostTrajectory` | Subscription cost history and projections |
| `getCoupleSplitAnalysis` | Partner spending split analysis |
| `detectRecurringExpenses` | Detect recurring expense patterns from transactions |
| `detectIncomePatterns` | Detect income patterns and predict next pay |

**Action Tools (9):**
| Tool | Description |
|------|-------------|
| `createBudget` | Create a new budget with methodology and sections |
| `createBudgetAssignment` | Create or update a budget assignment |
| `createExpenseDefinition` | Create a new recurring expense tracker |
| `createSavingsGoal` | Create a new savings goal |
| `updateSavingsGoal` | Update savings goal progress or details |
| `recategorizeTransaction` | Change a transaction's category |
| `createIncomeSource` | Create a new income source |
| `createInvestment` | Create a new investment holding |
| `updateInvestment` | Update an existing investment |
