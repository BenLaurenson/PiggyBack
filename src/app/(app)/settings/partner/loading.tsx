import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent, CardHeader } from "@/components/ui/card";

export default function PartnerLoading() {
  return (
    <div className="p-4 md:p-6 lg:p-8 max-w-4xl mx-auto">
      {/* Header */}
      <div className="space-y-1 mb-6">
        <Skeleton className="h-4 w-32 mb-2" />
        <Skeleton className="h-9 w-24" />
        <Skeleton className="h-5 w-64" />
      </div>

      {/* Add Manual Partner Card */}
      <Card className="bg-surface-white-60 backdrop-blur-sm border-2 border-border-white-80 shadow-lg mb-6">
        <CardHeader>
          <Skeleton className="h-6 w-48" />
          <Skeleton className="h-4 w-72" />
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {/* Partner Name field */}
            <div className="space-y-2">
              <Skeleton className="h-4 w-32" />
              <Skeleton className="h-12 w-full rounded-xl" />
            </div>

            {/* FIRE Planning section divider */}
            <div className="border-t border-border-white-60 pt-4 mt-4">
              <Skeleton className="h-4 w-40 mb-3" />
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Date of Birth */}
                <div className="space-y-2">
                  <Skeleton className="h-4 w-24" />
                  <Skeleton className="h-12 w-full rounded-xl" />
                </div>
                {/* Retirement Age */}
                <div className="space-y-2">
                  <Skeleton className="h-4 w-40" />
                  <Skeleton className="h-12 w-full rounded-xl" />
                </div>
                {/* Super Balance */}
                <div className="space-y-2">
                  <Skeleton className="h-4 w-28" />
                  <Skeleton className="h-12 w-full rounded-xl" />
                </div>
                {/* Super Rate */}
                <div className="space-y-2">
                  <Skeleton className="h-4 w-44" />
                  <Skeleton className="h-12 w-full rounded-xl" />
                </div>
              </div>
            </div>

            {/* Submit button */}
            <div className="flex gap-3 pt-2">
              <Skeleton className="h-12 flex-1 rounded-xl" />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Info Card */}
      <Card className="bg-info-light border-2 border-info-border">
        <CardContent className="pt-4">
          <Skeleton className="h-5 w-52 mb-2" />
          <div className="space-y-1">
            <Skeleton className="h-3 w-full" />
            <Skeleton className="h-3 w-full" />
            <Skeleton className="h-3 w-3/4" />
            <Skeleton className="h-3 w-full" />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
