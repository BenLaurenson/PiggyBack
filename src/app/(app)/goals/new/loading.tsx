"use client";

import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent } from "@/components/ui/card";

export default function NewGoalLoading() {
  return (
    <div className="p-4 md:p-6 max-w-2xl mx-auto">
      {/* Header */}
      <div className="space-y-1 mb-6">
        {/* Back link */}
        <div className="flex items-center gap-1 mb-2">
          <Skeleton className="h-4 w-4" />
          <Skeleton className="h-4 w-24" />
        </div>
        <Skeleton className="h-8 w-40" />
        <Skeleton className="h-5 w-56" />
      </div>

      <Card
        className="border-0 shadow-sm"
        style={{ backgroundColor: "var(--surface-elevated)" }}
      >
        <CardContent className="pt-6">
          <div className="space-y-6">
            {/* Goal Name */}
            <div className="space-y-2">
              <Skeleton className="h-4 w-20" />
              <Skeleton className="h-10 w-full rounded-md" />
            </div>

            {/* Icon Selection */}
            <div className="space-y-2">
              <Skeleton className="h-4 w-8" />
              <div className="flex flex-wrap gap-2">
                {Array.from({ length: 9 }).map((_, i) => (
                  <Skeleton key={i} className="h-12 w-12 rounded-lg" />
                ))}
              </div>
            </div>

            {/* Color Selection */}
            <div className="space-y-2">
              <Skeleton className="h-4 w-10" />
              <div className="flex flex-wrap gap-2">
                {Array.from({ length: 8 }).map((_, i) => (
                  <Skeleton key={i} className="h-10 w-10 rounded-lg" />
                ))}
              </div>
            </div>

            {/* Target Amount */}
            <div className="space-y-2">
              <Skeleton className="h-4 w-28" />
              <Skeleton className="h-10 w-full rounded-md" />
            </div>

            {/* Current Amount */}
            <div className="space-y-2">
              <Skeleton className="h-4 w-44" />
              <Skeleton className="h-10 w-full rounded-md" />
              <Skeleton className="h-3 w-72" />
            </div>

            {/* Deadline */}
            <div className="space-y-2">
              <Skeleton className="h-4 w-36" />
              <Skeleton className="h-10 w-full rounded-md" />
              <Skeleton className="h-3 w-56" />
            </div>

            {/* Linked Saver Account */}
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Skeleton className="h-4 w-4" />
                <Skeleton className="h-4 w-48" />
              </div>
              <Skeleton className="h-10 w-full rounded-md" />
              <Skeleton className="h-3 w-72" />
            </div>

            {/* Preview */}
            <div
              className="p-4 rounded-lg border"
              style={{ borderColor: "var(--border)" }}
            >
              <Skeleton className="h-3 w-14 mb-2" />
              <div className="flex items-center gap-3">
                <Skeleton className="h-12 w-12 rounded-xl" />
                <div className="space-y-1">
                  <Skeleton className="h-4 w-24" />
                  <Skeleton className="h-3 w-20" />
                </div>
              </div>
            </div>

            {/* Submit buttons */}
            <div className="flex gap-3">
              <Skeleton className="h-10 flex-1 rounded-md" />
              <Skeleton className="h-10 w-20 rounded-md" />
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
