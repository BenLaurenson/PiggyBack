import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent } from "@/components/ui/card";

export default function NotificationsLoading() {
  return (
    <div className="p-4 md:p-6 lg:p-8 max-w-4xl mx-auto">
      {/* Header */}
      <div className="space-y-1 mb-6">
        <Skeleton className="h-4 w-32 mb-2" />
        <div className="flex items-center gap-2">
          <Skeleton className="h-9 w-36" />
        </div>
        <Skeleton className="h-5 w-72" />
      </div>

      <div className="space-y-4">
        {/* 4 notification cards: Price Changes, Goal Milestones, Payment Reminders, Weekly Summary */}
        {Array.from({ length: 4 }).map((_, i) => (
          <Card key={i} style={{ borderColor: "var(--border)" }}>
            <CardContent>
              <div className="flex items-start gap-3">
                <Skeleton className="h-8 w-8 rounded-full flex-shrink-0 mt-0.5" />
                <div className="flex-1">
                  <div className="flex items-center justify-between">
                    <div className="space-y-1">
                      <Skeleton className="h-5 w-44" />
                      <Skeleton className="h-4 w-64" />
                    </div>
                    <Skeleton className="h-6 w-11 rounded-full" />
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}

        {/* Save button */}
        <Skeleton className="h-12 w-full rounded-xl" />
      </div>
    </div>
  );
}
