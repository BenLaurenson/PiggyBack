import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent, CardHeader } from "@/components/ui/card";

export default function SubcategoryBudgetLoading() {
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

      {/* Hero Section — icon + subcategory name + parent category */}
      <div className="space-y-1">
        <div className="flex items-center gap-3">
          <Skeleton className="h-10 w-10 rounded flex-shrink-0" />
          <div>
            <Skeleton className="h-9 md:h-10 w-40 mb-1" />
            <Skeleton className="h-3.5 w-24" />
          </div>
        </div>
        <Skeleton className="h-4 w-44" />
      </div>

      {/* Time Filter Chips */}
      <div className="flex flex-wrap gap-2 mb-4">
        {["This Week", "This Month", "Last 30 Days", "Last 3 Months", "This Year", "All Time"].map((label) => (
          <Skeleton key={label} className="h-8 rounded-xl" style={{ width: label.length * 8 + 24 }} />
        ))}
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card className="border-0 shadow-lg overflow-hidden" style={{ backgroundColor: "var(--pastel-coral-light)" }}>
          <CardContent className="p-4">
            <Skeleton className="h-6 sm:h-7 md:h-9 w-28 mb-1" />
            <Skeleton className="h-3 w-16 mt-1" />
          </CardContent>
        </Card>
        <Card className="border-0 shadow-lg" style={{ backgroundColor: "var(--surface-elevated)" }}>
          <CardContent className="p-4">
            <Skeleton className="h-6 sm:h-7 md:h-9 w-24 mb-1" />
            <Skeleton className="h-3 w-16 mt-1" />
          </CardContent>
        </Card>
        <Card className="border-0 shadow-lg overflow-hidden" style={{ backgroundColor: "var(--pastel-blue-light)" }}>
          <CardContent className="p-4">
            <Skeleton className="h-6 sm:h-7 md:h-9 w-12 mb-1" />
            <Skeleton className="h-3 w-20 mt-1" />
          </CardContent>
        </Card>
        <Card className="border-0 shadow-lg overflow-hidden" style={{ backgroundColor: "var(--pastel-yellow-light)" }}>
          <CardContent className="p-4">
            <Skeleton className="h-6 sm:h-7 md:h-9 w-16 mb-1" />
            <Skeleton className="h-3 w-10 mt-1" />
          </CardContent>
        </Card>
      </div>

      {/* Trend Chart */}
      <Card className="border-0 shadow-lg" style={{ backgroundColor: "var(--surface-elevated)" }}>
        <CardHeader className="pb-2">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <Skeleton className="h-5 w-36" />
            <div className="flex gap-2">
              <Skeleton className="h-8 w-20 rounded-full" />
              <Skeleton className="h-8 w-20 rounded-full" />
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <Skeleton className="h-[250px] w-full rounded-lg" />
        </CardContent>
      </Card>

      {/* Transactions List */}
      <Card className="border-0 shadow-lg" style={{ backgroundColor: "var(--surface-elevated)" }}>
        <CardHeader>
          <Skeleton className="h-5 w-40" />
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {/* Date group 1 */}
            <div className="space-y-1">
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
              <div className="divide-y" style={{ borderColor: "var(--border)" }}>
                {Array.from({ length: 4 }).map((_, i) => (
                  <div key={i} className="flex items-center gap-2 sm:gap-4 py-3 px-2 sm:px-3">
                    <Skeleton className="h-4 w-12 sm:w-16 flex-shrink-0" />
                    <Skeleton className="h-5 w-5 sm:h-6 sm:w-6 rounded flex-shrink-0" />
                    <div className="flex-1 min-w-0 space-y-1">
                      <Skeleton className="h-4 w-3/5" />
                      <Skeleton className="h-3 w-2/5" />
                    </div>
                    <Skeleton className="h-4 w-4 rounded flex-shrink-0 hidden sm:block" />
                    <Skeleton className="h-4 w-[70px] sm:w-[100px] flex-shrink-0" />
                  </div>
                ))}
              </div>
            </div>

            {/* Date group 2 */}
            <div className="space-y-1">
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
              <div className="divide-y" style={{ borderColor: "var(--border)" }}>
                {Array.from({ length: 3 }).map((_, i) => (
                  <div key={i} className="flex items-center gap-2 sm:gap-4 py-3 px-2 sm:px-3">
                    <Skeleton className="h-4 w-12 sm:w-16 flex-shrink-0" />
                    <Skeleton className="h-5 w-5 sm:h-6 sm:w-6 rounded flex-shrink-0" />
                    <div className="flex-1 min-w-0 space-y-1">
                      <Skeleton className="h-4 w-2/3" />
                      <Skeleton className="h-3 w-1/3" />
                    </div>
                    <Skeleton className="h-4 w-4 rounded flex-shrink-0 hidden sm:block" />
                    <Skeleton className="h-4 w-[70px] sm:w-[100px] flex-shrink-0" />
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
