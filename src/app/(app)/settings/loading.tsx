import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent } from "@/components/ui/card";

export default function SettingsLoading() {
  // Match the actual settings page: 5 groups + Other + footer
  const groups = [
    { label: "Account", count: 2 },
    { label: "Connections & API Keys", count: 2 },
    { label: "Finances", count: 1 },
    { label: "Preferences", count: 2 },
    { label: "Security", count: 1 },
  ];

  return (
    <div className="p-4 md:p-6 lg:p-8 max-w-4xl mx-auto">
      {/* Header */}
      <div className="space-y-1 mb-6">
        <Skeleton className="h-9 w-24" />
        <Skeleton className="h-5 w-56" />
      </div>

      {/* Profile Card */}
      <Card className="bg-surface-white-60 backdrop-blur-sm border-2 border-border-white-80 shadow-lg mb-6">
        <CardContent className="pt-6">
          <div className="flex items-center gap-4">
            <Skeleton className="h-16 w-16 rounded-full" />
            <div className="flex-1 min-w-0 space-y-2">
              <Skeleton className="h-5 w-36" />
              <Skeleton className="h-4 w-48" />
              <Skeleton className="h-5 w-16 rounded-full" />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Settings Sections */}
      <div className="space-y-6">
        {groups.map((group) => (
          <div key={group.label}>
            {/* Group label */}
            <Skeleton className="h-3.5 w-32 mb-2 ml-1" />
            <Card className="bg-surface-white-60 backdrop-blur-sm border-2 border-border-white-80 shadow-lg">
              <CardContent className="p-0">
                {Array.from({ length: group.count }).map((_, i) => (
                  <div
                    key={i}
                    className={`flex items-center gap-4 p-4 ${i !== group.count - 1 ? "border-b" : ""}`}
                    style={{ borderColor: "var(--border)" }}
                  >
                    <Skeleton className="h-9 w-9 rounded-lg" />
                    <div className="flex-1 min-w-0 space-y-1">
                      <Skeleton className="h-4 w-32" />
                      <Skeleton className="h-3 w-52" />
                    </div>
                    <Skeleton className="h-5 w-5 rounded" />
                  </div>
                ))}
              </CardContent>
            </Card>
          </div>
        ))}

        {/* Other */}
        <Card className="bg-surface-white-60 backdrop-blur-sm border-2 border-border-white-80 shadow-lg">
          <CardContent className="p-0">
            <div className="flex items-center gap-4 p-4">
              <Skeleton className="h-9 w-9 rounded-lg" />
              <div className="flex-1 min-w-0 space-y-1">
                <Skeleton className="h-4 w-32" />
                <Skeleton className="h-3 w-52" />
              </div>
              <Skeleton className="h-5 w-5 rounded" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Footer */}
      <div className="text-center mt-8 space-y-1">
        <Skeleton className="h-4 w-28 mx-auto" />
        <div className="flex items-center justify-center gap-4">
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-4 w-28" />
        </div>
      </div>
    </div>
  );
}
