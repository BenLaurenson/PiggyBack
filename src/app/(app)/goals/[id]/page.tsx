import { createClient } from "@/utils/supabase/server";
import { GoalDetailClient } from "@/components/goals/goal-detail-client";
import { redirect } from "next/navigation";
import {
  aggregateSingleGoalHistory,
  classifyGoalStatus,
  getStartDateForPeriod,
  projectGoalEndDate,
} from "@/lib/goal-calculations";
import type { GoalContribution, GoalForCalculation } from "@/lib/goal-calculations";
import { nextPaydayInfo, daysUntil } from "@/lib/goal-calendar";
import {
  buildTaskInputSignature,
  evaluateTaskCache,
  generateFallbackGoalTasks,
  packGeneratedTasks,
} from "@/lib/goal-tasks";
import type { GoalTask } from "@/lib/goal-tasks";

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

  // Income lookback for payday detection — last 6 months of salary/income.
  const incomeLookback = new Date(now);
  incomeLookback.setMonth(incomeLookback.getMonth() - 6);

  // Parallel data fetching — keep this set wide enough to power the
  // existing chart/log, the new payday/projection cards (#52), and the
  // polymorphic entity_tags picker (#47).
  const [
    { data: contributions },
    { data: goalAssignment },
    { data: tagRows },
    { data: incomeSources },
    { data: incomeTransactions },
    { data: userAccounts },
  ] = await Promise.all([
    supabase
      .from("goal_contributions")
      .select("id, goal_id, amount_cents, balance_after_cents, source, created_at")
      .eq("goal_id", id)
      .order("created_at", { ascending: true }),
    supabase
      .from("budget_assignments")
      .select("assigned_cents")
      .eq("partnership_id", goal.partnership_id)
      .eq("assignment_type", "goal")
      .eq("goal_id", id)
      .eq("month", currentMonth)
      .maybeSingle(),
    // Polymorphic entity tags for this goal (#47).
    supabase
      .from("entity_tags")
      .select("tag_name")
      .eq("entity_type", "goal")
      .eq("entity_id", id)
      .order("created_at", { ascending: true }),
    // Configured recurring income — preferred source for "next payday" (#52).
    supabase
      .from("income_sources")
      .select("frequency, next_pay_date, source_type, is_active")
      .eq("partnership_id", goal.partnership_id),
    // Salary-tagged transactions for fallback pattern detection (#52).
    user?.id
      ? supabase
          .from("transactions")
          .select("id, description, amount_cents, created_at")
          .eq("is_income", true)
          .eq("income_type", "salary")
          .gte("created_at", incomeLookback.toISOString())
          .order("created_at", { ascending: false })
          .limit(40)
      : Promise.resolve({ data: [] }),
    // The current user's accounts — used to gate the income query above (#52).
    user?.id
      ? supabase.from("accounts").select("id").eq("user_id", user.id)
      : Promise.resolve({ data: [] }),
  ]);

  const initialTags = (tagRows || []).map((r: { tag_name: string }) => r.tag_name);

  const typedContributions: GoalContribution[] = (contributions || []).map(
    (c: Record<string, unknown>) => ({
      id: c.id as string,
      goal_id: c.goal_id as string,
      amount_cents: c.amount_cents as number,
      balance_after_cents: c.balance_after_cents as number,
      source: c.source as GoalContribution["source"],
      created_at: c.created_at as string,
    })
  );

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

  // Goal status (existing)
  const budgetAllocationCents = goalAssignment?.assigned_cents || 0;
  const status = classifyGoalStatus(goalForCalc, typedContributions, budgetAllocationCents || undefined);

  // Phase 1 #52 — live velocity-based projection (60-day trailing window)
  const projection = projectGoalEndDate(goalForCalc, typedContributions, { now });

  // Phase 1 #52 — calendar-aware days remaining and next payday
  const weekdayOnlyCadence = !!goal.weekday_only_cadence;
  const calendarDaysToDeadline = goal.deadline
    ? daysUntil(goal.deadline, now, { skipWeekends: false })
    : null;
  const cadenceDaysToDeadline = goal.deadline
    ? daysUntil(goal.deadline, now, { skipWeekends: weekdayOnlyCadence })
    : null;

  // userAccounts is fetched as part of the parallel batch but isn't
  // currently used for filtering — RLS already restricts is_income rows
  // to the user's own accounts. We keep the query around (cheap) for
  // future tightening (e.g. multi-partner shared income).
  void userAccounts;

  const payday = nextPaydayInfo({
    incomeTransactions: (incomeTransactions || []).map(
      (t: { id: string; description: string; amount_cents: number; created_at: string }) => ({
        id: t.id,
        description: t.description,
        amount_cents: t.amount_cents,
        created_at: t.created_at,
      })
    ),
    incomeSources: (incomeSources || []).map(
      (s: {
        frequency: string | null;
        next_pay_date: string | null;
        source_type: string | null;
        is_active: boolean | null;
      }) => ({
        frequency: s.frequency,
        next_pay_date: s.next_pay_date,
        source_type: s.source_type,
        is_active: s.is_active,
      })
    ),
    now,
  });

  // Phase 1 #52 — generated tasks. Use cache if fresh; otherwise produce
  // a fresh fallback locally on the server (no AI credits spent on every
  // page load). The 24h TTL + signature check happens server-side.
  const liveSignature = buildTaskInputSignature({
    current_amount_cents: goal.current_amount_cents,
    target_amount_cents: goal.target_amount_cents,
    deadline: goal.deadline,
    is_completed: goal.is_completed,
    linked_account_id: goal.linked_account_id,
  });

  const cacheStatus = evaluateTaskCache(
    {
      tasks_generated_at: goal.tasks_generated_at,
      tasks_input_signature: goal.tasks_input_signature,
      generated_tasks: goal.generated_tasks,
    },
    liveSignature,
    now
  );

  let generatedTasks: GoalTask[];
  let tasksSource: "ai" | "fallback";
  let tasksGeneratedAt: string;

  if (cacheStatus.isFresh && goal.generated_tasks?.tasks) {
    const cached = goal.generated_tasks as { tasks: GoalTask[]; source: "ai" | "fallback"; generatedAt: string };
    generatedTasks = cached.tasks;
    tasksSource = cached.source;
    tasksGeneratedAt = cached.generatedAt;
  } else {
    // Cache miss: produce a fresh fallback inline (cheap, deterministic).
    // The async server action regenerateGoalTasks will persist this on
    // next state change or manual refresh. We don't write here because
    // RSCs shouldn't trigger DB writes during render.
    const fresh = generateFallbackGoalTasks(goalForCalc, typedContributions, {
      hasLinkedSaver: !!goal.linked_account_id,
      now,
    });
    const packed = packGeneratedTasks(fresh, liveSignature, "fallback", now);
    generatedTasks = packed.tasks;
    tasksSource = packed.source;
    tasksGeneratedAt = packed.generatedAt;
  }

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
        initialTags={initialTags}
        projection={{
          projectedDateIso: projection.projectedDate?.toISOString() ?? null,
          targetDateIso: projection.targetDate?.toISOString() ?? null,
          deltaDays: projection.deltaDays,
          state: projection.state,
          velocity: {
            centsPerDay: projection.velocity.centsPerDay,
            centsPerFortnight: projection.velocity.centsPerFortnight,
            centsPerMonth: projection.velocity.centsPerMonth,
            sampleSize: projection.velocity.sampleSize,
            windowDays: projection.velocity.windowDays,
          },
        }}
        calendar={{
          weekdayOnlyCadence,
          calendarDaysToDeadline,
          cadenceDaysToDeadline,
        }}
        payday={{
          frequency: payday.frequency,
          nextPaydayIso: payday.nextPaydayIso,
          daysUntil: payday.daysUntil,
          confidence: payday.confidence,
        }}
        generatedTasks={{
          tasks: generatedTasks,
          source: tasksSource,
          generatedAt: tasksGeneratedAt,
          isCached: cacheStatus.isFresh,
          cacheReason: cacheStatus.reason,
        }}
      />
    </div>
  );
}
