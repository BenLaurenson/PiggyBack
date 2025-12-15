"use client";

import { Skeleton } from "@/components/ui/skeleton";
import { EmptyStateSkeleton } from "@/components/ui/empty-state-skeleton";
import { useConnectionStatus } from "@/contexts/connection-status-context";

export default function GoalsLoading() {
  const { hasGoals, fireOnboarded, hasCompletedGoals } = useConnectionStatus();

  if (!hasGoals) {
    return (
      <div className="p-4 md:p-6 space-y-6">
        <EmptyStateSkeleton />
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 lg:p-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="space-y-1">
          <Skeleton className="h-9 w-20" />
          <Skeleton className="h-5 w-44" />
        </div>
        <Skeleton className="h-10 w-28 rounded-xl" />
      </div>

      {/* 3-column layout */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 md:gap-6">
        {/* LEFT COLUMN */}
        <div className="lg:col-span-2 space-y-4 md:space-y-6">
          {/* Savings Progress Chart card */}
          <div
            className="border-0 shadow-sm rounded-2xl overflow-hidden"
            style={{ backgroundColor: "var(--surface-elevated)" }}
          >
            <div className="p-5 pb-0">
              <div className="flex items-start justify-between gap-4">
                <div className="space-y-2">
                  <Skeleton className="h-3 w-20" />
                  <Skeleton className="h-10 w-36" />
                  <Skeleton className="h-4 w-48" />
                </div>
                <div className="flex gap-1">
                  {Array.from({ length: 5 }).map((_, i) => (
                    <Skeleton key={i} className="h-7 w-9 rounded-lg" />
                  ))}
                </div>
              </div>
            </div>
            <div className="px-2 pb-1">
              <Skeleton className="h-[200px] w-full" />
            </div>
            <div className="px-5 py-3 border-t" style={{ borderColor: "var(--border)" }}>
              <div className="flex items-center justify-between mb-1.5">
                <Skeleton className="h-3 w-24" />
                <Skeleton className="h-3 w-12" />
              </div>
              <Skeleton className="h-2 w-full rounded-full" />
              <div className="flex items-center justify-between mt-1.5">
                <Skeleton className="h-3 w-20" />
                <Skeleton className="h-3 w-20" />
              </div>
            </div>
          </div>

          {/* Active Goals Table */}
          <div
            className="border-0 shadow-sm rounded-2xl overflow-hidden"
            style={{ backgroundColor: "var(--surface-elevated)" }}
          >
            <div className="px-5 py-3.5 flex items-center justify-between border-b" style={{ borderColor: "var(--border)" }}>
              <Skeleton className="h-5 w-28" />
              <Skeleton className="h-4 w-12" />
            </div>

            {/* Desktop table header */}
            <div
              className="hidden md:grid grid-cols-[1fr_90px_100px_80px_32px] gap-3 px-5 py-2 border-b"
              style={{ borderColor: "var(--border)" }}
            >
              <Skeleton className="h-3 w-8" />
              <Skeleton className="h-3 w-12 ml-auto" />
              <Skeleton className="h-3 w-10 ml-auto" />
              <Skeleton className="h-3 w-10 ml-auto" />
              <span />
            </div>

            {/* Goal rows */}
            <div className="divide-y" style={{ borderColor: "var(--border)" }}>
              {Array.from({ length: 4 }).map((_, i) => (
                <div
                  key={i}
                  className="grid grid-cols-[1fr_auto] md:grid-cols-[1fr_90px_100px_80px_32px] gap-3 items-center px-5 py-3"
                >
                  {/* Goal name + metadata */}
                  <div className="flex items-center gap-3 min-w-0">
                    <Skeleton className="h-10 w-10 rounded-xl flex-shrink-0" />
                    <div className="min-w-0 space-y-1">
                      <Skeleton className="h-4 w-28" />
                      <Skeleton className="h-3 w-16" />
                    </div>
                  </div>

                  {/* Mobile: value + status */}
                  <div className="md:hidden text-right space-y-1">
                    <Skeleton className="h-4 w-14 ml-auto" />
                    <Skeleton className="h-4 w-16 rounded-full ml-auto" />
                  </div>

                  {/* Desktop: Progress column */}
                  <Skeleton className="hidden md:block h-1.5 w-14 rounded-full ml-auto" />

                  {/* Desktop: Saved column */}
                  <Skeleton className="hidden md:block h-5 w-16 ml-auto" />

                  {/* Desktop: Status column */}
                  <Skeleton className="hidden md:block h-5 w-16 rounded-full ml-auto" />

                  {/* Desktop: Chevron */}
                  <Skeleton className="hidden md:block h-4 w-4 ml-auto" />
                </div>
              ))}
            </div>
          </div>

          {/* Completed section (collapsible header) */}
          {hasCompletedGoals && (
            <div
              className="border-0 shadow-sm rounded-2xl overflow-hidden"
              style={{ backgroundColor: "var(--surface-elevated)" }}
            >
              <div className="px-5 py-3.5 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Skeleton className="h-4 w-4 rounded-full" />
                  <Skeleton className="h-5 w-24" />
                  <Skeleton className="h-5 w-5 rounded-full" />
                </div>
                <Skeleton className="h-4 w-4" />
              </div>
            </div>
          )}
        </div>

        {/* RIGHT COLUMN */}
        <div className="space-y-4 md:space-y-6">
          {/* Summary */}
          <div
            className="border-0 shadow-sm rounded-2xl overflow-hidden"
            style={{ backgroundColor: "var(--surface-elevated)" }}
          >
            <div className="px-5 py-3.5 border-b" style={{ borderColor: "var(--border)" }}>
              <Skeleton className="h-5 w-20" />
            </div>
            <div className="p-5 space-y-4">
              {/* Total Target */}
              <div className="flex items-center justify-between">
                <Skeleton className="h-3 w-20" />
                <Skeleton className="h-4 w-16" />
              </div>
              {/* Total Saved */}
              <div className="flex items-center justify-between">
                <Skeleton className="h-3 w-20" />
                <Skeleton className="h-4 w-16" />
              </div>
              {/* Remaining */}
              <div className="flex items-center justify-between">
                <Skeleton className="h-3 w-20" />
                <Skeleton className="h-4 w-16" />
              </div>
              {/* Separator + Active Goals + Completed */}
              <div className="pt-3 border-t" style={{ borderColor: "var(--border)" }}>
                <div className="flex items-center justify-between">
                  <Skeleton className="h-3 w-20" />
                  <Skeleton className="h-4 w-6" />
                </div>
                <div className="flex items-center justify-between mt-2">
                  <Skeleton className="h-3 w-20" />
                  <Skeleton className="h-4 w-6" />
                </div>
              </div>
            </div>
          </div>

          {/* Goal Health */}
          {hasGoals && (
            <div
              className="border-0 shadow-sm rounded-2xl overflow-hidden"
              style={{ backgroundColor: "var(--surface-elevated)" }}
            >
              <div className="px-5 py-3.5 border-b" style={{ borderColor: "var(--border)" }}>
                <Skeleton className="h-5 w-24" />
              </div>
              <div className="divide-y" style={{ borderColor: "var(--border)" }}>
                {Array.from({ length: 3 }).map((_, i) => (
                  <div key={i} className="px-5 py-3">
                    <div className="flex items-center justify-between mb-1">
                      <div className="flex items-center gap-2 min-w-0">
                        <Skeleton className="h-4 w-4 rounded" />
                        <Skeleton className="h-3 w-20" />
                      </div>
                      <Skeleton className="h-4 w-16 rounded-full" />
                    </div>
                    <Skeleton className="h-3 w-36" />
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Budget Allocations */}
          <div
            className="border-0 shadow-sm rounded-2xl p-4"
            style={{ backgroundColor: "var(--surface-elevated)" }}
          >
            <div className="flex items-center gap-3 mb-3">
              <Skeleton className="h-8 w-8 rounded-lg" />
              <div className="flex-1 space-y-1">
                <Skeleton className="h-3 w-28" />
                <Skeleton className="h-3 w-16" />
              </div>
              <Skeleton className="h-4 w-4" />
            </div>
            <div className="space-y-2">
              {Array.from({ length: 2 }).map((_, i) => (
                <div key={i} className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <Skeleton className="h-3 w-3 rounded" />
                    <Skeleton className="h-3 w-20" />
                  </div>
                  <Skeleton className="h-3 w-14" />
                </div>
              ))}
              {/* Total with border-t */}
              <div className="pt-2 mt-2 border-t flex items-center justify-between" style={{ borderColor: "var(--border)" }}>
                <Skeleton className="h-3 w-10" />
                <Skeleton className="h-3 w-16" />
              </div>
            </div>
          </div>

          {/* FIRE Card */}
          {fireOnboarded && (
            <div
              className="border-0 shadow-sm rounded-2xl p-4"
              style={{ backgroundColor: "var(--surface-elevated)" }}
            >
              <div className="flex items-center gap-3">
                <Skeleton className="h-8 w-8 rounded-lg" />
                <div className="flex-1 space-y-1">
                  <Skeleton className="h-3 w-20" />
                  <Skeleton className="h-3 w-44" />
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
