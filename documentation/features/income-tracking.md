# Income Tracking System

## Overview
PiggyBack tracks income from multiple sources with support for automatic detection, manual configuration, and Up Bank tag synchronization.

## Income Sources
Stored in `income_sources` table:
- **Recurring**: Regular income (salary) with `source_type: 'recurring-salary'`, frequency, and next_pay_date
- **One-off**: Single income events (bonuses, tax refunds, gifts) with `source_type: 'one-off'`

### Properties
- `name`: Display name
- `amount_cents`: Expected amount
- `source_type`: `'recurring-salary'` or `'one-off'`
- `one_off_type`: For one-off income — bonus/gift/dividend/tax-refund/freelance/other
- `frequency`: weekly/fortnightly/monthly/quarterly/yearly (recurring only)
- `next_pay_date`: Next expected payment (recurring only)
- `last_pay_date`: Most recent payment date
- `expected_date`: Expected date for one-off income
- `received_date`: When one-off income was received
- `is_received`: Whether one-off income has been received
- `linked_up_transaction_id`: Reference UP Bank transaction (used for dedup on creation)
- `linked_transaction_id`: Reference local transaction
- `match_pattern`: Pattern for webhook matching (e.g. `"Description%"`)
- `is_active`: Soft-delete flag
- `is_manual_partner_income`: Whether this is a manually entered partner income source

## Income Detection

### Pattern Analysis (`src/lib/income-pattern-analysis.ts`)
`analyzeIncomePattern()`:
1. Sorts income transactions by date
2. Calculates average gap between consecutive transactions
3. Maps average gap to frequency: 6-8 days -> weekly, 13-15 -> fortnightly, 28-32 -> monthly, 56-65 -> bi-monthly
4. Returns confidence level (high: 6+ transactions, medium: 3+, low: < 3) and predicted next pay date

### Frequency Conversion (`src/lib/income-frequency-converter.ts`)
Converts between display periods:
- Uses intuitive multipliers (4 weeks = 1 month, not calendar days)
- Monthly is the universal baseline
- Converts: TO monthly first, THEN from monthly to target
- Supported input frequencies: weekly, fortnightly, monthly, quarterly, yearly
- Supported display periods: weekly, fortnightly, monthly

## UP Bank Tag Integration
Income transactions can be tagged in UP Bank:
- `markTransactionAsIncome()` - Marks transaction with `is_income: true` (in `src/app/actions/transactions.ts`)
- `unmarkTransactionAsIncome()` - Removes income flag (in `src/app/actions/transactions.ts`)
- `syncIncomeTagsFromUpBank()` - Fetches all 'Income'-tagged transactions from UP Bank API, updates local `is_income` flags and `transaction_tags` (in `src/app/actions/income.ts`)

## Income Creation from Transactions
`createIncomeSourceFromTransaction()` in `src/app/actions/income.ts`:
- Supports `'recurring'` and `'one-off'` modes
- For recurring: analyzes pay pattern from all transactions with matching description, creates source with detected frequency
- For one-off: creates source with the one-off type (bonus, gift, etc.)
- Deduplicates by checking `linked_up_transaction_id` before creating
- Updates transaction flags (`is_income`, `is_one_off_income`, `income_type`)
- Creates `transaction_references` entry linking the UP transaction to the income source

## Income Matching (Webhook)
When webhook receives new transactions via `matchSingleTransactionToIncomeSources()` in `src/lib/match-expense-transactions.ts`:
1. Checks all active recurring-salary income sources for the user's partnership
2. Matches by `match_pattern` (wildcard-stripped, case-insensitive substring) or `name` (case-insensitive substring)
3. Updates income source's `last_pay_date` and advances `next_pay_date` by frequency interval
4. Updates `amount_cents` if the transaction amount differs from stored amount
5. Marks the transaction as income (`is_income: true`, `income_type: 'salary'`)

## Stale Date Advancement (`src/lib/advance-pay-date.ts`)
`advanceStaleIncomeSources()`:
- Checks all income sources for stale `next_pay_date` values (dates in the past)
- Advances them forward by frequency interval until they reach today or later
- Persists corrections to the database (fire-and-forget, non-blocking)
- Called at read-time (e.g. from the home page) so stale dates are corrected on access
- Pure function `advancePayDate()` also exported for standalone use

## Key Files
- `src/app/actions/income.ts` - Income classification, UP Bank tag sync, income source creation from transactions
- `src/app/actions/income-sources.ts` - Income source CRUD (create, read, update, soft-delete, mark one-off received)
- `src/lib/income-pattern-analysis.ts` - Pattern detection (frequency analysis)
- `src/lib/income-frequency-converter.ts` - Frequency conversion (intuitive multipliers)
- `src/lib/advance-pay-date.ts` - Stale date advancement
- `src/lib/match-expense-transactions.ts` - Income source matching (webhook path, `matchSingleTransactionToIncomeSources`)
