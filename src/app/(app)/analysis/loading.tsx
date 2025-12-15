"use client";

import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { EmptyStateSkeleton } from "@/components/ui/empty-state-skeleton";
import { useConnectionStatus } from "@/contexts/connection-status-context";

export default function AnalysisLoading() {
  const { hasAccounts } = useConnectionStatus();

  if (!hasAccounts) {
    return (
      <div className="p-4 md:p-6">
        <EmptyStateSkeleton />
      </div>
    );
  }

  return (
    <div
      className="min-h-screen pb-24"
      style={{ backgroundColor: "var(--background)" }}
    >
      <div className="p-4 md:p-6 lg:p-8">
        {/* Header — title + subtitle with space-y-1 mb-6 */}
        <div className="space-y-1 mb-6">
          <Skeleton className="h-9 w-28" />
          <Skeleton className="h-5 w-72" />
        </div>

        <div className="space-y-6">
          {/* Time Range Selector — right-aligned pill group + custom button */}
          <div className="flex items-center justify-end flex-wrap gap-2">
            <div className="flex items-center gap-2">
              <div
                className="inline-flex rounded-xl p-1"
                style={{ background: "var(--muted)" }}
              >
                {["1M", "3M", "6M", "12M", "All"].map((label) => (
                  <Skeleton
                    key={label}
                    className="h-8 w-10 rounded-lg mx-0.5"
                  />
                ))}
              </div>
              <Skeleton className="h-8 w-20 rounded-lg" />
            </div>
          </div>

          {/* Key Metrics Cards — 2x4 grid with pastel backgrounds */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[
              { bg: "var(--pastel-coral-light)" },
              { bg: "var(--pastel-blue-light)" },
              { bg: "var(--pastel-mint-light)" },
              { bg: "var(--surface-elevated)" },
            ].map((card, i) => (
              <Card
                key={i}
                className="border-0 shadow-sm rounded-2xl overflow-hidden"
                style={{ backgroundColor: card.bg }}
              >
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <Skeleton className="h-5 w-5 rounded" />
                    <Skeleton className="h-3 w-20" />
                  </div>
                  <Skeleton className="h-7 w-24 mb-1" />
                  <Skeleton className="h-3 w-16" />
                </CardContent>
              </Card>
            ))}
          </div>

          {/* Charts Grid — 2-col, 3 charts: trend, donut, income-vs-expenses */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Monthly Spending Trend */}
            <Card
              className="border rounded-2xl"
              style={{
                borderColor: "var(--border)",
                background: "var(--card)",
              }}
            >
              <CardHeader className="pb-2">
                <div className="flex items-center gap-2 justify-between">
                  <div className="flex items-center gap-2">
                    <Skeleton className="h-4 w-4 rounded" />
                    <Skeleton className="h-5 w-40" />
                  </div>
                  <Skeleton className="h-6 w-6 rounded" />
                </div>
              </CardHeader>
              <CardContent>
                <Skeleton className="h-64 w-full rounded-lg" />
              </CardContent>
            </Card>

            {/* Spending by Category (Donut) */}
            <Card
              className="border rounded-2xl"
              style={{
                borderColor: "var(--border)",
                background: "var(--card)",
              }}
            >
              <CardHeader className="pb-2">
                <div className="flex items-center gap-2 justify-between">
                  <div className="flex items-center gap-2">
                    <Skeleton className="h-4 w-4 rounded" />
                    <Skeleton className="h-5 w-36" />
                  </div>
                  <Skeleton className="h-6 w-6 rounded" />
                </div>
              </CardHeader>
              <CardContent>
                <div className="h-64 flex items-center justify-center">
                  <Skeleton className="h-44 w-44 rounded-full" />
                </div>
                <div className="flex flex-wrap justify-center gap-2 mt-2">
                  {Array.from({ length: 5 }).map((_, i) => (
                    <div key={i} className="flex items-center gap-1">
                      <Skeleton className="w-2.5 h-2.5 rounded-full" />
                      <Skeleton className="h-3 w-16" />
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            {/* Income vs Expenses */}
            <Card
              className="border rounded-2xl"
              style={{
                borderColor: "var(--border)",
                background: "var(--card)",
              }}
            >
              <CardHeader className="pb-2">
                <div className="flex items-center gap-2 justify-between">
                  <div className="flex items-center gap-2">
                    <Skeleton className="h-4 w-4 rounded" />
                    <Skeleton className="h-5 w-36" />
                  </div>
                  <Skeleton className="h-6 w-6 rounded" />
                </div>
              </CardHeader>
              <CardContent>
                <Skeleton className="h-64 w-full rounded-lg" />
              </CardContent>
            </Card>
          </div>

          {/* Money Flow (full-width) */}
          <Card
            className="border rounded-2xl"
            style={{
              borderColor: "var(--border)",
              background: "var(--card)",
            }}
          >
            <CardHeader className="pb-2">
              <div className="flex items-center gap-2 justify-between">
                <div className="flex items-center gap-2">
                  <Skeleton className="h-4 w-4 rounded" />
                  <Skeleton className="h-5 w-24" />
                </div>
                <Skeleton className="h-6 w-6 rounded" />
              </div>
              <Skeleton className="h-3 w-72 mt-1" />
            </CardHeader>
            <CardContent>
              <Skeleton className="h-[500px] w-full rounded-lg" />
            </CardContent>
          </Card>

          {/* Category Analysis Table (full-width) */}
          <Card
            className="border rounded-2xl"
            style={{
              borderColor: "var(--border)",
              background: "var(--card)",
            }}
          >
            <CardHeader className="pb-2">
              <div className="flex items-center gap-2 justify-between">
                <Skeleton className="h-5 w-36" />
                <Skeleton className="h-6 w-6 rounded" />
              </div>
            </CardHeader>
            <CardContent>
              {/* Table header row */}
              <div
                className="flex items-center justify-between py-2 border-b mb-2"
                style={{ borderColor: "var(--border)" }}
              >
                <Skeleton className="h-3 w-16" />
                <div className="flex items-center gap-6">
                  <Skeleton className="h-3 w-10" />
                  <Skeleton className="h-3 w-16 hidden sm:block" />
                  <Skeleton className="h-3 w-14 hidden md:block" />
                  <Skeleton className="h-3 w-10" />
                </div>
              </div>
              {/* Table rows */}
              <div className="space-y-0">
                {Array.from({ length: 6 }).map((_, i) => (
                  <div
                    key={i}
                    className="flex items-center justify-between py-3 border-b last:border-b-0"
                    style={{ borderColor: "var(--border)" }}
                  >
                    <div className="flex items-center gap-2">
                      <Skeleton className="h-5 w-5 rounded" />
                      <div className="flex flex-col gap-1">
                        <Skeleton className="h-4 w-28" />
                        <Skeleton className="h-2.5 w-16" />
                      </div>
                    </div>
                    <div className="flex items-center gap-6">
                      <Skeleton className="h-4 w-16" />
                      <Skeleton className="h-4 w-14 hidden sm:block" />
                      <Skeleton className="h-5 w-12 rounded-full hidden md:block" />
                      <Skeleton className="h-4 w-10" />
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
