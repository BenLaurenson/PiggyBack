# Penny tools audit

Generated 2026-04-30. Snapshot of every Penny (AI assistant) tool in
`src/lib/ai-tools.ts`, plus its existing test coverage in
`src/lib/__tests__/ai-tools.test.ts`.

## Summary

- **Total tools defined:** 35
- **Covered by `describe()` in tests:** 27
- **Untested:** 8

## Status by tool

| # | Tool | Tested | Notes |
|---|---|---|---|
| 1 | `searchTransactions` | yes | Multiple test cases inc. shape + dollar formatting |
| 2 | `getSpendingSummary` | yes | |
| 3 | `getIncomeSummary` | yes | |
| 4 | `getAccountBalances` | yes | Tested for shape + per-account details |
| 5 | `getUpcomingBills` | yes | |
| 6 | `getSavingsGoals` | yes | Empty + populated paths |
| 7 | `getMonthlyTrends` | yes | |
| 8 | `getMerchantSpending` | yes | |
| 9 | `comparePeriods` | NO | No test coverage |
| 10 | `getTopMerchants` | NO | No test coverage |
| 11 | `getBudgetStatus` | yes | |
| 12 | `getPaySchedule` | yes | |
| 13 | `getCategoryList` | yes | |
| 14 | `getDailySpending` | yes | |
| 15 | `queryFinancialData` | yes | Multiple table-name + filter cases |
| 16 | `getSpendingVelocity` | yes | Tested for daily-burn + projection |
| 17 | `getCashflowForecast` | yes | Multiple horizon + projection cases |
| 18 | `getSubscriptionCostTrajectory` | yes | |
| 19 | `getCoupleSplitAnalysis` | yes | Including no-partner path |
| 20 | `detectRecurringExpenses` | yes | |
| 21 | `detectIncomePatterns` | yes | |
| 22 | `createBudget` | yes | |
| 23 | `createBudgetAssignment` | yes | Inc. no-partner-error path |
| 24 | `createExpenseDefinition` | yes | |
| 25 | `createSavingsGoal` | yes | |
| 26 | `updateSavingsGoal` | yes | |
| 27 | `recategorizeTransaction` | yes | |
| 28 | `createIncomeSource` | yes | |
| 29 | `createInvestment` | yes | |
| 30 | `updateInvestment` | NO | No test coverage |
| 31 | `getFinancialHealth` | NO | No test coverage |
| 32 | `getNetWorthHistory` | NO | No test coverage |
| 33 | `getGoalDetails` | NO | No test coverage |
| 34 | `getInvestmentPortfolio` | NO | No test coverage |
| 35 | `getFIREProgress` | NO | No test coverage. Will be moot once FIRE returns to GA. |

## What's verified vs not

**Verified (via vitest):** All 27 tested tools pass shape checks against
mocked Supabase responses. Their `execute(args, ctx)` returns the documented
property names with the right types. Result-handling helpers (currency
formatting, date formatting, splits) work end-to-end.

**Not verified:** The 8 untested tools have not been called from the test
suite. They may have:
- Drift in their return shape vs the JSDoc.
- Missing null-guards that crash on edge inputs.
- Schema mismatches against the live Supabase tables they query.

**None of the 35 have been verified live against an authenticated session
on dev.piggyback.finance.** The unit tests use a deep-mocked Supabase client.
A user-driven smoke test (Penny in the actual app, asking real questions)
is the only way to catch real-world bugs.

## Recommended next pass

1. Add `describe()` blocks for the 8 untested tools — same shape as the
   existing tests (mock Supabase, call `runTool`, assert keys present).
2. Live-smoke 5 representative questions in Penny against dev:
   - "How much did I spend this month?" -> getSpendingSummary
   - "What's my savings rate?" -> getFinancialHealth (untested)
   - "Compare last month to this month" -> comparePeriods (untested)
   - "Net worth chart" -> getNetWorthHistory (untested)
   - "Pay schedule" -> getPaySchedule
3. If any tool errors live, capture the request/response in
   /api/ai/chat logs and add a regression test.

## Out of scope tonight

The user explicitly deferred FIRE features. `getFIREProgress` won't be
reachable until `NEXT_PUBLIC_FIRE_ENABLED=true`. Test coverage gap there
is intentional for v1.
