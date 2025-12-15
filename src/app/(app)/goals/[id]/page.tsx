import { createClient } from "@/utils/supabase/server";
import { GoalDetailClient } from "@/components/goals/goal-detail-client";
import { redirect } from "next/navigation";
import {
  aggregateSingleGoalHistory,
  classifyGoalStatus,
  getStartDateForPeriod,
} from "@/lib/goal-calculations";
import type { GoalContribution, GoalForCalculation } from "@/lib/goal-calculations";

interface GoalDetailPageProps {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}

export default async function GoalDetailPage({ params, searchParams }: GoalDetailPageProps) {
  const { id } = await params;
  const resolvedSearchParams = await searchParams;
  const period = (typeof resolvedSearchParams.period === "string" ? resolvedSearchParams.period : "3M") as string;

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  // Fetch the goal with linked account
  const { data: goal } = await supabase
    .from("savings_goals")
    .select(`
      *,
      linked_account:accounts(id, display_name, balance_cents, up_account_id)
    `)
    .eq("id", id)
    .maybeSingle();

  if (!goal) {
    redirect("/goals");
  }

  // Verify ownership through partnership
  const { data: membership } = await supabase
    .from("partnership_members")
    .select("partnership_id")
    .eq("user_id", user?.id || "")
    .limit(1)
    .maybeSingle();

  if (goal.partnership_id !== membership?.partnership_id) {
    redirect("/goals");
  }

  const now = new Date();
  const startDate = getStartDateForPeriod(period, now);
  const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;

  // Parallel data fetching
  const [{ data: contributions }, { data: goalAssignment }] = await Promise.all([
    // All contributions for this goal
    supabase
      .from("goal_contributions")
      .select("id, goal_id, amount_cents, balance_after_cents, source, created_at")
      .eq("goal_id", id)
      .order("created_at", { ascending: true }),
    // Budget allocation for this goal this month
    supabase
      .from("budget_assignments")
      .select("assigned_cents")
      .eq("partnership_id", goal.partnership_id)
      .eq("assignment_type", "goal")
      .eq("goal_id", id)
      .eq("month", currentMonth)
      .maybeSingle(),
  ]);

  const typedContributions: GoalContribution[] = (contributions || []).map((c: any) => ({
    id: c.id,
    goal_id: c.goal_id,
    amount_cents: c.amount_cents,
    balance_after_cents: c.balance_after_cents,
    source: c.source,
    created_at: c.created_at,
  }));

  const goalForCalc: GoalForCalculation = {
    id: goal.id,
    name: goal.name,
    icon: goal.icon,
    color: goal.color,
    current_amount_cents: goal.current_amount_cents,
    target_amount_cents: goal.target_amount_cents,
    deadline: goal.deadline,
    is_completed: goal.is_completed,
    created_at: goal.created_at,
  };

  // History chart data
  const historyData = aggregateSingleGoalHistory(
    goalForCalc,
    typedContributions,
    startDate,
    now
  );

  // Goal status
  const budgetAllocationCents = goalAssignment?.assigned_cents || 0;
  const status = classifyGoalStatus(goalForCalc, typedContributions, budgetAllocationCents || undefined);

  // Recent contributions for the log (newest first, limited)
  const recentContributions = [...typedContributions]
    .filter((c) => c.source !== "initial")
    .reverse()
    .slice(0, 20);

  return (
    <div className="p-4 md:p-6 lg:p-8">
      <GoalDetailClient
        goal={goal}
        historyData={historyData}
        currentPeriod={period}
        status={status}
        budgetAllocationCents={budgetAllocationCents}
        recentContributions={recentContributions}
      />
    </div>
  );
}
