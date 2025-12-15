"use client";

import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { EmptyStateSkeleton } from "@/components/ui/empty-state-skeleton";
import { useConnectionStatus } from "@/contexts/connection-status-context";

export default function DashboardLoading() {
  const { hasAccounts, hasGoals, hasPayday, hasNetWorthData } = useConnectionStatus();

  // ──────────────────────────────────────────────────────────────────────
  // No accounts → Welcome heading + EmptyState card
  // Matches: page.tsx lines 39-50
  // ──────────────────────────────────────────────────────────────────────
  if (!hasAccounts) {
    return (
      <div className="min-h-screen pb-24" style={{ backgroundColor: "var(--background)" }}>
        <div className="p-4 md:p-6 lg:p-8">
          {/* h1 text-3xl font-black → approx h-9 */}
          <Skeleton className="h-9 w-64 mb-6" />
          <EmptyStateSkeleton />
        </div>
      </div>
    );
  }

  // ──────────────────────────────────────────────────────────────────────
  // Has accounts → Full dashboard
  // Matches: DashboardClient layout exactly
  // ──────────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen pb-24" style={{ backgroundColor: "var(--background)" }}>
      <div className="p-4 md:p-6 lg:p-8">

        {/* ══════════════════════════════════════════════════════════════
            HEADER — "Welcome back, {userName}!"
            text-3xl font-black → h-9
        ══════════════════════════════════════════════════════════════ */}
        <div className="flex items-center justify-between mb-6">
          <Skeleton className="h-9 w-64" />
        </div>

        {/* ══════════════════════════════════════════════════════════════
            MAIN GRID — 1 col on mobile, 3 cols on lg (2 left + 1 right)
        ══════════════════════════════════════════════════════════════ */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 md:gap-6">

          {/* ─────────── LEFT COLUMN (lg:col-span-2) ─────────── */}
          <div className="lg:col-span-2 space-y-4 md:space-y-6">

            {/* Financial Pulse Card */}
            <Card className="border-0 shadow-sm" style={{ backgroundColor: "var(--surface-elevated)" }}>
              <CardHeader className="pb-2 flex flex-row items-center justify-between">
                {/* "Financial Pulse" — text-base font-semibold */}
                <Skeleton className="h-5 w-28" />
              </CardHeader>
              <CardContent>
                <div className="flex items-center gap-6">
                  {/* PlanHealthRing size={100} */}
                  <Skeleton className="h-[100px] w-[100px] rounded-full flex-shrink-0" />
                  {/* 2×2 metrics grid */}
                  <div className="flex-1 grid grid-cols-2 gap-3">
                    {Array.from({ length: 4 }).map((_, i) => (
                      <div key={i}>
                        {/* text-[10px] uppercase label */}
                        <Skeleton className="h-2.5 w-20 mb-1.5" />
                        {/* text-lg font-bold value */}
                        <Skeleton className="h-6 w-14" />
                      </div>
                    ))}
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Budget Card */}
            <Card className="border-0 shadow-sm" style={{ backgroundColor: "var(--surface-elevated)" }}>
              <CardHeader className="pb-2 flex flex-row items-center justify-between">
                <div className="flex items-center gap-3">
                  {/* "Budget" — text-base font-semibold */}
                  <Skeleton className="h-5 w-16" />
                  {/* Month/year span */}
                  <Skeleton className="h-4 w-28" />
                </div>
                {/* "View details >" link */}
                <Skeleton className="h-4 w-20" />
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Income row */}
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <Skeleton className="h-4 w-14" />
                    <Skeleton className="h-4 w-16" />
                  </div>
                  <Skeleton className="h-2 w-full rounded-full" />
                </div>
                {/* Spending row */}
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <Skeleton className="h-4 w-12" />
                    <div className="flex items-center gap-2">
                      <Skeleton className="h-4 w-16" />
                      <Skeleton className="h-3 w-24" />
                    </div>
                  </div>
                  <Skeleton className="h-2 w-3/4 rounded-full" />
                </div>
                {/* Top spending categories */}
                <div className="pt-2 border-t" style={{ borderColor: "var(--border)" }}>
                  <Skeleton className="h-3 w-24 mb-3" />
                  <div className="space-y-2">
                    {Array.from({ length: 3 }).map((_, i) => (
                      <div key={i} className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <Skeleton className="h-5 w-5 rounded" />
                          <Skeleton className="h-4 w-24" />
                        </div>
                        <Skeleton className="h-4 w-14" />
                      </div>
                    ))}
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Net Worth Card — ALWAYS rendered when accounts exist.
                The actual component unconditionally renders this card;
                only the sparkline inside is conditional on snapshot count. */}
            <Card className="border-0 shadow-sm" style={{ backgroundColor: "var(--surface-elevated)" }}>
              <CardHeader className="pb-2 flex flex-row items-center justify-between">
                <div className="flex items-center gap-3">
                  {/* "$X,XXX net worth" — text-base font-semibold */}
                  <Skeleton className="h-5 w-40" />
                  {/* TrendingUp/Down icon + net flow amount */}
                  <div className="flex items-center gap-1">
                    <Skeleton className="h-4 w-4 rounded" />
                    <Skeleton className="h-4 w-16" />
                  </div>
                </div>
                {/* "X accounts · Xh ago" */}
                <Skeleton className="h-3 w-32" />
              </CardHeader>
              <CardContent>
                {/* Net worth sparkline area (conditional on snapshots >=2, show skeleton anyway) */}
                {hasNetWorthData && (
                  <div className="mb-3">
                    <Skeleton className="h-3 w-28 mb-1" />
                    <Skeleton className="h-16 w-full rounded-lg" />
                  </div>
                )}
                {/* Net flow bar chart */}
                <Skeleton className="h-28 w-full rounded-lg" />
                {/* Legend: Income / Spending colored squares */}
                <div className="flex items-center justify-center gap-4 mt-2">
                  <div className="flex items-center gap-1.5">
                    <Skeleton className="w-2.5 h-2.5 rounded-sm" />
                    <Skeleton className="h-2.5 w-12" />
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Skeleton className="w-2.5 h-2.5 rounded-sm" />
                    <Skeleton className="h-2.5 w-14" />
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Goals Card — conditional on hasGoals */}
            {hasGoals && (
              <Card className="border-0 shadow-sm" style={{ backgroundColor: "var(--surface-elevated)" }}>
                <CardHeader className="pb-2 flex flex-row items-center justify-between">
                  {/* "Goals" — text-base font-semibold */}
                  <Skeleton className="h-5 w-14" />
                  {/* "View all >" link */}
                  <Skeleton className="h-4 w-16" />
                </CardHeader>
                <CardContent className="space-y-4">
                  {Array.from({ length: 3 }).map((_, i) => (
                    <div key={i} className="flex items-center gap-3 p-2">
                      {/* Goal icon — w-12 h-12 rounded-xl */}
                      <Skeleton className="w-12 h-12 rounded-xl flex-shrink-0" />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between mb-1">
                          {/* Goal name — text-sm uppercase */}
                          <Skeleton className="h-3.5 w-24" />
                          {/* "XX% · $X to go" */}
                          <Skeleton className="h-3 w-28" />
                        </div>
                        {/* Current amount — text-lg font-bold */}
                        <Skeleton className="h-5 w-20 mb-2" />
                        {/* Progress bar — h-1.5 */}
                        <Skeleton className="h-1.5 w-full rounded-full" />
                      </div>
                    </div>
                  ))}
                </CardContent>
              </Card>
            )}
          </div>

          {/* ─────────── RIGHT COLUMN ─────────── */}
          <div className="space-y-4 md:space-y-6">

            {/* Spending Chart Card */}
            <Card className="border-0 shadow-sm" style={{ backgroundColor: "var(--surface-elevated)" }}>
              <CardHeader className="pb-2 flex flex-row items-center justify-between">
                <div>
                  {/* "Spending" — text-base font-semibold */}
                  <Skeleton className="h-5 w-20" />
                  {/* "$X,XXX this month" — text-xs */}
                  <Skeleton className="h-3 w-32 mt-0.5" />
                </div>
              </CardHeader>
              <CardContent>
                {/* AreaChart h-36 */}
                <Skeleton className="h-36 w-full rounded-lg" />
              </CardContent>
            </Card>

            {/* Transactions Card */}
            <Card className="border-0 shadow-sm" style={{ backgroundColor: "var(--surface-elevated)" }}>
              <CardHeader className="pb-2 flex flex-row items-center justify-between">
                <div className="flex items-center gap-3">
                  {/* "Transactions" — text-base font-semibold */}
                  <Skeleton className="h-5 w-24" />
                  {/* "Most recent" — text-xs */}
                  <Skeleton className="h-3 w-20" />
                </div>
                {/* "All >" link */}
                <Skeleton className="h-4 w-8" />
              </CardHeader>
              <CardContent className="p-0">
                <div className="divide-y" style={{ borderColor: "var(--border)" }}>
                  {Array.from({ length: 5 }).map((_, i) => (
                    <div key={i} className="flex items-center gap-3 px-4 py-3">
                      {/* Emoji icon — text-lg */}
                      <Skeleton className="h-5 w-5 rounded" />
                      <div className="flex-1 min-w-0">
                        {/* Description — text-sm truncate */}
                        <Skeleton className="h-4 w-3/4 mb-1" />
                        {/* Category — text-xs */}
                        <Skeleton className="h-3 w-1/3" />
                      </div>
                      {/* Amount — text-sm font-semibold */}
                      <Skeleton className="h-4 w-14" />
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            {/* Recurring Expenses Card
                Matches RecurringExpensesCard: Card > CardHeader + CardContent
                Items have p-2 rounded-lg with surface background, gap-2.5 */}
            <Card className="border-0 shadow-sm" style={{ backgroundColor: "var(--surface-elevated)" }}>
              <CardHeader className="pb-2 flex flex-row items-center justify-between">
                <div className="flex items-center gap-2">
                  {/* "Recurring Expenses" — text-base font-semibold */}
                  <Skeleton className="h-5 w-36" />
                  {/* Badge with count */}
                  <Skeleton className="h-4 w-5 rounded-full" />
                </div>
                {/* "$X,XXX/mo" range */}
                <Skeleton className="h-3 w-20" />
              </CardHeader>
              <CardContent className="space-y-1.5">
                {Array.from({ length: 3 }).map((_, i) => (
                  <div
                    key={i}
                    className="flex items-center gap-2.5 p-2 rounded-lg"
                    style={{ backgroundColor: "var(--surface)" }}
                  >
                    {/* Emoji — text-lg */}
                    <Skeleton className="h-5 w-5 rounded flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      {/* Expense name — text-sm font-medium */}
                      <Skeleton className="h-4 w-24 mb-1" />
                      {/* Due date — text-xs */}
                      <Skeleton className="h-3 w-16" />
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      {/* Amount — text-sm font-medium */}
                      <Skeleton className="h-4 w-14" />
                      {/* Status icon — h-4 w-4 */}
                      <Skeleton className="h-4 w-4 rounded-full" />
                    </div>
                  </div>
                ))}
              </CardContent>

              {/* Payday row — rendered as children of RecurringExpensesCard */}
              {hasPayday && (
                <div className="px-4 pb-4 pt-1">
                  <div className="flex items-center justify-between border-t pt-3" style={{ borderColor: "var(--border)" }}>
                    <div className="flex items-center gap-2.5">
                      {/* 💰 emoji — text-lg */}
                      <Skeleton className="h-5 w-5 rounded flex-shrink-0" />
                      <div className="flex-1 min-w-0">
                        {/* "Payday" — text-sm font-medium */}
                        <Skeleton className="h-4 w-16 mb-1" />
                        {/* "In X days" — text-xs */}
                        <Skeleton className="h-3 w-14" />
                      </div>
                    </div>
                    {/* Pay amount — text-sm font-semibold */}
                    <Skeleton className="h-4 w-16 flex-shrink-0" />
                  </div>
                </div>
              )}
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}
