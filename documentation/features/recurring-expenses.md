# Recurring Expense System

## Overview
The recurring expense system tracks expected bills and subscriptions, automatically matching them to incoming transactions.

## Data Model
### expense_definitions
- `name`: Display name (e.g., "Netflix", "Rent")
- `expected_amount_cents`: Expected amount
- `recurrence_type`: weekly | fortnightly | monthly | quarterly | yearly | one-time
- `merchant_name`: Pattern for matching (case-insensitive partial match via ILIKE)
- `match_pattern`: Legacy matching pattern (may contain wildcards like `%pattern%`)
- `category_name`: Display category name (used when creating expenses)
- `emoji`: Auto-inferred from name/category via keyword matching, or custom
- `next_due_date`: Next expected payment date (anchor for `countOccurrencesInPeriod`)
- `linked_up_transaction_id`: Reference transaction (not used for matching)
- `notes`: Optional notes
- `auto_detected`: Whether this expense was AI-detected
- `created_by`: User who created the expense
- `is_active`: Soft-delete flag

Note: `is_matched` is not a DB column -- it is a computed client-side property derived from `expense_matches` data.

### expense_matches
- `expense_definition_id`: FK to expense_definitions
- `transaction_id`: FK to transactions (unique constraint -- one match per transaction)
- `matched_at`: When match was made (auto-set)
- `match_confidence`: Static confidence score (always `0.95` for auto-matches)
- `matched_by`: User ID for manual matches, `null` for auto-matches
- `for_period`: First day of billing period covered

## Matching Algorithm

### Batch Matching (`matchExpenseToTransactions`)
Used when creating/updating expense definitions, backfilling, and rematching.
1. Get expense definition's `merchant_name` (or fallback to `match_pattern` for legacy expenses)
2. Get all accounts for partnership members
3. Query matching transactions via `ILIKE '%merchant_name%'` (case-insensitive partial match), optionally limited by `limitMonths`
4. Filter by amount tolerance (configurable, default ±10% of `expected_amount_cents`)
5. Exclude already-matched transactions (checks existing `expense_matches` records)
6. Create `expense_matches` records with `for_period` calculated via `getPeriodForTransaction()`
7. Advance `next_due_date` repeatedly until it's past the latest matched transaction (uses `calculateNextDueDate()`)

### Webhook Matching (`matchSingleTransactionToExpenses`)
Used when new transactions arrive via webhook. Uses service role client (no user session).
1. For each active expense definition with a `merchant_name`:
   - Check if merchant_name matches (case-insensitive substring of description)
   - Split into: amount-matching expenses and price-changed expenses
   - Check if amount is within tolerance (±10%)
   - Check if not already matched for this transaction
2. If match found: upsert expense_match (with `ignoreDuplicates` for race conditions), advance next_due_date (only if transaction is within 7 days of due date)
3. For price-changed expenses (merchant matches but amount outside tolerance): creates `subscription_price_change` notifications if enabled for the user
4. Income matching is done separately via `matchSingleTransactionToIncomeSources` (called by the webhook handler for positive-amount transactions)

### Period Calculation
`for_period` is calculated based on recurrence type:
- Monthly: First day of transaction's month
- Weekly: Start of transaction's week (Monday)
- Fortnightly: Start of 2-week period
- Quarterly: First day of quarter
- Yearly: First day of year
- One-time: First day of transaction's month

### next_due_date Advancement
After matching, `next_due_date` is advanced by recurrence interval (via `calculateNextDueDate()` from `src/lib/budget-zero-calculations.ts`):
- weekly: +7 days
- fortnightly: +14 days
- monthly: +1 month
- quarterly: +3 months
- yearly: +1 year
- one-time: no advancement

Critical: If `next_due_date` is stale (in the past), it's advanced repeatedly until it's past the latest matched transaction.

**Webhook path guard**: The webhook matching path only advances `next_due_date` if the transaction date is within 7 days of (or after) the current due date. This prevents historical transactions from incorrectly advancing the due date far into the future.

## Expense Detection
### AI-Powered (`/api/budget/expenses/auto-detect`)
1. Fetch recent transactions (3 months)
2. Group by merchant
3. Send to AI provider for pattern recognition
4. Return detected recurring patterns with confidence

### Pattern-Based (fallback)
Uses `detectRecurringTransactions()` from `src/lib/recurring-detector.ts`:
1. Group transactions by normalized description
2. Analyze gaps between consecutive transactions
3. Detect weekly, fortnightly, or monthly patterns
4. Return with confidence scores

## Timeline Generation
`generateTimelineFromExpenses()` projects future expenses:
1. Start from each expense's `next_due_date`
2. Generate occurrences up to specified end date
3. Group by time period (This Month, Next Month, etc.)
4. Separate paid vs unpaid instances

`separatePaidExpenses()` checks which expenses have been paid:
1. Look at `expense_matches` -> `transactions` dates
2. Check if transaction date falls within current period
3. Mark as paid with transaction details

## Key Files
- `src/lib/expense-matcher.ts` - Pattern matching and confidence scoring
- `src/lib/match-expense-transactions.ts` - Batch and webhook matching
- `src/lib/expense-projections.ts` - Timeline generation
- `src/lib/expense-period-utils.ts` - Period calculations
- `src/lib/recurring-detector.ts` - Pattern detection
- `src/lib/advance-pay-date.ts` - Date advancement
- `src/app/api/budget/expenses/` - Expense API routes

## Administrative API Endpoints

### Backfill Process (`POST /api/expenses/backfill-all`)

**Purpose:** Retroactively match all historical transactions to existing expense definitions. This is a bulk operation that searches the entire transaction history for every active expense.

**When to use:**
- After importing a large batch of historical transactions
- After creating several new expense definitions and wanting to populate their match history all at once
- When the system was running without matching enabled and you need to catch up

**How it works:**
1. Fetches all active `expense_definitions` for the authenticated user's partnership
2. For each expense that has a `merchant_name` or `match_pattern`:
   - Calls `matchExpenseToTransactions()` with `limitMonths: null` (searches ALL history, no date limit)
   - Uses `amountTolerancePercent: 10` (matches within +/-10% of expected amount)
3. Skips any expense that lacks both `merchant_name` and `match_pattern`
4. Each successful match also advances `next_due_date` past the latest matched transaction
5. Returns a summary with total matches, per-expense results (first 50), and any errors

**Key difference from rematch-all:** Backfill explicitly passes `limitMonths: null` and `amountTolerancePercent: 10` to ensure full historical coverage with controlled tolerance. Rematch-all uses the default options.

**Response shape:**
```json
{
  "message": "Backfilled 42 transactions across 8 expenses",
  "totalMatched": 42,
  "totalExpenses": 12,
  "results": [
    { "id": "...", "name": "Netflix", "matched": 6 },
    { "id": "...", "name": "Rent", "matched": 0, "skipped": true, "reason": "No merchant name or pattern" }
  ],
  "errors": []
}
```

---

### Rematch-All Operation (`POST /api/expenses/rematch-all`)

**Purpose:** Re-run the matching algorithm for all active expenses using default matching options. This picks up any new transactions that have arrived since the last match run.

**When to use:**
- As a periodic maintenance operation to catch unmatched transactions
- After syncing new transactions from UP Bank
- When you suspect some transactions were missed by the webhook matching path

**How it works:**
1. Fetches all active `expense_definitions` for the authenticated user's partnership
2. For each expense that has a `match_pattern` set:
   - Calls `matchExpenseToTransactions()` with **no options** (uses defaults: `amountTolerancePercent: 10`, `limitMonths: null`)
3. Skips expenses without a `match_pattern`
4. Returns per-expense match results and errors

**Key differences from backfill:**
| Aspect | Backfill | Rematch-All |
|--------|----------|-------------|
| Skip criteria | No `merchant_name` AND no `match_pattern` | No `match_pattern` |
| Fields selected | `merchant_name`, `match_pattern`, `expected_amount_cents` | `match_pattern` only |
| Explicit options | `amountTolerancePercent: 10`, `limitMonths: null` | Defaults (same effective values) |
| Intent | Initial historical population | Ongoing maintenance catch-up |

Both operations are idempotent -- already-matched transactions are excluded by checking existing `expense_matches` records before inserting.

**Response shape:**
```json
{
  "message": "Matched 5 new transactions",
  "totalMatched": 5,
  "results": [
    { "id": "...", "name": "Spotify", "matched": 1 },
    { "id": "...", "name": "Gym", "matched": 0, "skipped": true }
  ]
}
```

---

### Recalculate Periods (`POST /api/expenses/recalculate-periods`)

**Purpose:** Fix incorrect `for_period` values on existing `expense_matches` records. The `for_period` field indicates which billing period a matched transaction covers (e.g., "2026-02-01" for a monthly expense matched in February). If the period calculation logic changes or data was imported with incorrect periods, this endpoint corrects them in bulk.

**When to use:**
- After changing an expense's `recurrence_type` (e.g., from monthly to fortnightly)
- If `for_period` calculation logic was updated and old records need correction
- As a data integrity repair tool

**How it works:**
1. Fetches all active expense definitions with their `expense_matches` and joined `transactions` data
2. For each match, recalculates the correct `for_period` using `getPeriodForTransaction(txnDate, recurrenceType)`
3. Compares the calculated period against the stored `for_period`
4. Updates only records where the value differs
5. Returns the number of updated records and a sample of changes (first 20)

**Response shape:**
```json
{
  "message": "Updated 14 expense match periods",
  "totalUpdated": 14,
  "updates": [
    {
      "expense": "Netflix",
      "matchId": "...",
      "oldPeriod": "2026-01-01",
      "newPeriod": "2026-02-01"
    }
  ]
}
```

---

## Confidence Scoring

The matching system uses a **static confidence value** rather than a dynamic scoring algorithm. All auto-matched records are assigned a `match_confidence` of `0.95`.

### How it works in practice

Both matching paths -- batch (`matchExpenseToTransactions`) and webhook (`matchSingleTransactionToExpenses`) -- set `match_confidence: 0.95` on every inserted `expense_matches` record. There is no graduated scoring based on how closely the transaction matches; the matching decision itself is binary:

1. **Merchant name match** -- The transaction description must contain the expense's `merchant_name` (case-insensitive partial match via `ILIKE '%merchant%'` for batch, or `String.includes()` for webhook)
2. **Amount tolerance check** -- If `expected_amount_cents` is set, the absolute transaction amount must fall within a tolerance band:
   - Batch matching: +/-10% (configurable via `amountTolerancePercent`)
   - Webhook matching: +/-10% (uses `AMOUNT_TOLERANCE_PERCENT = 10`)
3. **Duplicate prevention** -- Already-matched transaction/expense pairs are excluded

If a transaction passes all checks, it is matched with confidence `0.95`. If it fails any check, it is not matched at all. There is no intermediate confidence level.

The `matched_by` field is always set to `null` for auto-matched records. Manual matches (if implemented) would use this field to record the user who confirmed the match.

### Tolerance differences by matching path

| Matching Path | Amount Tolerance | Use Case |
|---------------|-----------------|----------|
| Batch (`matchExpenseToTransactions`) | +/-10% (configurable) | Historical backfill, rematch operations |
| Webhook (`matchSingleTransactionToExpenses`) | +/-10% (`AMOUNT_TOLERANCE_PERCENT = 10`) | Real-time matching of incoming transactions |

Both matching paths use the same 10% tolerance (`AMOUNT_TOLERANCE_PERCENT = 10`).

---

## Debug Endpoint (`GET /api/debug/expenses`)

**Purpose:** Provides detailed diagnostic information about expense definitions and their matched transactions. This endpoint is restricted to development mode only (`NODE_ENV === 'development'`).

**Query parameters:**
- `name` (optional) -- Filter expenses by name using case-insensitive partial match (ILIKE)

**What it returns:**
For each expense definition matching the query, the response includes:
- Full expense definition fields: `id`, `name`, `merchant_name`, `expected_amount_cents`, `recurrence_type`, `next_due_date`, `is_active`
- Nested `expense_matches` array, each containing:
  - Match metadata: `id`, `transaction_id`, `for_period`, `matched_at`
  - Joined `transactions` data: `id`, `description`, `amount_cents`, `settled_at`, `created_at`
- The `partnership_id` for the current user

**Example usage:**
```
GET /api/debug/expenses                    -- all expenses with matches
GET /api/debug/expenses?name=netflix       -- expenses matching "netflix"
```

**Response shape:**
```json
{
  "expenses": [
    {
      "id": "...",
      "name": "Netflix",
      "merchant_name": "Netflix",
      "expected_amount_cents": 2299,
      "recurrence_type": "monthly",
      "next_due_date": "2026-03-15",
      "is_active": true,
      "expense_matches": [
        {
          "id": "...",
          "transaction_id": "...",
          "for_period": "2026-02-01",
          "matched_at": "2026-02-15T10:30:00Z",
          "transactions": {
            "id": "...",
            "description": "NETFLIX.COM",
            "amount_cents": -2299,
            "settled_at": "2026-02-15T08:00:00Z",
            "created_at": "2026-02-14T22:00:00Z"
          }
        }
      ]
    }
  ],
  "partnership_id": "..."
}
```

**Use cases for debugging:**
- Verify that a specific expense is matching to the correct transactions
- Inspect `for_period` values to ensure period calculation is correct
- Check `next_due_date` to confirm it has been properly advanced
- See all matched transactions for an expense to spot duplicates or incorrect matches
- Confirm `merchant_name` is producing the expected matches against transaction descriptions
