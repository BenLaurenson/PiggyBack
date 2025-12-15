import { createClient } from "@/utils/supabase/server";
import { redirect } from "next/navigation";
import { getUserPartnershipId } from "@/lib/get-user-partnership";
import { EditGoalClient } from "@/components/goals/edit-goal-client";

interface EditGoalPageProps {
  params: Promise<{ id: string }>;
}

export default async function EditGoalPage({ params }: EditGoalPageProps) {
  const { id } = await params;

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // Verify partnership ownership
  const partnershipId = await getUserPartnershipId(supabase, user.id);
  if (!partnershipId) redirect("/goals");

  // Fetch the goal
  const { data: goal } = await supabase
    .from("savings_goals")
    .select("id, name, target_amount_cents, current_amount_cents, deadline, icon, color, linked_account_id, partnership_id")
    .eq("id", id)
    .maybeSingle();

  if (!goal) redirect("/goals");

  // Verify the goal belongs to the user's partnership
  if (goal.partnership_id !== partnershipId) {
    redirect("/goals");
  }

  // Fetch saver accounts for linking
  const { data: saverAccounts } = await supabase
    .from("accounts")
    .select("id, display_name, balance_cents")
    .eq("user_id", user.id)
    .eq("account_type", "SAVER")
    .eq("is_active", true)
    .order("display_name");

  return (
    <EditGoalClient
      goal={{
        id: goal.id,
        name: goal.name,
        target_amount_cents: goal.target_amount_cents,
        current_amount_cents: goal.current_amount_cents,
        deadline: goal.deadline,
        icon: goal.icon,
        color: goal.color,
        linked_account_id: goal.linked_account_id,
      }}
      saverAccounts={saverAccounts || []}
    />
  );
}
