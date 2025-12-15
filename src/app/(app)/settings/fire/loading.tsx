import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent, CardHeader } from "@/components/ui/card";

export default function FireSettingsLoading() {
  return (
    <div className="p-4 md:p-6 lg:p-8 max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <Skeleton className="h-9 w-9 rounded-lg" />
        <div className="space-y-1">
          <Skeleton className="h-8 w-40" />
          <Skeleton className="h-4 w-64" />
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Personal Details Card */}
        <Card className="bg-surface-white-60 backdrop-blur-sm border-2 border-border-white-80 shadow-lg">
          <CardHeader>
            <Skeleton className="h-5 w-32" />
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Date of Birth */}
            <div className="space-y-2">
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-10 w-48 rounded" />
              <Skeleton className="h-3 w-72" />
            </div>
            {/* Retirement Age */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Skeleton className="h-4 w-40" />
                <Skeleton className="h-6 w-11 rounded-full" />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Superannuation Card */}
        <Card className="bg-surface-white-60 backdrop-blur-sm border-2 border-border-white-80 shadow-lg">
          <CardHeader>
            <Skeleton className="h-5 w-32" />
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Super Balance */}
            <div className="space-y-2">
              <Skeleton className="h-4 w-36" />
              <Skeleton className="h-10 w-48 rounded" />
            </div>
            {/* Contribution Rate */}
            <div className="space-y-2">
              <Skeleton className="h-4 w-44" />
              <Skeleton className="h-10 w-48 rounded" />
            </div>
          </CardContent>
        </Card>

        {/* Investment Returns Card */}
        <Card className="bg-surface-white-60 backdrop-blur-sm border-2 border-border-white-80 shadow-lg">
          <CardHeader>
            <Skeleton className="h-5 w-36" />
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Skeleton className="h-4 w-56" />
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                {Array.from({ length: 3 }).map((_, i) => (
                  <Skeleton key={i} className="h-16 rounded-xl" />
                ))}
              </div>
              <Skeleton className="h-3 w-28" />
            </div>
            <div className="space-y-2 pt-2 border-t border-border">
              <div className="flex items-center justify-between">
                <Skeleton className="h-4 w-64" />
                <Skeleton className="h-6 w-11 rounded-full" />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Growth Assumptions Card */}
        <Card className="bg-surface-white-60 backdrop-blur-sm border-2 border-border-white-80 shadow-lg">
          <CardHeader>
            <Skeleton className="h-5 w-40" />
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Skeleton className="h-4 w-40" />
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {Array.from({ length: 4 }).map((_, i) => (
                  <Skeleton key={i} className="h-16 rounded-xl" />
                ))}
              </div>
              <Skeleton className="h-3 w-full" />
            </div>
            <div className="space-y-2 pt-2 border-t border-border">
              <Skeleton className="h-4 w-52" />
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {Array.from({ length: 4 }).map((_, i) => (
                  <Skeleton key={i} className="h-16 rounded-xl" />
                ))}
              </div>
              <Skeleton className="h-3 w-full" />
            </div>
          </CardContent>
        </Card>

        {/* FIRE Variant Card */}
        <Card className="bg-surface-white-60 backdrop-blur-sm border-2 border-border-white-80 shadow-lg">
          <CardHeader>
            <Skeleton className="h-5 w-28" />
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-16 rounded-xl" />
              ))}
            </div>
            <div className="space-y-2 pt-2">
              <div className="flex items-center justify-between">
                <Skeleton className="h-4 w-44" />
                <Skeleton className="h-6 w-11 rounded-full" />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Save button row */}
        <div className="lg:col-span-2 flex items-center gap-3">
          <Skeleton className="h-10 w-44 rounded" />
        </div>
      </div>
    </div>
  );
}
