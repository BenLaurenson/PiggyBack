"use server";

import { createClient } from "@/utils/supabase/server";
import { revalidatePath } from "next/cache";
import { demoActionGuard } from "@/lib/demo-guard";
import { safeErrorMessage } from "@/lib/safe-error";

export async function markTransactionAsIncome(
  transactionId: string,
  isIncome: boolean,
  incomeType?: string | null
) {
  const blocked = demoActionGuard(); if (blocked) return blocked;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return { error: "Not authenticated" };
  }

  // Get the transaction with its description
  const { data: transaction } = await supabase
    .from("transactions")
    .select("account_id, description")
    .eq("id", transactionId)
    .maybeSingle();

  if (!transaction) {
    return { error: "Transaction not found" };
  }

  // Verify the account belongs to the user
  const { data: account } = await supabase
    .from("accounts")
    .select("user_id")
    .eq("id", transaction.account_id)
    .maybeSingle();

  if (!account || account.user_id !== user.id) {
    return { error: "Unauthorized" };
  }

  // Get ALL user's accounts to mark ALL matching transactions across all accounts
  const { data: userAccounts } = await supabase
    .from("accounts")
    .select("id")
    .eq("user_id", user.id);

  const accountIds = userAccounts?.map(a => a.id) || [];

  // Mark ALL transactions with the same description as income (past and future)
  const { error } = await supabase
    .from("transactions")
    .update({
      is_income: isIncome,
      income_type: incomeType,
    })
    .in("account_id", accountIds)
    .eq("description", transaction.description);

  if (error) {
    return { error: safeErrorMessage(error, "Failed to update transaction") };
  }

  revalidatePath("/activity");
  revalidatePath("/home");
  revalidatePath("/settings/income");
  return { success: true };
}



