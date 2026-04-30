# Penny tools audit

Generated 2026-04-30. Snapshot of every Penny (AI assistant) tool in
`src/lib/ai-tools.ts`, plus its existing test coverage in
`src/lib/__tests__/ai-tools.test.ts`.

Updated 2026-04-30 (Phase 1 #50): added `describe()` blocks for 7 of the
8 previously-untested tools. `getFIREProgress` remains intentionally
uncovered — gated by `NEXT_PUBLIC_FIRE_ENABLED` and out of v1 scope.

## Summary

- **Total tools defined:** 35
- **Covered by `describe()` in tests:** 34
- **Untested:** 1 (`getFIREProgress`, deferred per v1 scope)

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
| 9 | `comparePeriods` | yes | Happy path + empty-data path (Phase 1 #50) |
| 10 | `getTopMerchants` | yes | All-time + per-month + empty (Phase 1 #50) |
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
| 30 | `updateInvestment` | yes | Happy + not-found + no-partner + multi-match (Phase 1 #50) |
| 31 | `getFinancialHealth` | yes | Shape + no-partner (Phase 1 #50) |
| 32 | `getNetWorthHistory` | yes | Shape + empty + no-partner (Phase 1 #50) |
| 33 | `getGoalDetails` | yes | Shape + empty + no-partner (Phase 1 #50) |
| 34 | `getInvestmentPortfolio` | yes | Shape + empty + no-partner (Phase 1 #50) |
| 35 | `getFIREProgress` | NO | Gated by `NEXT_PUBLIC_FIRE_ENABLED`. Out of v1 scope. |

## What's verified vs not

**Verified (via vitest):** All 34 covered tools pass shape checks against
mocked Supabase responses. Their `execute(args, ctx)` returns the documented
property names with the right types. Result-handling helpers (currency
formatting, date formatting, splits) work end-to-end.

**Not verified:** `getFIREProgress` has no test coverage — it sits behind
the `NEXT_PUBLIC_FIRE_ENABLED` flag and is intentionally deferred until
FIRE returns to GA in v1.1+.

**None of the 35 have been verified live against an authenticated session
on dev.piggyback.finance.** The unit tests use a deep-mocked Supabase client.
A user-driven smoke test (Penny in the actual app, asking real questions)
is the only way to catch real-world bugs.

## Recommended next pass

1. Live-smoke 5 representative questions in Penny against dev:
   - "How much did I spend this month?" -> getSpendingSummary
   - "What's my savings rate?" -> getFinancialHealth
   - "Compare last month to this month" -> comparePeriods
   - "Net worth chart" -> getNetWorthHistory
   - "Pay schedule" -> getPaySchedule
2. If any tool errors live, capture the request/response in
   /api/ai/chat logs and add a regression test.
3. When `NEXT_PUBLIC_FIRE_ENABLED` is flipped on for v1.1, add coverage
   for `getFIREProgress`.

## Out of scope tonight

The user explicitly deferred FIRE features. `getFIREProgress` won't be
reachable until `NEXT_PUBLIC_FIRE_ENABLED=true`. Test coverage gap there
is intentional for v1.
