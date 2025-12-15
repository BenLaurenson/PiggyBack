"use client";

import { Skeleton } from "@/components/ui/skeleton";
import { EmptyStateSkeleton } from "@/components/ui/empty-state-skeleton";
import { useConnectionStatus } from "@/contexts/connection-status-context";

export default function PlanLoading() {
  const { hasAccounts } = useConnectionStatus();

  if (!hasAccounts) {
    return (
      <div className="p-4 md:p-6 space-y-6">
        <div className="space-y-1">
          <Skeleton className="h-9 w-24" />
          <Skeleton className="h-5 w-52" />
        </div>
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
        {/* Header — matches PageHeader: title + subtitle, no button */}
        <div className="mb-4 space-y-1">
          <Skeleton className="h-9 w-24" />
          <Skeleton className="h-5 w-56" />
        </div>

        {/* Tab bar — underline variant: gap-8, border-b */}
        <div
          className="inline-flex items-center gap-8 border-b w-full mb-4 md:mb-6"
          style={{ borderColor: "var(--border)" }}
        >
          <Skeleton className="h-5 w-14 mb-2" />
          <Skeleton className="h-5 w-12 mb-2" />
        </div>

        {/* Quick Stats Strip — 2x4 grid */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4 md:mb-6">
          {Array.from({ length: 4 }).map((_, i) => (
            <div
              key={i}
              className="border-0 shadow-sm rounded-2xl p-4"
              style={{ backgroundColor: "var(--surface-elevated)" }}
            >
              <div className="flex items-center gap-1.5 mb-1">
                <Skeleton className="h-1.5 w-1.5 rounded-full" />
                <Skeleton className="h-2.5 w-20" />
              </div>
              <Skeleton className="h-6 w-16" />
            </div>
          ))}
        </div>

        {/* Main 3-column layout */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 md:gap-6">
          {/* LEFT COLUMN — priority recs + goals timeline */}
          <div className="lg:col-span-2 space-y-4 md:space-y-6">
            {/* Priority Recommendations */}
            <div
              className="border-0 shadow-sm rounded-2xl overflow-hidden"
              style={{ backgroundColor: "var(--surface-elevated)" }}
            >
              <div
                className="px-5 py-3.5 border-b"
                style={{ borderColor: "var(--border)" }}
              >
                <Skeleton className="h-5 w-48" />
              </div>
              <div
                className="divide-y"
                style={{ borderColor: "var(--border)" }}
              >
                {Array.from({ length: 3 }).map((_, i) => (
                  <div key={i} className="flex items-start gap-3 px-5 py-3">
                    <Skeleton className="h-4 w-4 mt-0.5 flex-shrink-0 rounded" />
                    <div className="flex-1 space-y-1.5">
                      <Skeleton className="h-4 w-40" />
                      <Skeleton className="h-3 w-full" />
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Goals Timeline */}
            <div
              className="border-0 shadow-sm rounded-2xl overflow-hidden"
              style={{ backgroundColor: "var(--surface-elevated)" }}
            >
              <div
                className="px-5 py-3.5 flex items-center justify-between border-b"
                style={{ borderColor: "var(--border)" }}
              >
                <Skeleton className="h-5 w-32" />
                <Skeleton className="h-7 w-16 rounded-md" />
              </div>
              <div className="relative pl-12 pr-5 py-3">
                <div
                  className="absolute left-[27px] top-6 bottom-6 w-0.5"
                  style={{ backgroundColor: "var(--border)" }}
                />
                {Array.from({ length: 3 }).map((_, i) => (
                  <div key={i} className="relative mb-4">
                    <Skeleton className="absolute -left-10 top-0.5 h-8 w-8 rounded-full flex-shrink-0" />
                    <div className="py-2.5 space-y-1.5">
                      <Skeleton className="h-4 w-32" />
                      <Skeleton className="h-3 w-20" />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* RIGHT COLUMN — health snapshot + checkup wizard */}
          <div className="space-y-4 md:space-y-6">
            {/* Financial Health Snapshot */}
            <div
              className="border-0 shadow-sm rounded-2xl overflow-hidden"
              style={{ backgroundColor: "var(--surface-elevated)" }}
            >
              <div
                className="px-5 py-3.5 border-b"
                style={{ borderColor: "var(--border)" }}
              >
                <Skeleton className="h-5 w-36" />
              </div>
              <div
                className="divide-y"
                style={{ borderColor: "var(--border)" }}
              >
                {Array.from({ length: 5 }).map((_, i) => (
                  <div key={i} className="flex items-center gap-3 px-5 py-3">
                    <Skeleton className="h-2 w-2 rounded-full flex-shrink-0" />
                    <div className="flex-1 space-y-1">
                      <Skeleton className="h-3.5 w-24" />
                      <Skeleton className="h-3 w-full" />
                    </div>
                    <Skeleton className="h-4 w-12" />
                  </div>
                ))}
              </div>
            </div>

            {/* Annual Checkup */}
            <div
              className="border-0 shadow-sm rounded-2xl overflow-hidden"
              style={{ backgroundColor: "var(--surface-elevated)" }}
            >
              <div
                className="px-5 py-3.5 flex items-center justify-between border-b"
                style={{ borderColor: "var(--border)" }}
              >
                <div className="flex items-center gap-2">
                  <Skeleton className="h-4 w-4 rounded" />
                  <Skeleton className="h-5 w-44" />
                </div>
                <Skeleton className="h-7 w-24 rounded-md" />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
