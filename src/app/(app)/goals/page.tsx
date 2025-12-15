import { createClient } from "@/utils/supabase/server";
import { redirect } from "next/navigation";
import { GoalsClient } from "@/components/goals/goals-client";
import { EmptyState } from "@/components/ui/empty-state";
import { getUserPartnershipId } from "@/lib/get-user-partnership";
import {
  aggregateGoalHistory,
  classifyGoalStatus,
  getStartDateForPeriod,
} from "@/lib/goal-calculations";
import type { GoalContribution, GoalForCalculation, GoalStatus } from "@/lib/goal-calculations";

interface GoalsPageProps {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}

export default async function GoalsPage({ searchParams }: GoalsPageProps) {
  const params = await searchParams;
  const period = (typeof params.period === "string" ? params.period : "3M") as string;

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const partnershipId = await getUserPartnershipId(supabase, user.id);

  // Fetch all goals with linked accounts
  const { data: goals } = await supabase
    .from("savings_goals")
    .select(`
      *,
      linked_account:accounts(id, display_name, balance_cents, up_account_id)
    `)
    .eq("partnership_id", partnershipId)
    .order("created_at", { ascending: false });

  if (!goals || goals.length === 0) {
    return (
      <div className="p-4 md:p-6 space-y-6">
        <EmptyState
          icon="🎯"
          title="Create your first savings goal"
          description="Set a target and track your progress toward your financial goals."
          action={{ label: "New Goal", href: "/goals/new", color: "yellow" }}
        />
      </div>
    );
  }

  const goalIds = goals.map((g) => g.id);
  const now = new Date();
  const startDate = getStartDateForPeriod(period, now);
  const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;

  // Parallel data fetching (matching invest page pattern)
  const [
    { data: saverAccounts },
    { data: contributions },
    { data: goalAssignments },
    { data: profile },
  ] = await Promise.all([
    // Saver accounts for linking
    supabase
      .from("accounts")
      .select("id, display_name, balance_cents, up_account_id, account_type")
      .eq("user_id", user.id)
      .eq("account_type", "SAVER")
      .eq("is_active", true)
      .order("display_name"),
    // All contributions for history chart
    supabase
      .from("goal_contributions")
      .select("id, goal_id, amount_cents, balance_after_cents, source, created_at")
      .in("goal_id", goalIds)
      .order("created_at", { ascending: true }),
    // Budget allocations for goals this month
    supabase
      .from("budget_assignments")
      .select("goal_id, assigned_cents")
      .eq("partnership_id", partnershipId)
      .eq("assignment_type", "goal")
      .eq("month", currentMonth),
    // FIRE profile for cross-link card
    supabase
      .from("profiles")
      .select("fire_onboarded, fire_variant")
      .eq("id", user.id)
      .maybeSingle(),
  ]);

  // Separate active and completed goals
  const activeGoals = goals.filter((g) => !g.is_completed);
  const completedGoals = goals.filter((g) => g.is_completed);

  // Calculate totals
  const totalTarget = activeGoals.reduce((sum, g) => sum + g.target_amount_cents, 0);
  const totalCurrent = activeGoals.reduce((sum, g) => sum + g.current_amount_cents, 0);

  // Build budget allocation map: goalId -> assigned cents
  const budgetMap = new Map<string, number>();
  for (const a of goalAssignments || []) {
    if (a.goal_id && a.assigned_cents) {
      budgetMap.set(a.goal_id, a.assigned_cents);
    }
  }

  // Aggregate savings history for chart
  const activeGoalsForCalc: GoalForCalculation[] = activeGoals.map((g) => ({
    id: g.id,
    name: g.name,
    icon: g.icon,
    color: g.color,
    current_amount_cents: g.current_amount_cents,
    target_amount_cents: g.target_amount_cents,
    deadline: g.deadline,
    is_completed: g.is_completed,
    created_at: g.created_at,
  }));

  const typedContributions: GoalContribution[] = (contributions || []).map((c: any) => ({
    id: c.id,
    goal_id: c.goal_id,
    amount_cents: c.amount_cents,
    balance_after_cents: c.balance_after_cents,
    source: c.source,
    created_at: c.created_at,
  }));

  const savingsHistory = aggregateGoalHistory(
    activeGoalsForCalc,
    typedContributions,
    startDate,
    now
  );

  // Classify status for each active goal
  const goalStatuses: Record<string, GoalStatus> = {};
  for (const goal of activeGoalsForCalc) {
    const goalContribs = typedContributions.filter((c) => c.goal_id === goal.id);
    const budgetAllocation = budgetMap.get(goal.id);
    goalStatuses[goal.id] = classifyGoalStatus(goal, goalContribs, budgetAllocation);
  }

  // Budget allocations for sidebar
  const budgetAllocations = activeGoals
    .filter((g) => budgetMap.has(g.id))
    .map((g) => ({
      goalName: g.name,
      goalIcon: g.icon,
      assignedCents: budgetMap.get(g.id) || 0,
    }));
  const totalBudgetAllocation = budgetAllocations.reduce((s, a) => s + a.assignedCents, 0);

  return (
    <div className="p-4 md:p-6 lg:p-8">
      <GoalsClient
        activeGoals={activeGoals}
        completedGoals={completedGoals}
        totalTarget={totalTarget}
        totalCurrent={totalCurrent}
        saverAccounts={saverAccounts || []}
        savingsHistory={savingsHistory}
        currentPeriod={period}
        goalStatuses={goalStatuses}
        budgetAllocations={budgetAllocations}
        totalBudgetAllocation={totalBudgetAllocation}
        currentMonth={now.toLocaleDateString("en-AU", { month: "short", year: "numeric" })}
        fireOnboarded={profile?.fire_onboarded || false}
      />
    </div>
  );
}
