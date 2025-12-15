import { createClient } from "@/utils/supabase/server";
import { redirect } from "next/navigation";
import { BudgetCreateWizard } from "@/components/budget/budget-create-wizard";

export default async function BudgetCreatePage({
  searchParams,
}: {
  searchParams: Promise<{ template?: string }>;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/sign-in");

  // Get partnership
  const { data: membership } = await supabase
    .from("partnership_members")
    .select("partnership_id")
    .eq("user_id", user.id)
    .single();

  if (!membership) redirect("/deploy");

  const partnershipId = membership.partnership_id;

  // Fetch prerequisites data in parallel
  const [
    incomeResult,
    partnerIncomeResult,
    bankConfigResult,
    expensesResult,
    goalsResult,
    investmentsResult,
    partnerResult,
    existingAssignmentsResult,
  ] = await Promise.all([
    // User's recurring salary (exclude manual partner income)
    supabase
      .from("income_sources")
      .select("id")
      .eq("user_id", user.id)
      .eq("source_type", "recurring-salary")
      .eq("is_active", true)
      .eq("is_manual_partner_income", false)
      .limit(1),

    // Partner income sources (real partner's income OR manual partner income)
    supabase
      .from("income_sources")
      .select("id")
      .eq("partnership_id", partnershipId)
      .or(`user_id.neq.${user.id},is_manual_partner_income.eq.true`)
      .eq("is_active", true)
      .limit(1),

    // Bank connection
    supabase
      .from("up_api_configs")
      .select("id")
      .eq("user_id", user.id)
      .eq("is_active", true)
      .limit(1),

    // Recurring expenses count
    supabase
      .from("expense_definitions")
      .select("id", { count: "exact", head: true })
      .eq("partnership_id", partnershipId)
      .eq("is_active", true),

    // Savings goals (id + name for wizard)
    supabase
      .from("savings_goals")
      .select("id, name")
      .eq("partnership_id", partnershipId)
      .eq("is_completed", false),

    // Investments (id + name for wizard)
    supabase
      .from("investments")
      .select("id, name")
      .eq("partnership_id", partnershipId),

    // Partner info
    supabase
      .from("partnership_members")
      .select("user_id, profiles(display_name)")
      .eq("partnership_id", partnershipId)
      .neq("user_id", user.id)
      .limit(1),

    // Check for existing budget data (for import option)
    supabase
      .from("budget_assignments")
      .select("id", { count: "exact", head: true })
      .eq("partnership_id", partnershipId)
      .is("budget_id", null),
  ]);

  // Also check manual partner
  const { data: partnership } = await supabase
    .from("partnerships")
    .select("manual_partner_name")
    .eq("id", partnershipId)
    .single();

  const hasPartner =
    (partnerResult.data && partnerResult.data.length > 0) ||
    !!partnership?.manual_partner_name;

  const params = await searchParams;

  const goals = (goalsResult.data ?? []) as { id: string; name: string }[];
  const investments = (investmentsResult.data ?? []) as { id: string; name: string }[];

  const prerequisites = {
    hasSalary: (incomeResult.data?.length ?? 0) > 0,
    hasPartnerIncome: (partnerIncomeResult.data?.length ?? 0) > 0,
    hasBankConnection: (bankConfigResult.data?.length ?? 0) > 0,
    expenseCount: expensesResult.count ?? 0,
    goalCount: goals.length,
    investmentCount: investments.length,
    hasPartner,
    hasExistingBudgetData: (existingAssignmentsResult.count ?? 0) > 0,
    goals,
    investments,
  };

  return (
    <div
      className="min-h-screen pb-24"
      style={{ backgroundColor: "var(--background)" }}
    >
      <BudgetCreateWizard
        partnershipId={partnershipId}
        prerequisites={prerequisites}
        initialTemplate={params.template ?? null}
      />
    </div>
  );
}
