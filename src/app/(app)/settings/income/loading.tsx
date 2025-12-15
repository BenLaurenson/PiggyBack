import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent } from "@/components/ui/card";

export default function IncomeLoading() {
  return (
    <div className="p-4 md:p-6 lg:p-8 max-w-4xl mx-auto">
      {/* Header */}
      <div className="space-y-1 mb-6">
        <Skeleton className="h-4 w-32 mb-2" />
        <Skeleton className="h-9 w-40" />
        <Skeleton className="h-5 w-64" />
      </div>

      {/* Your Income Card */}
      <Card className="bg-surface-white-60 backdrop-blur-sm border-2 border-border-white-80 shadow-lg mb-6">
        <CardContent className="pt-6">
          <Skeleton className="h-6 w-44 mb-4" />

          {/* Income source items */}
          <div className="space-y-3 mb-4">
            {Array.from({ length: 2 }).map((_, i) => (
              <div
                key={i}
                className="p-4 rounded-xl border-2 border-border"
              >
                <div className="flex items-center justify-between gap-4">
                  <div className="flex-1 space-y-2">
                    <div className="flex items-center gap-2">
                      <Skeleton className="h-4 w-32" />
                      <Skeleton className="h-5 w-5 rounded-full" />
                    </div>
                    <Skeleton className="h-7 w-28" />
                    <Skeleton className="h-4 w-64" />
                  </div>
                  <div className="flex gap-2">
                    <Skeleton className="h-8 w-8 rounded" />
                    <Skeleton className="h-8 w-8 rounded" />
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Add Income button */}
          <Skeleton className="h-12 w-full rounded-xl" />
        </CardContent>
      </Card>
    </div>
  );
}
