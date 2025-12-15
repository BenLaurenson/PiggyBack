"use client";

import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyStateSkeleton } from "@/components/ui/empty-state-skeleton";
import { useConnectionStatus } from "@/contexts/connection-status-context";

export default function ActivityLoading() {
  const { hasAccounts } = useConnectionStatus();

  if (!hasAccounts) {
    return (
      <div className="p-4 md:p-6 space-y-6">
        <div className="space-y-1">
          <Skeleton className="h-9 w-24" />
          <Skeleton className="h-5 w-56" />
        </div>
        <EmptyStateSkeleton />
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 space-y-6">
      {/* Header */}
      <div className="space-y-1">
        <Skeleton className="h-9 w-24" />
        <Skeleton className="h-5 w-56" />
      </div>

      {/* Summary Cards - 2-column pastel gradient style */}
      <div className="grid grid-cols-2 gap-3 md:gap-4">
        {/* Spending Card */}
        <Card
          className="relative overflow-hidden border-0 shadow-lg"
          style={{ backgroundColor: "var(--pastel-coral-light)" }}
        >
          {/* Decorative circles */}
          <div
            className="absolute -top-4 -right-4 w-24 h-24 rounded-full opacity-20"
            style={{ backgroundColor: "var(--pastel-coral-dark)" }}
          />
          <div
            className="absolute -bottom-6 -left-6 w-20 h-20 rounded-full opacity-15"
            style={{ backgroundColor: "var(--pastel-coral-dark)" }}
          />
          <CardHeader className="pb-1 relative z-10 p-3 md:p-6">
            <div className="flex items-center gap-2">
              <div
                className="p-1.5 rounded-lg"
                style={{ backgroundColor: "rgba(255,255,255,0.4)" }}
              >
                <Skeleton className="h-4 w-4 rounded-sm" />
              </div>
              <Skeleton className="h-4 w-16" />
            </div>
          </CardHeader>
          <CardContent className="relative z-10 pt-0 px-3 pb-3 md:px-6 md:pb-6">
            <Skeleton className="h-8 md:h-9 w-32 mb-1" />
            <Skeleton className="h-3 w-36" />
          </CardContent>
        </Card>

        {/* Income Card */}
        <Card
          className="relative overflow-hidden border-0 shadow-lg"
          style={{ backgroundColor: "var(--pastel-mint-light)" }}
        >
          {/* Decorative circles */}
          <div
            className="absolute -top-4 -right-4 w-24 h-24 rounded-full opacity-20"
            style={{ backgroundColor: "var(--pastel-mint-dark)" }}
          />
          <div
            className="absolute -bottom-6 -left-6 w-20 h-20 rounded-full opacity-15"
            style={{ backgroundColor: "var(--pastel-mint-dark)" }}
          />
          <CardHeader className="pb-1 relative z-10 p-3 md:p-6">
            <div className="flex items-center gap-2">
              <div
                className="p-1.5 rounded-lg"
                style={{ backgroundColor: "rgba(255,255,255,0.4)" }}
              >
                <Skeleton className="h-4 w-4 rounded-sm" />
              </div>
              <Skeleton className="h-4 w-14" />
            </div>
          </CardHeader>
          <CardContent className="relative z-10 pt-0 px-3 pb-3 md:px-6 md:pb-6">
            <Skeleton className="h-8 md:h-9 w-28 mb-1" />
            <Skeleton className="h-3 w-28" />
          </CardContent>
        </Card>
      </div>

      {/* Enhanced Filters - Card with search, chips, and filter button */}
      <Card
        className="border-0 shadow-lg overflow-hidden"
        style={{ backgroundColor: "var(--surface-elevated)" }}
      >
        <CardContent className="pt-3 md:pt-4 space-y-2 md:space-y-3">
          {/* Search Bar */}
          <Skeleton className="h-10 md:h-11 w-full rounded-xl" />

          {/* Quick Date Chips Row */}
          <div className="flex gap-2 flex-wrap">
            <Skeleton className="h-8 w-[76px] rounded-full" />
            <Skeleton className="h-8 w-[88px] rounded-full" />
            <Skeleton className="h-8 w-[96px] rounded-full" />
            <Skeleton className="h-8 w-[104px] rounded-full" />
            <Skeleton className="h-8 w-[72px] rounded-full" />
            <Skeleton className="h-8 w-[64px] rounded-full" />
          </div>

          {/* Filters Button Row */}
          <div className="flex items-center justify-between gap-2">
            <Skeleton className="h-10 w-28 rounded-xl" />
          </div>
        </CardContent>
      </Card>

      {/* Transactions Card */}
      <Card
        className="border-0 shadow-lg overflow-hidden"
        style={{ backgroundColor: "var(--surface-elevated)" }}
      >
        <CardHeader className="flex flex-row items-center justify-between pb-4 gap-2">
          <div className="min-w-0 flex-1">
            <CardTitle
              className="font-[family-name:var(--font-nunito)] text-lg sm:text-xl font-bold"
              style={{ color: "var(--text-primary)" }}
            >
              Transactions
            </CardTitle>
            <CardDescription
              className="font-[family-name:var(--font-dm-sans)] text-xs sm:text-sm"
              style={{ color: "var(--text-tertiary)" }}
            >
              <Skeleton className="h-4 w-36 mt-1" />
            </CardDescription>
          </div>
          {/* Export button skeleton */}
          <Skeleton className="h-9 w-10 sm:w-24 rounded-xl flex-shrink-0" />
        </CardHeader>
        <CardContent className="pt-0 px-0">
          <div className="space-y-4 px-3 sm:px-6">
            {/* Date Group 1 */}
            <div className="space-y-1">
              {/* Date Divider - Centered: line + pill + daily total + line */}
              <div className="flex items-center gap-2 sm:gap-4 py-2">
                <div className="h-px flex-1" style={{ backgroundColor: "var(--border)" }} />
                <div className="flex items-center gap-1.5 sm:gap-2 flex-shrink-0">
                  <Skeleton
                    className="h-6 w-16 rounded-full"
                    style={{ backgroundColor: "var(--pastel-yellow-light)" }}
                  />
                  <Skeleton className="h-4 w-14" />
                </div>
                <div className="h-px flex-1" style={{ backgroundColor: "var(--border)" }} />
              </div>

              {/* 4 Transaction rows */}
              <div className="divide-y" style={{ borderColor: "var(--border)" }}>
                {Array.from({ length: 4 }).map((_, i) => (
                  <div key={`a-${i}`} className="flex items-center gap-3 py-3">
                    <Skeleton className="h-10 w-10 rounded-xl" />
                    <div className="flex-1 min-w-0 space-y-1.5">
                      <Skeleton className="h-4 w-3/5" />
                      <Skeleton className="h-3 w-2/5" />
                    </div>
                    <Skeleton className="h-5 w-16" />
                  </div>
                ))}
              </div>
            </div>

            {/* Date Group 2 */}
            <div className="space-y-1">
              {/* Date Divider - Centered: line + pill + daily total + line */}
              <div className="flex items-center gap-2 sm:gap-4 py-2">
                <div className="h-px flex-1" style={{ backgroundColor: "var(--border)" }} />
                <div className="flex items-center gap-1.5 sm:gap-2 flex-shrink-0">
                  <Skeleton
                    className="h-6 w-20 rounded-full"
                    style={{ backgroundColor: "var(--pastel-yellow-light)" }}
                  />
                  <Skeleton className="h-4 w-14" />
                </div>
                <div className="h-px flex-1" style={{ backgroundColor: "var(--border)" }} />
              </div>

              {/* 3 Transaction rows */}
              <div className="divide-y" style={{ borderColor: "var(--border)" }}>
                {Array.from({ length: 3 }).map((_, i) => (
                  <div key={`b-${i}`} className="flex items-center gap-3 py-3">
                    <Skeleton className="h-10 w-10 rounded-xl" />
                    <div className="flex-1 min-w-0 space-y-1.5">
                      <Skeleton className="h-4 w-2/3" />
                      <Skeleton className="h-3 w-1/3" />
                    </div>
                    <Skeleton className="h-5 w-16" />
                  </div>
                ))}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
