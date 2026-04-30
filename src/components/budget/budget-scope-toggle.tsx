"use client";

import { useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { User, Users, Layers } from "lucide-react";
import { useBudget } from "@/contexts/budget-context";
import type { BudgetScope } from "@/lib/budget-engine";

/**
 * Personal | Shared | Combined toggle for the 2Up budget views.
 *
 * - "Personal":  filters to ownership_type='INDIVIDUAL' (each partner's accounts).
 * - "Shared":    filters to ownership_type='JOINT' (the 2Up account).
 * - "Combined":  no ownership filter — both INDIVIDUAL and JOINT accounts.
 *
 * Drives both:
 *   1. The URL `?view=` query param so the choice survives a refresh and can
 *      be bookmarked / shared (matches the spec "/budget?view=shared").
 *   2. The BudgetContext's in-memory scope state so client-side period
 *      navigation re-fetches with the same scope.
 */
export function BudgetScopeToggle() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { scope, setScope } = useBudget();
  const [isPending, startTransition] = useTransition();

  const handleChange = (value: string) => {
    const next = value as BudgetScope;
    if (next === scope) return;

    // Update URL so SSR + bookmarking work
    const params = new URLSearchParams(searchParams.toString());
    if (next === "combined") {
      params.delete("view");
    } else {
      params.set("view", next);
    }

    startTransition(() => {
      router.replace(`/budget?${params.toString()}`, { scroll: false });
    });

    // Refetch summary client-side
    void setScope(next);
  };

  return (
    <Tabs value={scope} onValueChange={handleChange}>
      <TabsList className="h-8" aria-label="Budget account scope">
        <TabsTrigger
          value="personal"
          className="text-xs gap-1.5 cursor-pointer"
          disabled={isPending}
        >
          <User className="h-3.5 w-3.5" aria-hidden="true" />
          Personal
        </TabsTrigger>
        <TabsTrigger
          value="shared"
          className="text-xs gap-1.5 cursor-pointer"
          disabled={isPending}
        >
          <Users className="h-3.5 w-3.5" aria-hidden="true" />
          Shared
        </TabsTrigger>
        <TabsTrigger
          value="combined"
          className="text-xs gap-1.5 cursor-pointer"
          disabled={isPending}
        >
          <Layers className="h-3.5 w-3.5" aria-hidden="true" />
          Combined
        </TabsTrigger>
      </TabsList>
    </Tabs>
  );
}
