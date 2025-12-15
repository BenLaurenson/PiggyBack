import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent } from "@/components/ui/card";

export default function SecurityLoading() {
  return (
    <div className="p-4 md:p-6 lg:p-8 max-w-4xl mx-auto">
      {/* Header */}
      <div className="space-y-1 mb-6">
        <Skeleton className="h-4 w-32 mb-2" />
        <Skeleton className="h-9 w-48" />
        <Skeleton className="h-5 w-72" />
      </div>

      {/* Change Password Card */}
      <Card className="bg-surface-white-60 backdrop-blur-sm border-2 border-border-white-80 shadow-lg mb-6">
        <CardContent className="pt-6">
          <Skeleton className="h-6 w-40 mb-4" />

          <div className="space-y-6">
            {/* New Password field */}
            <div className="space-y-2">
              <Skeleton className="h-4 w-28" />
              <Skeleton className="h-12 w-full rounded-xl" />
              <Skeleton className="h-3 w-44" />
            </div>

            {/* Confirm Password field */}
            <div className="space-y-2">
              <Skeleton className="h-4 w-44" />
              <Skeleton className="h-12 w-full rounded-xl" />
            </div>

            {/* Submit button */}
            <Skeleton className="h-12 w-full rounded-xl" />
          </div>
        </CardContent>
      </Card>

      {/* Danger Zone Card */}
      <Card className="bg-surface-white-60 backdrop-blur-sm border-2 border-error-border shadow-lg">
        <CardContent className="pt-6">
          <Skeleton className="h-6 w-28 mb-2" />
          <Skeleton className="h-4 w-32 mb-4" />

          <div className="flex items-center justify-between p-4 rounded-xl border-2 border-border">
            <div className="space-y-1">
              <Skeleton className="h-4 w-32" />
              <Skeleton className="h-3 w-64" />
            </div>
            <Skeleton className="h-10 w-10 rounded-xl" />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
