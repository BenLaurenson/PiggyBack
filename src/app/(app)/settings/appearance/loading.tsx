import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent } from "@/components/ui/card";

export default function AppearanceLoading() {
  return (
    <div className="p-4 md:p-6 lg:p-8 max-w-4xl mx-auto">
      {/* Header */}
      <div className="space-y-1 mb-6">
        <Skeleton className="h-4 w-32 mb-2" />
        <Skeleton className="h-9 w-36" />
        <Skeleton className="h-5 w-56" />
      </div>

      <Card className="bg-surface-white-60 backdrop-blur-sm border-2 border-border-white-80 shadow-lg">
        <CardContent className="pt-6">
          {/* Theme label + description */}
          <div className="space-y-2 mb-6">
            <Skeleton className="h-4 w-14" />
            <Skeleton className="h-4 w-52" />
          </div>

          {/* 4 theme option cards */}
          <div className="space-y-3 mb-6">
            {Array.from({ length: 4 }).map((_, i) => (
              <div
                key={i}
                className="flex items-center gap-4 p-4 rounded-xl border-2 border-border"
              >
                <Skeleton className="h-9 w-9 rounded-lg" />
                <div className="flex-1 space-y-1">
                  <Skeleton className="h-4 w-16" />
                  <Skeleton className="h-3 w-40" />
                </div>
              </div>
            ))}
          </div>

          {/* Save button */}
          <Skeleton className="h-12 w-full rounded-xl" />
        </CardContent>
      </Card>
    </div>
  );
}
