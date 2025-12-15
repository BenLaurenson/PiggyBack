import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent } from "@/components/ui/card";

export default function UpConnectionLoading() {
  return (
    <div className="p-4 md:p-6 lg:p-8 max-w-4xl mx-auto">
      {/* Header */}
      <div className="space-y-1 mb-6">
        <Skeleton className="h-4 w-32 mb-2" />
        <Skeleton className="h-9 w-28" />
        <Skeleton className="h-5 w-80" />
      </div>

      {/* Connect Form Card (default state before connection check) */}
      <Card className="bg-surface-white-60 backdrop-blur-sm border-2 border-border-white-80 shadow-lg mb-6">
        <CardContent className="pt-6">
          <div className="space-y-6">
            {/* API Token field */}
            <div className="space-y-2">
              <Skeleton className="h-4 w-20" />
              <Skeleton className="h-12 w-full rounded-xl" />
              <Skeleton className="h-3 w-56" />
            </div>

            {/* Connect button */}
            <Skeleton className="h-12 w-full rounded-xl" />
          </div>
        </CardContent>
      </Card>

      {/* Info Card */}
      <Card className="bg-surface-white-60 backdrop-blur-sm border-2 border-border-white-80 shadow-lg">
        <CardContent className="pt-6">
          <Skeleton className="h-5 w-28 mb-3" />
          <div className="space-y-2">
            <Skeleton className="h-4 w-52" />
            <Skeleton className="h-4 w-56" />
            <Skeleton className="h-4 w-64" />
            <Skeleton className="h-4 w-36" />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
