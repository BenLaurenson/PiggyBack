"use client";

import { Skeleton } from "@/components/ui/skeleton";
import { EmptyStateSkeleton } from "@/components/ui/empty-state-skeleton";
import { useConnectionStatus } from "@/contexts/connection-status-context";

export default function InvestLoading() {
  const { hasAccounts, hasInvestments } = useConnectionStatus();

  if (!hasAccounts) {
    return (
      <div className="min-h-screen pb-24" style={{ backgroundColor: "var(--background)" }}>
        <div className="p-4 md:p-6 lg:p-8">
          <EmptyStateSkeleton />
        </div>
      </div>
    );
  }

  if (!hasInvestments) {
    return (
      <div className="min-h-screen pb-24" style={{ backgroundColor: "var(--background)" }}>
        <div className="p-4 md:p-6 space-y-6">
          <EmptyStateSkeleton />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen pb-24" style={{ backgroundColor: "var(--background)" }}>
      <div className="p-4 md:p-6 lg:p-8">

        {/* ─── Header ─── */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <Skeleton className="h-9 w-32 mb-1" />
            <Skeleton className="h-5 w-28" />
          </div>
          <div className="flex items-center gap-2">
            <Skeleton className="h-10 w-24 rounded-xl" />
            <Skeleton className="h-10 w-28 rounded-xl" />
          </div>
        </div>

        {/* ─── Quick Stats Strip ─── */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4 md:mb-6">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="border-0 shadow-sm rounded-2xl p-4" style={{ backgroundColor: "var(--surface-elevated)" }}>
              <Skeleton className="h-3 w-16 mb-2" />
              <Skeleton className="h-6 w-20" />
            </div>
          ))}
        </div>

        {/* ─── Main 2-column layout ─── */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 md:gap-6">

          {/* ═══ LEFT COLUMN ═══ */}
          <div className="lg:col-span-2 space-y-4 md:space-y-6">

            {/* Portfolio Value + Chart */}
            <div className="border-0 shadow-sm rounded-2xl overflow-hidden" style={{ backgroundColor: "var(--surface-elevated)" }}>
              <div className="p-5 pb-0">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <Skeleton className="h-3 w-24 mb-2" />
                    <Skeleton className="h-10 w-36 mb-1" />
                    <Skeleton className="h-4 w-44" />
                  </div>
                  <div className="flex gap-1 flex-shrink-0">
                    {["1W", "1M", "3M", "6M", "1Y", "ALL"].map((p) => (
                      <Skeleton key={p} className="h-7 w-8 rounded-lg" />
                    ))}
                  </div>
                </div>
              </div>
              <div className="px-2 pb-1">
                <Skeleton className="h-[200px] w-full mt-4 rounded-lg" />
              </div>
              <div className="px-5 py-2.5 flex items-center justify-between border-t" style={{ borderColor: "var(--border)" }}>
                <Skeleton className="h-3 w-16" />
                <Skeleton className="h-3 w-28" />
              </div>
            </div>

            {/* Holdings Table */}
            <div className="border-0 shadow-sm rounded-2xl overflow-hidden" style={{ backgroundColor: "var(--surface-elevated)" }}>
              <div className="px-5 py-3.5 flex items-center justify-between border-b" style={{ borderColor: "var(--border)" }}>
                <Skeleton className="h-5 w-20" />
                <Skeleton className="h-3 w-16" />
              </div>
              {/* Table header */}
              <div className="hidden md:grid grid-cols-[1fr_80px_90px_80px_32px] gap-3 px-5 py-2 border-b" style={{ borderColor: "var(--border)" }}>
                <Skeleton className="h-3 w-10" />
                <Skeleton className="h-3 w-10 ml-auto" />
                <Skeleton className="h-3 w-14 ml-auto" />
                <Skeleton className="h-3 w-12 ml-auto" />
                <span />
              </div>
              {/* Rows */}
              <div className="divide-y" style={{ borderColor: "var(--border)" }}>
                {Array.from({ length: 3 }).map((_, i) => (
                  <div key={i} className="grid grid-cols-[1fr_auto] md:grid-cols-[1fr_80px_90px_80px_32px] gap-3 items-center px-5 py-3">
                    <div className="flex items-center gap-3">
                      <Skeleton className="w-8 h-8 rounded-lg" />
                      <div>
                        <Skeleton className="h-4 w-28 mb-1" />
                        <Skeleton className="h-3 w-16" />
                      </div>
                    </div>
                    <Skeleton className="hidden md:block h-4 w-16 ml-auto" />
                    <Skeleton className="hidden md:block h-4 w-12 ml-auto" />
                    <Skeleton className="hidden md:block h-4 w-10 ml-auto" />
                    <Skeleton className="hidden md:block h-3 w-3 ml-auto rounded" />
                    {/* Mobile value */}
                    <div className="md:hidden text-right">
                      <Skeleton className="h-4 w-16 ml-auto mb-1" />
                      <Skeleton className="h-3 w-10 ml-auto" />
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Performance + Movers side-by-side */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* Performance */}
              <div className="border-0 shadow-sm rounded-2xl overflow-hidden" style={{ backgroundColor: "var(--surface-elevated)" }}>
                <div className="px-5 py-3.5 border-b" style={{ borderColor: "var(--border)" }}>
                  <Skeleton className="h-5 w-28" />
                </div>
                <div className="divide-y" style={{ borderColor: "var(--border)" }}>
                  {Array.from({ length: 4 }).map((_, i) => (
                    <div key={i} className="flex items-center justify-between px-5 py-3">
                      <Skeleton className="h-3 w-16" />
                      <Skeleton className="h-4 w-14" />
                    </div>
                  ))}
                </div>
              </div>
              {/* Movers */}
              <div className="border-0 shadow-sm rounded-2xl overflow-hidden" style={{ backgroundColor: "var(--surface-elevated)" }}>
                <div className="px-5 py-3.5 border-b" style={{ borderColor: "var(--border)" }}>
                  <Skeleton className="h-5 w-20" />
                </div>
                <div className="divide-y" style={{ borderColor: "var(--border)" }}>
                  {Array.from({ length: 3 }).map((_, i) => (
                    <div key={i} className="flex items-center justify-between px-5 py-2.5">
                      <div>
                        <Skeleton className="h-4 w-24 mb-1" />
                        <Skeleton className="h-3 w-10" />
                      </div>
                      <Skeleton className="h-4 w-12" />
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Investment Income (bar chart) */}
            <div className="border-0 shadow-sm rounded-2xl overflow-hidden" style={{ backgroundColor: "var(--surface-elevated)" }}>
              <div className="px-5 py-3.5 flex items-center justify-between border-b" style={{ borderColor: "var(--border)" }}>
                <div className="flex items-center gap-2">
                  <Skeleton className="h-4 w-4 rounded" />
                  <Skeleton className="h-5 w-36" />
                </div>
                <Skeleton className="h-4 w-32" />
              </div>
              <div className="p-3">
                <Skeleton className="h-[120px] w-full rounded-lg" />
              </div>
            </div>
          </div>

          {/* ═══ RIGHT COLUMN (sidebar) ═══ */}
          <div className="space-y-4 md:space-y-6">

            {/* Allocation Donut */}
            <div className="border-0 shadow-sm rounded-2xl overflow-hidden" style={{ backgroundColor: "var(--surface-elevated)" }}>
              <div className="px-5 py-3.5 border-b" style={{ borderColor: "var(--border)" }}>
                <Skeleton className="h-5 w-24" />
              </div>
              <div className="flex items-center justify-center gap-5 p-4">
                <Skeleton className="w-[120px] h-[120px] rounded-full flex-shrink-0" />
                <div className="space-y-3">
                  {Array.from({ length: 3 }).map((_, i) => (
                    <div key={i} className="flex items-center gap-2.5">
                      <Skeleton className="w-3 h-3 rounded-[4px]" />
                      <div>
                        <Skeleton className="h-3.5 w-16 mb-1" />
                        <Skeleton className="h-3 w-12" />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* FIRE Progress */}
            <div className="border-0 shadow-sm rounded-2xl p-4" style={{ backgroundColor: "var(--surface-elevated)" }}>
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <Skeleton className="h-4 w-4 rounded" />
                  <Skeleton className="h-4 w-24" />
                </div>
                <Skeleton className="h-3.5 w-3.5 rounded" />
              </div>
              <div className="flex items-end justify-between mb-1.5">
                <Skeleton className="h-8 w-16" />
                <Skeleton className="h-3 w-24" />
              </div>
              <Skeleton className="h-1.5 w-full rounded-full" />
            </div>

            {/* Budget Contributions */}
            <div className="border-0 shadow-sm rounded-2xl p-4" style={{ backgroundColor: "var(--surface-elevated)" }}>
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <Skeleton className="h-4 w-4 rounded" />
                  <Skeleton className="h-4 w-28" />
                </div>
                <Skeleton className="h-3.5 w-3.5 rounded" />
              </div>
              <Skeleton className="h-8 w-20 mb-1" />
              <Skeleton className="h-3 w-32" />
            </div>

            {/* Watchlist */}
            <div className="border-0 shadow-sm rounded-2xl overflow-hidden" style={{ backgroundColor: "var(--surface-elevated)" }}>
              <div className="px-5 py-3.5 flex items-center justify-between border-b" style={{ borderColor: "var(--border)" }}>
                <div className="flex items-center gap-2">
                  <Skeleton className="h-4 w-4 rounded" />
                  <Skeleton className="h-5 w-20" />
                  <Skeleton className="h-4 w-5 rounded-full" />
                </div>
                <Skeleton className="h-3.5 w-3.5 rounded" />
              </div>
              <div className="divide-y" style={{ borderColor: "var(--border)" }}>
                {Array.from({ length: 2 }).map((_, i) => (
                  <div key={i} className="flex items-center justify-between px-5 py-2.5">
                    <div className="flex items-center gap-2.5">
                      <Skeleton className="w-5 h-5 rounded" />
                      <div>
                        <Skeleton className="h-4 w-24 mb-1" />
                        <Skeleton className="h-3 w-10" />
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Skeleton className="h-4 w-14" />
                      <Skeleton className="h-3 w-3 rounded" />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
