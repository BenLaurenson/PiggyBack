import { Skeleton } from "@/components/ui/skeleton";

export default function InvestDetailLoading() {
  return (
    <div className="min-h-screen pb-24" style={{ backgroundColor: "var(--background)" }}>
      <div className="p-4 md:p-6 lg:p-8">

        {/* ─── Breadcrumb + header ─── */}
        <div className="mb-6">
          <Skeleton className="h-4 w-20 mb-3" />
          <div className="flex items-end justify-between gap-4">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 mb-1">
                <Skeleton className="h-5 w-12 rounded-full" />
                <Skeleton className="h-4 w-14" />
              </div>
              <Skeleton className="h-8 w-48" />
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              <Skeleton className="h-10 w-24 rounded-xl" />
              <Skeleton className="h-10 w-20 rounded-xl" />
            </div>
          </div>
        </div>

        {/* ─── Main 2-column layout ─── */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 md:gap-6">

          {/* ═══ LEFT: Value + Chart ═══ */}
          <div className="lg:col-span-2 space-y-4 md:space-y-6">
            <div className="border-0 shadow-sm rounded-2xl overflow-hidden" style={{ backgroundColor: "var(--surface-elevated)" }}>
              <div className="p-5 pb-0">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <Skeleton className="h-3 w-24 mb-2" />
                    <Skeleton className="h-10 w-32 mb-1" />
                    <Skeleton className="h-4 w-48" />
                  </div>
                  <div className="flex gap-1 flex-shrink-0">
                    {["1W", "1M", "3M", "6M", "1Y", "ALL"].map((p) => (
                      <Skeleton key={p} className="h-7 w-8 rounded-lg" />
                    ))}
                  </div>
                </div>
              </div>
              <div className="px-2 pb-1">
                <Skeleton className="h-[260px] w-full mt-4 rounded-lg" />
              </div>
              <div className="px-5 py-2.5 flex items-center justify-between border-t" style={{ borderColor: "var(--border)" }}>
                <Skeleton className="h-3 w-16" />
                <Skeleton className="h-3 w-28" />
              </div>
            </div>
          </div>

          {/* ═══ RIGHT: Stats sidebar ═══ */}
          <div className="space-y-4 md:space-y-6">

            {/* Details card */}
            <div className="border-0 shadow-sm rounded-2xl overflow-hidden" style={{ backgroundColor: "var(--surface-elevated)" }}>
              <div className="px-5 py-3.5 border-b" style={{ borderColor: "var(--border)" }}>
                <Skeleton className="h-5 w-16" />
              </div>
              <div className="divide-y" style={{ borderColor: "var(--border)" }}>
                {Array.from({ length: 6 }).map((_, i) => (
                  <div key={i} className="flex items-center justify-between px-5 py-3">
                    <Skeleton className="h-3 w-24" />
                    <Skeleton className="h-4 w-16" />
                  </div>
                ))}
              </div>
            </div>

            {/* Notes card */}
            <div className="border-0 shadow-sm rounded-2xl overflow-hidden" style={{ backgroundColor: "var(--surface-elevated)" }}>
              <div className="px-5 py-3.5 flex items-center gap-2 border-b" style={{ borderColor: "var(--border)" }}>
                <Skeleton className="h-3.5 w-3.5 rounded" />
                <Skeleton className="h-5 w-14" />
              </div>
              <div className="px-5 py-4">
                <Skeleton className="h-4 w-full mb-2" />
                <Skeleton className="h-4 w-3/4" />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
