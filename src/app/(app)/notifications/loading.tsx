import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent } from "@/components/ui/card";

export default function NotificationsLoading() {
  return (
    <div className="max-w-2xl mx-auto px-4 py-6 md:py-10">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <Skeleton className="h-7 w-36 mb-1.5" />
          <Skeleton className="h-4 w-24" />
        </div>
      </div>

      {/* Section label */}
      <Skeleton className="h-3 w-24 mb-3" />

      {/* Notification cards */}
      <div className="space-y-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <Card
            key={i}
            className="overflow-hidden"
            style={{
              backgroundColor: "var(--background)",
              borderColor: "var(--border)",
            }}
          >
            <CardContent className="p-4">
              <div className="flex items-start gap-3">
                {/* Icon circle */}
                <Skeleton className="h-9 w-9 rounded-full flex-shrink-0" />

                {/* Content */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <Skeleton className="h-4 w-40" />
                    <Skeleton className="h-3 w-10 flex-shrink-0" />
                  </div>

                  {/* Price change style (old -> new) for first two */}
                  {i < 2 ? (
                    <div className="mt-2 flex items-center gap-2">
                      <Skeleton className="h-4 w-14" />
                      <Skeleton className="h-3 w-3" />
                      <Skeleton className="h-4 w-14" />
                      <Skeleton className="h-5 w-16 rounded-full" />
                    </div>
                  ) : (
                    <Skeleton className="h-3 w-full mt-1.5" />
                  )}

                  {/* Action buttons for first two */}
                  {i < 2 && (
                    <div className="flex gap-2 mt-3">
                      <Skeleton className="h-8 w-32 rounded-lg" />
                      <Skeleton className="h-8 w-20 rounded-lg" />
                    </div>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Cleared section */}
      <Skeleton className="h-3 w-16 mt-6 mb-3" />
      <div className="space-y-2">
        {Array.from({ length: 2 }).map((_, i) => (
          <Card
            key={i}
            className="overflow-hidden"
            style={{
              backgroundColor: "var(--background)",
              borderColor: "var(--border)",
              opacity: 0.6,
            }}
          >
            <CardContent className="p-4">
              <div className="flex items-start gap-3">
                <Skeleton className="h-9 w-9 rounded-full flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <Skeleton className="h-4 w-36" />
                    <Skeleton className="h-3 w-10 flex-shrink-0" />
                  </div>
                  <Skeleton className="h-3 w-48 mt-1.5" />
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
