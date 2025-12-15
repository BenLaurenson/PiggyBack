import { Skeleton } from "@/components/ui/skeleton";

export default function BudgetCreateLoading() {
  return (
    <div
      className="min-h-screen pb-24"
      style={{ backgroundColor: "var(--background)" }}
    >
      <div className="max-w-2xl mx-auto px-4 pt-6 md:pt-8">
        {/* Progress bar — 5 step indicators */}
        <div className="flex items-center gap-1.5 mb-6">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-1.5 flex-1 rounded-full" />
          ))}
        </div>

        {/* Step label: "Step 1 of 5 . Name & Type" */}
        <div className="flex items-center justify-between mb-6">
          <Skeleton className="h-3 w-40" />
        </div>

        {/* Cancel/Back button */}
        <Skeleton className="h-9 w-20 rounded-lg mb-4 -ml-2" />

        {/* Title: "Create a Budget" */}
        <Skeleton className="h-8 w-52 mb-2" />
        {/* Subtitle */}
        <Skeleton className="h-5 w-80 mb-8" />

        {/* Budget Name section */}
        <div className="mb-8">
          {/* Label: "Budget Name" */}
          <Skeleton className="h-4 w-24 mb-2" />
          {/* Emoji picker + Input */}
          <div className="flex items-center gap-2">
            <Skeleton className="h-11 w-11 rounded-xl flex-shrink-0" />
            <Skeleton className="h-11 flex-1 rounded-xl" />
          </div>
        </div>

        {/* Budget Type section */}
        <div className="mb-8">
          {/* Label: "Budget Type" */}
          <Skeleton className="h-4 w-24 mb-3" />
          {/* Two type cards: Personal / Household */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {Array.from({ length: 2 }).map((_, i) => (
              <div
                key={i}
                className="rounded-2xl p-4 border-2"
                style={{
                  backgroundColor: "var(--surface-elevated)",
                  borderColor: i === 0 ? "var(--border)" : "var(--border)",
                }}
              >
                <Skeleton className="w-10 h-10 rounded-xl mb-3" />
                <Skeleton className="h-4 w-20 mb-1" />
                <Skeleton className="h-3 w-40" />
              </div>
            ))}
          </div>
        </div>

        {/* Continue button */}
        <Skeleton className="h-12 w-full rounded-xl" />
      </div>
    </div>
  );
}
