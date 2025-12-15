import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent, CardHeader } from "@/components/ui/card";

export default function SubcategoryActivityLoading() {
  return (
    <div
      className="p-4 md:p-6 space-y-6"
      style={{ backgroundColor: "var(--background)" }}
    >
      {/* Back Button */}
      <div className="flex items-center gap-1 mb-2">
        <Skeleton className="h-4 w-4 rounded" />
        <Skeleton className="h-4 w-24" />
      </div>

      {/* Hero Section - icon + name/parent side by side, then subtitle */}
      <div className="space-y-1">
        <div className="flex items-center gap-3">
          <Skeleton className="h-10 w-10 rounded flex-shrink-0" />
          <div className="space-y-1">
            <Skeleton className="h-8 md:h-10 w-40" />
            <Skeleton className="h-4 w-24" />
          </div>
        </div>
        <Skeleton className="h-4 w-44" />
      </div>

      {/* Time Filter Chips */}
      <div className="flex flex-wrap gap-2">
        {["76px", "88px", "96px", "104px", "72px", "64px"].map((w, i) => (
          <Skeleton key={i} className="h-8 rounded-xl" style={{ width: w }} />
        ))}
      </div>

      {/* Stats Grid - 2x2 on mobile, 4 cols on desktop */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card
          className="border-0 shadow-lg overflow-hidden"
          style={{ backgroundColor: "var(--pastel-coral-light)" }}
        >
          <CardContent className="p-4">
            <Skeleton className="h-7 sm:h-8 w-24 mb-1" />
            <Skeleton className="h-3 w-16" />
          </CardContent>
        </Card>
        <Card
          className="border-0 shadow-lg"
          style={{ backgroundColor: "var(--surface-elevated)" }}
        >
          <CardContent className="p-4">
            <Skeleton className="h-7 sm:h-8 w-20 mb-1" />
            <Skeleton className="h-3 w-16" />
          </CardContent>
        </Card>
        <Card
          className="border-0 shadow-lg overflow-hidden"
          style={{ backgroundColor: "var(--pastel-blue-light)" }}
        >
          <CardContent className="p-4">
            <Skeleton className="h-7 sm:h-8 w-12 mb-1" />
            <Skeleton className="h-3 w-20" />
          </CardContent>
        </Card>
        <Card
          className="border-0 shadow-lg overflow-hidden"
          style={{ backgroundColor: "var(--pastel-yellow-light)" }}
        >
          <CardContent className="p-4">
            <Skeleton className="h-7 sm:h-8 w-14 mb-1" />
            <Skeleton className="h-3 w-10" />
          </CardContent>
        </Card>
      </div>

      {/* Trend Chart */}
      <Card
        className="border-0 shadow-lg"
        style={{ backgroundColor: "var(--surface-elevated)" }}
      >
        <CardHeader className="pb-2">
          <Skeleton className="h-5 w-32" />
        </CardHeader>
        <CardContent>
          <Skeleton className="h-[200px] w-full rounded-lg" />
        </CardContent>
      </Card>

      {/* Transactions List */}
      <Card
        className="border-0 shadow-lg"
        style={{ backgroundColor: "var(--surface-elevated)" }}
      >
        <CardHeader>
          <Skeleton className="h-5 w-36" />
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {/* Date group 1 */}
            <div className="space-y-1">
              <div className="flex items-center gap-2 sm:gap-4 py-2">
                <div
                  className="h-px flex-1"
                  style={{ backgroundColor: "var(--border)" }}
                />
                <div className="flex items-center gap-1.5 sm:gap-2 flex-shrink-0">
                  <Skeleton
                    className="h-6 w-16 rounded-full"
                    style={{ backgroundColor: "var(--pastel-yellow-light)" }}
                  />
                  <Skeleton className="h-4 w-14" />
                </div>
                <div
                  className="h-px flex-1"
                  style={{ backgroundColor: "var(--border)" }}
                />
              </div>
              <div
                className="divide-y"
                style={{ borderColor: "var(--border)" }}
              >
                {Array.from({ length: 4 }).map((_, i) => (
                  <div key={i} className="flex items-center gap-3 py-3">
                    <Skeleton className="h-10 w-10 rounded-xl flex-shrink-0" />
                    <div className="flex-1 min-w-0 space-y-1.5">
                      <Skeleton className="h-4 w-3/5" />
                      <Skeleton className="h-3 w-2/5" />
                    </div>
                    <Skeleton className="h-5 w-16" />
                  </div>
                ))}
              </div>
            </div>

            {/* Date group 2 */}
            <div className="space-y-1">
              <div className="flex items-center gap-2 sm:gap-4 py-2">
                <div
                  className="h-px flex-1"
                  style={{ backgroundColor: "var(--border)" }}
                />
                <div className="flex items-center gap-1.5 sm:gap-2 flex-shrink-0">
                  <Skeleton
                    className="h-6 w-20 rounded-full"
                    style={{ backgroundColor: "var(--pastel-yellow-light)" }}
                  />
                  <Skeleton className="h-4 w-14" />
                </div>
                <div
                  className="h-px flex-1"
                  style={{ backgroundColor: "var(--border)" }}
                />
              </div>
              <div
                className="divide-y"
                style={{ borderColor: "var(--border)" }}
              >
                {Array.from({ length: 3 }).map((_, i) => (
                  <div key={i} className="flex items-center gap-3 py-3">
                    <Skeleton className="h-10 w-10 rounded-xl flex-shrink-0" />
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
