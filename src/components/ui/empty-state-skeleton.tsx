import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent } from "@/components/ui/card";

export function EmptyStateSkeleton() {
  return (
    <Card
      className="border-0 shadow-lg"
      style={{ backgroundColor: "var(--surface-elevated)" }}
    >
      <CardContent className="p-0">
        <div className="text-center py-16">
          <Skeleton className="h-[72px] w-[72px] rounded-2xl mx-auto mb-4" />
          <Skeleton className="h-6 w-56 mx-auto mb-2" />
          <Skeleton className="h-4 w-72 mx-auto mb-6" />
          <Skeleton className="h-10 w-36 rounded-xl mx-auto" />
        </div>
      </CardContent>
    </Card>
  );
}
