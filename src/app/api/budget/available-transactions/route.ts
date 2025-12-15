import { createClient } from "@/utils/supabase/server";
import { NextResponse } from "next/server";
import { getEffectiveAccountIds } from "@/lib/get-effective-account-ids";

/**
 * GET /api/budget/available-transactions
 * Returns recent unmatched expense transactions for a partnership.
 * Used by the "Link another transaction" picker in the expense edit modal.
 *
 * Query params:
 *   partnership_id (required) - the partnership to scope transactions to
 *   search (optional) - description search filter
 */
export async function GET(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const partnershipId = searchParams.get("partnership_id");
  const search = searchParams.get("search");

  if (!partnershipId) {
    return NextResponse.json(
      { error: "Missing partnership_id" },
      { status: 400 }
    );
  }

  // Verify membership
  const { data: membership } = await supabase
    .from("partnership_members")
    .select("partnership_id")
    .eq("user_id", user.id)
    .eq("partnership_id", partnershipId)
    .maybeSingle();

  if (!membership) {
    return NextResponse.json({ error: "Not authorized" }, { status: 403 });
  }

  const accountIds = await getEffectiveAccountIds(
    supabase,
    partnershipId,
    user.id,
    "shared"
  );

  if (accountIds.length === 0) {
    return NextResponse.json({ transactions: [] });
  }

  // Fetch recent expense transactions with their match status
  let query = supabase
    .from("transactions")
    .select(
      "id, description, amount_cents, settled_at, created_at, status, expense_matches(expense_definition_id)"
    )
    .in("account_id", accountIds)
    .lt("amount_cents", 0)
    .is("transfer_account_id", null)
    .order("settled_at", { ascending: false, nullsFirst: false })
    .limit(100);

  if (search) {
    query = query.ilike("description", `%${search}%`);
  }

  const { data: transactions, error } = await query;

  if (error) {
    console.error("Error fetching available transactions:", error);
    return NextResponse.json(
      { error: "Failed to fetch transactions" },
      { status: 500 }
    );
  }

  // Filter out transactions that already have expense matches
  const unmatched = (transactions || [])
    .filter(
      (t: any) =>
        !t.expense_matches || t.expense_matches.length === 0
    )
    .map(({ expense_matches, ...rest }: any) => rest)
    .slice(0, 50);

  return NextResponse.json({ transactions: unmatched });
}
