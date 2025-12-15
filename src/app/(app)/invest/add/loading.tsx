import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent } from "@/components/ui/card";

export default function AddInvestmentLoading() {
  return (
    <div className="p-4 md:p-6 max-w-2xl mx-auto">
      {/* Header */}
      <div className="space-y-1 mb-6">
        <Skeleton className="h-4 w-36 mb-2" />
        <Skeleton className="h-9 w-44" />
        <Skeleton className="h-5 w-52" />
      </div>

      <Card
        className="bg-surface-white-60 backdrop-blur-sm border-2 border-border-white-80 shadow-lg"
      >
        <CardContent className="pt-6 space-y-6">
          {/* Asset Type */}
          <div className="space-y-2">
            <Skeleton className="h-4 w-20" />
            <Skeleton className="h-12 w-full rounded-xl" />
          </div>

          {/* Name */}
          <div className="space-y-2">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-12 w-full rounded-xl" />
          </div>

          {/* Ticker */}
          <div className="space-y-2">
            <Skeleton className="h-4 w-36" />
            <Skeleton className="h-12 w-full rounded-xl" />
          </div>

          {/* Quantity */}
          <div className="space-y-2">
            <Skeleton className="h-4 w-28" />
            <Skeleton className="h-12 w-full rounded-xl" />
          </div>

          {/* Purchase Value */}
          <div className="space-y-2">
            <Skeleton className="h-4 w-40" />
            <Skeleton className="h-12 w-full rounded-xl" />
            <Skeleton className="h-3 w-52" />
          </div>

          {/* Current Value */}
          <div className="space-y-2">
            <Skeleton className="h-4 w-28" />
            <Skeleton className="h-12 w-full rounded-xl" />
          </div>

          {/* Notes */}
          <div className="space-y-2">
            <Skeleton className="h-4 w-28" />
            <Skeleton className="h-20 w-full rounded-xl" />
          </div>

          {/* Action buttons */}
          <div className="flex gap-3 pt-4">
            <Skeleton className="flex-1 h-12 rounded-xl" />
            <Skeleton className="h-12 w-20 rounded-xl" />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
