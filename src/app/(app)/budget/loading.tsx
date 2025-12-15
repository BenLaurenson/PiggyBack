"use client";

import { useSearchParams } from "next/navigation";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyStateSkeleton } from "@/components/ui/empty-state-skeleton";
import { useConnectionStatus } from "@/contexts/connection-status-context";

function BudgetDetailSkeleton() {
  return (
    <div
      className="min-h-screen pb-24"
      style={{ backgroundColor: "var(--background)" }}
    >
      <div className="p-4 md:p-6 lg:p-8">
        {/* Back button: "All Budgets" */}
        <div className="mb-4 md:mb-6">
          <Skeleton className="h-9 w-28 rounded-lg mb-3 -ml-2" />

          {/* Header: emoji + name + star + methodology label */}
          <div className="flex items-center gap-3">
            <Skeleton className="h-9 w-9 rounded flex-shrink-0" />
            <div>
              <div className="flex items-center gap-2">
                <Skeleton className="h-7 md:h-8 w-40" />
                <Skeleton className="w-4 h-4 rounded" />
              </div>
              <Skeleton className="h-3 w-32 mt-1" />
            </div>
          </div>
        </div>

        {/* Underline tabs: Overview | Recurring (mobile) | Settings */}
        <div className="flex gap-4 mb-4 md:mb-6 border-b" style={{ borderColor: "var(--border)" }}>
          <Skeleton className="h-9 w-24 rounded-none" />
          <Skeleton className="h-9 w-24 rounded-none lg:hidden" />
          <Skeleton className="h-9 w-20 rounded-none" />
        </div>

        {/* Overview tab content */}
        <div className="space-y-3 md:space-y-4">
          {/* BudgetOverviewStrip */}
          <div
            className="flex items-center justify-between gap-3 px-4 py-3 md:px-5 md:py-4 rounded-2xl shadow-sm"
            style={{ backgroundColor: "var(--surface-elevated)" }}
          >
            {/* Left: stats + TBB */}
            <div className="flex items-center gap-3 md:gap-4 min-w-0">
              {/* Income (desktop only) */}
              <div className="hidden md:flex flex-col items-start">
                <Skeleton className="h-2.5 w-10 mb-1" />
                <Skeleton className="h-3.5 w-14" />
              </div>
              <div className="hidden md:block w-px h-7" style={{ backgroundColor: "var(--border)" }} />

              {/* Budgeted (desktop only) */}
              <div className="hidden md:flex flex-col items-start">
                <Skeleton className="h-2.5 w-14 mb-1" />
                <Skeleton className="h-3.5 w-14" />
              </div>
              <div className="hidden md:block w-px h-7" style={{ backgroundColor: "var(--border)" }} />

              {/* Spent (desktop only) */}
              <div className="hidden md:flex flex-col items-start">
                <Skeleton className="h-2.5 w-10 mb-1" />
                <Skeleton className="h-3.5 w-14" />
              </div>
              <div className="hidden md:block w-px h-7" style={{ backgroundColor: "var(--border)" }} />

              {/* TBB big number */}
              <div className="flex items-baseline gap-1.5 md:gap-2">
                <Skeleton className="h-6 md:h-8 w-20" />
                <Skeleton className="h-3 md:h-3.5 w-10 md:w-20" />
              </div>
            </div>

            {/* Right: period navigation */}
            <div className="flex items-center flex-shrink-0">
              <Skeleton className="h-9 w-9 md:h-11 md:w-11 rounded-xl" />
              <Skeleton className="h-4 md:h-5 w-[60px] md:w-[160px] mx-1" />
              <Skeleton className="h-9 w-9 md:h-11 md:w-11 rounded-xl" />
            </div>
          </div>

          {/* Main content: table + sidebar */}
          <div className="space-y-3">
            <div className="flex gap-4">
              {/* Budget Table (left, flex-1) */}
              <div className="flex-1 min-w-0">
                <div
                  className="rounded-2xl shadow-sm overflow-hidden"
                  style={{ backgroundColor: "var(--surface-elevated)" }}
                >
                  {/* Section header */}
                  <div
                    className="flex items-center gap-2 px-4 py-2.5 border-b"
                    style={{ borderColor: "var(--border)" }}
                  >
                    <Skeleton className="h-4 w-4 rounded" />
                    <Skeleton className="h-4 w-20" />
                    <Skeleton className="h-3.5 w-8 rounded-full ml-auto" />
                  </div>

                  {/* Category rows */}
                  {Array.from({ length: 5 }).map((_, i) => (
                    <div
                      key={i}
                      className="flex items-center gap-3 px-4 py-2.5 border-b last:border-b-0"
                      style={{ borderColor: "var(--border)" }}
                    >
                      <Skeleton className="h-5 w-5 rounded flex-shrink-0" />
                      <Skeleton className="h-4 w-24 flex-1" />
                      <Skeleton className="h-1.5 w-16 rounded-full hidden md:block" />
                      <Skeleton className="h-4 w-16" />
                      <Skeleton className="h-4 w-14 hidden md:block" />
                    </div>
                  ))}

                  {/* Second section header */}
                  <div
                    className="flex items-center gap-2 px-4 py-2.5 border-b border-t"
                    style={{ borderColor: "var(--border)" }}
                  >
                    <Skeleton className="h-4 w-4 rounded" />
                    <Skeleton className="h-4 w-16" />
                    <Skeleton className="h-3.5 w-8 rounded-full ml-auto" />
                  </div>

                  {/* More rows */}
                  {Array.from({ length: 3 }).map((_, i) => (
                    <div
                      key={`s2-${i}`}
                      className="flex items-center gap-3 px-4 py-2.5 border-b last:border-b-0"
                      style={{ borderColor: "var(--border)" }}
                    >
                      <Skeleton className="h-5 w-5 rounded flex-shrink-0" />
                      <Skeleton className="h-4 w-20 flex-1" />
                      <Skeleton className="h-1.5 w-16 rounded-full hidden md:block" />
                      <Skeleton className="h-4 w-14" />
                      <Skeleton className="h-4 w-12 hidden md:block" />
                    </div>
                  ))}
                </div>
              </div>

              {/* Expenses Sidebar (desktop only) */}
              <div className="hidden lg:block w-[320px] flex-shrink-0">
                <div
                  className="rounded-2xl shadow-sm overflow-hidden"
                  style={{ backgroundColor: "var(--surface-elevated)" }}
                >
                  {/* Sidebar header */}
                  <div className="px-4 py-3 flex items-center justify-between border-b" style={{ borderColor: "var(--border)" }}>
                    <div className="flex items-center gap-2">
                      <Skeleton className="h-4 w-4 rounded" />
                      <Skeleton className="h-4 w-20" />
                      <Skeleton className="h-4 w-5 rounded-full" />
                    </div>
                    <Skeleton className="h-6 w-6 rounded" />
                  </div>

                  {/* Paid section */}
                  <div className="px-4 py-3 border-b" style={{ borderColor: "var(--border)" }}>
                    <Skeleton className="h-3 w-24 mb-2" />
                    {Array.from({ length: 2 }).map((_, i) => (
                      <div
                        key={i}
                        className="flex items-center gap-2.5 p-2 rounded-lg mb-1.5"
                        style={{ backgroundColor: "var(--surface)" }}
                      >
                        <Skeleton className="h-5 w-5 rounded flex-shrink-0" />
                        <div className="flex-1 min-w-0">
                          <Skeleton className="h-3.5 w-20 mb-1" />
                          <Skeleton className="h-2.5 w-14" />
                        </div>
                        <div className="flex items-center gap-2 flex-shrink-0">
                          <Skeleton className="h-3.5 w-12" />
                          <Skeleton className="h-4 w-4 rounded-full" />
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Upcoming section */}
                  <div className="px-4 py-3">
                    <Skeleton className="h-3 w-20 mb-2" />
                    {Array.from({ length: 3 }).map((_, i) => (
                      <div
                        key={i}
                        className="flex items-center gap-2.5 p-2 rounded-lg mb-1.5"
                        style={{ backgroundColor: "var(--surface)" }}
                      >
                        <Skeleton className="h-5 w-5 rounded flex-shrink-0" />
                        <div className="flex-1 min-w-0">
                          <Skeleton className="h-3.5 w-24 mb-1" />
                          <Skeleton className="h-2.5 w-16" />
                        </div>
                        <div className="flex items-center gap-2 flex-shrink-0">
                          <Skeleton className="h-3.5 w-14" />
                          <Skeleton className="h-4 w-4 rounded-full" />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function BudgetListSkeleton() {
  return (
    <div
      className="p-4 md:p-6 lg:p-8 min-h-screen pb-24"
      style={{ backgroundColor: "var(--background)" }}
    >
      {/* Header: "Your Budgets" + subtitle + New Budget button */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <Skeleton className="h-9 w-48" />
          <Skeleton className="h-5 w-44 mt-1" />
        </div>
        <Skeleton className="h-9 w-32 rounded-xl" />
      </div>

      {/* Main 3-column layout */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 md:gap-6">
        {/* LEFT COLUMN */}
        <div className="lg:col-span-2 space-y-4 md:space-y-6">

          {/* Hero Card — Default Budget */}
          <div
            className="border-0 shadow-sm rounded-2xl overflow-hidden"
            style={{ backgroundColor: "var(--surface-elevated)" }}
          >
            <div className="p-5 pb-0">
              {/* Budget info: emoji + name + star + menu */}
              <div className="flex items-start justify-between gap-4">
                <div className="flex items-center gap-3">
                  <Skeleton className="w-12 h-12 rounded-xl flex-shrink-0" />
                  <div>
                    <div className="flex items-center gap-2">
                      <Skeleton className="h-6 w-32" />
                      <Skeleton className="w-4 h-4 rounded" />
                    </div>
                    {/* Tags: methodology + period + view */}
                    <div className="flex items-center gap-2 mt-1.5">
                      <Skeleton className="h-4 w-14 rounded-full" />
                      <Skeleton className="h-4 w-14 rounded-full" />
                      <Skeleton className="h-4 w-10 rounded-full" />
                    </div>
                  </div>
                </div>
                <Skeleton className="h-8 w-8 rounded" />
              </div>

              {/* TOTAL ASSIGNED big number */}
              <div className="mt-4">
                <Skeleton className="h-2.5 w-24 mb-2" />
                <Skeleton className="h-10 md:h-12 w-20" />
              </div>
            </div>

            {/* Bottom stats row: Assigned / Spent / Remaining */}
            <div
              className="px-5 py-3 mt-4 border-t grid grid-cols-3 gap-3"
              style={{ borderColor: "var(--border)" }}
            >
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i}>
                  <Skeleton className="h-2.5 w-14 mb-1.5" />
                  <Skeleton className="h-4 w-12" />
                </div>
              ))}
            </div>
          </div>

          {/* All Budgets Table */}
          <div
            className="border-0 shadow-sm rounded-2xl overflow-hidden"
            style={{ backgroundColor: "var(--surface-elevated)" }}
          >
            {/* Table header */}
            <div
              className="px-5 py-3.5 flex items-center justify-between border-b"
              style={{ borderColor: "var(--border)" }}
            >
              <Skeleton className="h-5 w-24" />
              <Skeleton className="h-3 w-16" />
            </div>

            {/* Desktop column headers */}
            <div
              className="hidden md:grid grid-cols-[1fr_90px_100px_80px_32px] gap-3 px-5 py-2 border-b"
              style={{ borderColor: "var(--border)" }}
            >
              <Skeleton className="h-2.5 w-12" />
              <Skeleton className="h-2.5 w-14 ml-auto" />
              <Skeleton className="h-2.5 w-14 ml-auto" />
              <Skeleton className="h-2.5 w-10 ml-auto" />
              <span />
            </div>

            {/* Budget rows */}
            <div className="divide-y" style={{ borderColor: "var(--border)" }}>
              {Array.from({ length: 2 }).map((_, i) => (
                <div
                  key={i}
                  className="grid grid-cols-[1fr_auto] md:grid-cols-[1fr_90px_100px_80px_32px] gap-3 items-center px-5 py-3"
                >
                  {/* Budget name + metadata */}
                  <div className="flex items-center gap-3 min-w-0">
                    <Skeleton className="w-10 h-10 rounded-xl flex-shrink-0" />
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5">
                        <Skeleton className="h-4 w-24" />
                        <Skeleton className="w-3 h-3 rounded" />
                      </div>
                      <Skeleton className="h-2.5 w-28 mt-1" />
                    </div>
                  </div>

                  {/* Mobile: value + status */}
                  <div className="md:hidden text-right space-y-1">
                    <Skeleton className="h-4 w-10 ml-auto" />
                  </div>

                  {/* Desktop: Progress */}
                  <div className="hidden md:flex items-center justify-end gap-2">
                    <Skeleton className="h-1.5 w-14 rounded-full" />
                  </div>

                  {/* Desktop: Assigned */}
                  <div className="hidden md:block text-right">
                    <Skeleton className="h-4 w-10 ml-auto" />
                  </div>

                  {/* Desktop: Status */}
                  <div className="hidden md:flex justify-end">
                    <Skeleton className="h-4 w-10 ml-auto" />
                  </div>

                  {/* Desktop: Actions */}
                  <div className="hidden md:block" />
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* RIGHT COLUMN (Sidebar) */}
        <div className="space-y-4 md:space-y-6">
          {/* Recurring Expenses Card */}
          <div
            className="border-0 shadow-sm rounded-2xl overflow-hidden"
            style={{ backgroundColor: "var(--surface-elevated)" }}
          >
            {/* Header: title + badge + monthly range */}
            <div className="pb-2 flex flex-row items-center justify-between px-5 pt-5">
              <div className="flex items-center gap-2">
                <Skeleton className="h-5 w-36" />
                <Skeleton className="h-4 w-5 rounded-full" />
              </div>
              <Skeleton className="h-3 w-20" />
            </div>
            {/* Expense items */}
            <div className="px-5 pb-5 space-y-1.5">
              {Array.from({ length: 3 }).map((_, i) => (
                <div
                  key={i}
                  className="flex items-center gap-2.5 p-2 rounded-lg"
                  style={{ backgroundColor: "var(--surface)" }}
                >
                  {/* Emoji */}
                  <Skeleton className="h-5 w-5 rounded flex-shrink-0" />
                  {/* Name + date */}
                  <div className="flex-1 min-w-0">
                    <Skeleton className="h-3.5 w-24 mb-1" />
                    <Skeleton className="h-2.5 w-16" />
                  </div>
                  {/* Amount + status */}
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <Skeleton className="h-3.5 w-14" />
                    <Skeleton className="h-4 w-4 rounded-full" />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function BudgetLoading() {
  const { hasAccounts } = useConnectionStatus();
  const searchParams = useSearchParams();
  const hasBudgetId = searchParams.get("id");

  if (!hasAccounts) {
    return (
      <div className="px-4 py-4 md:px-6 md:py-5 lg:px-8" style={{ backgroundColor: "var(--background)" }}>
        <EmptyStateSkeleton />
      </div>
    );
  }

  if (hasBudgetId) {
    return <BudgetDetailSkeleton />;
  }

  return <BudgetListSkeleton />;
}
