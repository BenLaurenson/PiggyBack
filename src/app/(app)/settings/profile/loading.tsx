import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent } from "@/components/ui/card";

export default function ProfileLoading() {
  return (
    <div className="p-4 md:p-6 lg:p-8 max-w-4xl mx-auto">
      {/* Header */}
      <div className="space-y-1 mb-6">
        <Skeleton className="h-4 w-32 mb-2" />
        <Skeleton className="h-9 w-24" />
        <Skeleton className="h-5 w-56" />
      </div>

      <Card className="bg-surface-white-60 backdrop-blur-sm border-2 border-border-white-80 shadow-lg">
        <CardContent className="pt-6">
          <div className="space-y-6">
            {/* Avatar field */}
            <div className="space-y-2">
              <Skeleton className="h-4 w-14" />
              <div className="flex items-center gap-4">
                <Skeleton className="h-20 w-20 rounded-full" />
                <div className="flex-1 space-y-1">
                  <Skeleton className="h-12 w-full rounded-xl" />
                  <Skeleton className="h-3 w-48" />
                </div>
              </div>
            </div>

            {/* Display Name field */}
            <div className="space-y-2">
              <Skeleton className="h-4 w-28" />
              <Skeleton className="h-12 w-full rounded-xl" />
            </div>

            {/* Email field */}
            <div className="space-y-2">
              <Skeleton className="h-4 w-12" />
              <Skeleton className="h-12 w-full rounded-xl" />
              <Skeleton className="h-3 w-40" />
            </div>

            {/* Buttons */}
            <div className="flex gap-3 pt-4">
              <Skeleton className="h-12 flex-1 rounded-xl" />
              <Skeleton className="h-12 w-24 rounded-xl" />
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
