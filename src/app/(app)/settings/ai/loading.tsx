import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent } from "@/components/ui/card";

export default function AISettingsLoading() {
  return (
    <div className="p-4 md:p-6 lg:p-8 max-w-4xl mx-auto">
      {/* Header */}
      <div className="space-y-1 mb-6">
        <Skeleton className="h-4 w-32 mb-2" />
        <Skeleton className="h-8 w-32" />
        <Skeleton className="h-4 w-64" />
      </div>

      <Card className="bg-surface-white-60 backdrop-blur-sm border-2 border-border-white-80 shadow-lg">
        <CardContent className="pt-6">
          <div className="space-y-4">
            {/* Provider Selection */}
            <div>
              <Skeleton className="h-4 w-24 mb-2" />
              <div className="grid grid-cols-3 gap-2">
                <Skeleton className="h-12 rounded-xl" />
                <Skeleton className="h-12 rounded-xl" />
                <Skeleton className="h-12 rounded-xl" />
              </div>
            </div>

            {/* API Key */}
            <div>
              <Skeleton className="h-4 w-16 mb-2" />
              <Skeleton className="h-12 w-full rounded-xl" />
              <Skeleton className="h-3 w-72 mt-1.5" />
            </div>

            {/* Model */}
            <div>
              <Skeleton className="h-4 w-28 mb-2" />
              <Skeleton className="h-12 w-full rounded-xl" />
            </div>

            {/* Action buttons */}
            <div className="flex gap-2 pt-2">
              <Skeleton className="h-10 flex-1 rounded-xl" />
              <Skeleton className="h-10 w-20 rounded-xl" />
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
