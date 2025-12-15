/**
 * budget-context.tsx — Lean budget state provider.
 *
 * Replaces the old BudgetZeroProvider which cached data client-side and ran
 * calculations in the browser. This provider is intentionally simple:
 *   - No client-side caching — every navigation or mutation re-fetches from
 *     the server via /api/budget/summary
 *   - The server runs the pure budget-engine and returns a complete summary
 *   - Provider just holds the latest summary, current date, and budget record
 *
 * Actions: navigatePeriod, setDate, assignAmount, updateSettings, refresh
 */
"use client";

import { createContext, useContext, ReactNode, useState, useCallback, useRef } from "react";
import { getNextPeriodDate, getPreviousPeriodDate, getMonthKeyForPeriod } from "@/lib/budget-engine";
import type { PeriodType, BudgetRow, MethodologySection } from "@/lib/budget-engine";
import { updateBudget } from "@/app/actions/budgets";
import type { UserBudget } from "@/app/actions/budgets";

// Summary returned by /api/budget/summary
export interface BudgetSummaryResponse {
  income: number;
  budgeted: number;
  spent: number;
  carryover: number;
  tbb: number;
  rows: BudgetRow[];
  methodologySections?: MethodologySection[];
  periodLabel: string;
  periodStart: string;
  periodEnd: string;
  monthKey: string;
}

interface BudgetContextValue {
  // State
  budget: UserBudget;
  summary: BudgetSummaryResponse | null;
  currentDate: Date;
  isLoading: boolean;

  // Actions
  navigatePeriod: (direction: "next" | "prev") => Promise<void>;
  setDate: (date: Date) => Promise<void>;
  updateSettings: (changes: Partial<Pick<UserBudget, "name" | "emoji" | "methodology" | "budget_view" | "period_type" | "category_filter" | "color">>) => Promise<void>;
  assignAmount: (params: {
    partnershipId: string;
    categoryName: string;
    subcategoryName?: string;
    goalId?: string;
    assetId?: string;
    assignmentType?: string;
    amountCents: number;
  }) => Promise<void>;
  refresh: () => Promise<void>;
}

const BudgetContext = createContext<BudgetContextValue | null>(null);

interface BudgetProviderProps {
  children: ReactNode;
  budget: UserBudget;
  initialSummary: BudgetSummaryResponse;
  initialDate?: Date;
}

export function BudgetProvider({
  children,
  budget: initialBudget,
  initialSummary,
  initialDate,
}: BudgetProviderProps) {
  const [budget, setBudget] = useState<UserBudget>(initialBudget);
  const [summary, setSummary] = useState<BudgetSummaryResponse | null>(initialSummary);
  const [currentDate, setCurrentDate] = useState<Date>(initialDate ?? new Date());
  const [isLoading, setIsLoading] = useState(false);

  // Monotonically increasing ID for each fetch request. When a response arrives,
  // we check if its requestId === fetchIdRef.current. If not, a newer request has
  // been fired (e.g. user clicked "next" twice quickly) and this response is stale —
  // we discard it to prevent the UI from briefly showing an old period's data.
  const fetchIdRef = useRef(0);

  // Refs mirror the latest state values so that callbacks created via useCallback
  // (which capture stale closures) can always read the current budget/date without
  // needing them in dependency arrays. Without this pattern, navigatePeriod would
  // read the date from when the callback was created, not the latest date.
  const budgetRef = useRef(budget);
  budgetRef.current = budget;
  const currentDateRef = useRef(currentDate);
  currentDateRef.current = currentDate;

  const fetchSummary = useCallback(async (date: Date, budgetId: string): Promise<BudgetSummaryResponse | null> => {
    const requestId = ++fetchIdRef.current;
    setIsLoading(true);

    try {
      const res = await fetch(
        `/api/budget/summary?budget_id=${budgetId}&date=${date.toISOString()}`
      );
      if (!res.ok) {
        console.error("Failed to fetch budget summary:", await res.text());
        return null;
      }
      const data: BudgetSummaryResponse = await res.json();

      // Only update state if this is still the latest request
      if (requestId === fetchIdRef.current) {
        setSummary(data);
        setIsLoading(false);
      }
      return data;
    } catch (err) {
      console.error("Budget summary fetch error:", err);
      if (requestId === fetchIdRef.current) {
        setIsLoading(false);
      }
      return null;
    }
  }, []);

  const refresh = useCallback(async () => {
    await fetchSummary(currentDateRef.current, budgetRef.current.id);
  }, [fetchSummary]);

  const navigatePeriod = useCallback(async (direction: "next" | "prev") => {
    const periodType = budgetRef.current.period_type as PeriodType;
    const newDate =
      direction === "next"
        ? getNextPeriodDate(currentDateRef.current, periodType)
        : getPreviousPeriodDate(currentDateRef.current, periodType);

    setCurrentDate(newDate);
    currentDateRef.current = newDate;
    await fetchSummary(newDate, budgetRef.current.id);
  }, [fetchSummary]);

  const setDate = useCallback(async (date: Date) => {
    setCurrentDate(date);
    currentDateRef.current = date;
    await fetchSummary(date, budgetRef.current.id);
  }, [fetchSummary]);

  const updateSettings = useCallback(async (
    changes: Partial<Pick<UserBudget, "name" | "emoji" | "methodology" | "budget_view" | "period_type" | "category_filter" | "color">>
  ) => {
    const result = await updateBudget(budgetRef.current.id, changes);
    if ("data" in result && result.data) {
      setBudget(result.data);
      budgetRef.current = result.data;
    }
    // Always refresh after settings change
    await fetchSummary(currentDateRef.current, budgetRef.current.id);
  }, [fetchSummary]);

  const assignAmount = useCallback(async (params: {
    partnershipId: string;
    categoryName: string;
    subcategoryName?: string;
    goalId?: string;
    assetId?: string;
    assignmentType?: string;
    amountCents: number;
  }) => {
    const monthKey = getMonthKeyForPeriod(currentDateRef.current);

    const res = await fetch("/api/budget/zero/assign", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        partnership_id: params.partnershipId,
        month: monthKey,
        category_name: params.categoryName,
        subcategory_name: params.subcategoryName,
        goal_id: params.goalId,
        asset_id: params.assetId,
        assignment_type: params.assignmentType ?? "category",
        assigned_cents: params.amountCents,
        budget_view: budgetRef.current.budget_view,
        budget_id: budgetRef.current.id,
      }),
    });

    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || "Failed to assign amount");
    }

    // Refresh to get updated summary
    await fetchSummary(currentDateRef.current, budgetRef.current.id);
  }, [fetchSummary]);

  const value: BudgetContextValue = {
    budget,
    summary,
    currentDate,
    isLoading,
    navigatePeriod,
    setDate,
    updateSettings,
    assignAmount,
    refresh,
  };

  return (
    <BudgetContext.Provider value={value}>
      {children}
    </BudgetContext.Provider>
  );
}

export function useBudget() {
  const context = useContext(BudgetContext);
  if (!context) {
    throw new Error("useBudget must be used within BudgetProvider");
  }
  return context;
}
