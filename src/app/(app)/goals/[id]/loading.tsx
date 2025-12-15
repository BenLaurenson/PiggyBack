"use client";

import { Skeleton } from "@/components/ui/skeleton";

export default function GoalDetailLoading() {
  return (
    <div className="p-4 md:p-6 lg:p-8">
      {/* Breadcrumb + header */}
      <div className="mb-6">
        <Skeleton className="h-4 w-16 mb-3" />
        <div className="flex items-end justify-between gap-4">
          <div className="min-w-0 flex-1 space-y-1">
            <div className="flex items-center gap-2 mb-1">
              <Skeleton className="h-7 w-7 rounded" />
              <Skeleton className="h-5 w-20 rounded-full" />
            </div>
            <Skeleton className="h-7 w-40" />
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <Skeleton className="h-9 w-24 rounded-xl" />
            <Skeleton className="h-9 w-20 rounded-xl" />
            <Skeleton className="h-9 w-9 rounded-xl" />
          </div>
        </div>
      </div>

      {/* 3-column layout */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 md:gap-6">
        {/* LEFT COLUMN */}
        <div className="lg:col-span-2 space-y-4 md:space-y-6">
          {/* Savings Chart card */}
          <div
            className="border-0 shadow-sm rounded-2xl overflow-hidden"
            style={{ backgroundColor: "var(--surface-elevated)" }}
          >
            <div className="p-5 pb-0">
              <div className="flex items-start justify-between gap-4">
                <div className="space-y-2">
                  <Skeleton className="h-3 w-12" />
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
              <Skeleton className="h-[260px] w-full" />
            </div>
            {/* Progress bar footer */}
            <div className="px-5 py-3 border-t" style={{ borderColor: "var(--border)" }}>
              <div className="flex items-center justify-between mb-1.5">
                <Skeleton className="h-3 w-24" />
                <Skeleton className="h-3 w-12" />
              </div>
              <Skeleton className="h-2.5 w-full rounded-full" />
              <div className="flex items-center justify-between mt-1.5">
                <Skeleton className="h-3 w-20" />
                <Skeleton className="h-3 w-20" />
              </div>
            </div>
          </div>

          {/* Recent Activity log */}
          <div
            className="border-0 shadow-sm rounded-2xl overflow-hidden"
            style={{ backgroundColor: "var(--surface-elevated)" }}
          >
            <div className="px-5 py-3.5 border-b" style={{ borderColor: "var(--border)" }}>
              <Skeleton className="h-5 w-32" />
            </div>
            <div className="divide-y" style={{ borderColor: "var(--border)" }}>
              {Array.from({ length: 5 }).map((_, i) => (
                <div
                  key={i}
                  className="flex items-center justify-between px-5 py-3"
                >
                  <div className="flex items-center gap-3">
                    <Skeleton className="h-7 w-7 rounded-lg" />
                    <div className="space-y-1">
                      <Skeleton className="h-3 w-16" />
                      <Skeleton className="h-3 w-24" />
                    </div>
                  </div>
                  <Skeleton className="h-3 w-14" />
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* RIGHT COLUMN */}
        <div className="space-y-4 md:space-y-6">
          {/* Details card */}
          <div
            className="border-0 shadow-sm rounded-2xl overflow-hidden"
            style={{ backgroundColor: "var(--surface-elevated)" }}
          >
            <div className="px-5 py-3.5 border-b" style={{ borderColor: "var(--border)" }}>
              <Skeleton className="h-5 w-16" />
            </div>
            <div className="divide-y" style={{ borderColor: "var(--border)" }}>
              {Array.from({ length: 6 }).map((_, i) => (
                <div
                  key={i}
                  className="flex items-center justify-between px-5 py-3"
                >
                  <Skeleton className="h-3 w-24" />
                  <Skeleton className="h-4 w-16" />
                </div>
              ))}
            </div>
          </div>

          {/* Projections card */}
          <div
            className="border-0 shadow-sm rounded-2xl overflow-hidden"
            style={{ backgroundColor: "var(--surface-elevated)" }}
          >
            <div className="px-5 py-3.5 border-b" style={{ borderColor: "var(--border)" }}>
              <Skeleton className="h-5 w-24" />
            </div>
            <div className="p-5 space-y-3">
              {/* Est. Completion */}
              <div className="flex items-center justify-between">
                <Skeleton className="h-3 w-24" />
                <Skeleton className="h-4 w-16" />
              </div>
              {/* Suggested savings label */}
              <Skeleton className="h-3 w-28 pt-1" />
              {/* Weekly / Fortnightly / Monthly grid */}
              <div className="grid grid-cols-3 gap-2">
                {Array.from({ length: 3 }).map((_, i) => (
                  <div
                    key={i}
                    className="rounded-lg py-2 px-1 text-center"
                    style={{ backgroundColor: "var(--surface)" }}
                  >
                    <Skeleton className="h-2.5 w-12 mx-auto mb-1" />
                    <Skeleton className="h-4 w-10 mx-auto" />
                  </div>
                ))}
              </div>
              {/* Actual/month */}
              <div className="flex items-center justify-between">
                <Skeleton className="h-3 w-20" />
                <Skeleton className="h-4 w-16" />
              </div>
            </div>
          </div>

          {/* Linked Account card */}
          <div
            className="border-0 shadow-sm rounded-2xl p-4"
            style={{ backgroundColor: "var(--surface-elevated)" }}
          >
            <div className="flex items-center gap-3">
              <Skeleton className="h-8 w-8 rounded-lg" />
              <div className="space-y-1">
                <Skeleton className="h-3 w-36" />
                <Skeleton className="h-3 w-44" />
              </div>
            </div>
          </div>

          {/* Quick Actions */}
          <div
            className="border-0 shadow-sm rounded-2xl p-4 space-y-2"
            style={{ backgroundColor: "var(--surface-elevated)" }}
          >
            <Skeleton className="h-9 w-full rounded-xl" />
            <Skeleton className="h-9 w-full rounded-xl" />
          </div>
        </div>
      </div>
    </div>
  );
}
