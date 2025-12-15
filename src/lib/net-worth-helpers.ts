import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Upsert today's net_worth_snapshot with the current investment total.
 * Called after investment price updates to keep net worth current.
 */
export async function upsertInvestmentNetWorth(
  supabase: SupabaseClient,
  partnershipId: string
) {
  // Sum all investment values for this partnership
  const { data: investments } = await supabase
    .from("investments")
    .select("current_value_cents")
    .eq("partnership_id", partnershipId);

  const investmentTotal = (investments || []).reduce(
    (sum, inv) => sum + (inv.current_value_cents || 0),
    0
  );

  const today = new Date().toISOString().split("T")[0];

  // Check if today's snapshot exists to decide what fields to set
  const { data: existing } = await supabase
    .from("net_worth_snapshots")
    .select("id")
    .eq("partnership_id", partnershipId)
    .eq("snapshot_date", today)
    .maybeSingle();

  if (existing) {
    // Snapshot exists — only update investment total
    await supabase
      .from("net_worth_snapshots")
      .update({ investment_total_cents: investmentTotal })
      .eq("id", existing.id);
  } else {
    // No snapshot yet — carry forward bank balance from most recent snapshot.
    // Use upsert with onConflict to avoid race condition if a concurrent
    // process creates the snapshot between our SELECT and INSERT.
    const { data: recent } = await supabase
      .from("net_worth_snapshots")
      .select("total_balance_cents, account_breakdown")
      .eq("partnership_id", partnershipId)
      .order("snapshot_date", { ascending: false })
      .limit(1)
      .maybeSingle();

    await supabase.from("net_worth_snapshots").upsert(
      {
        partnership_id: partnershipId,
        snapshot_date: today,
        total_balance_cents: recent?.total_balance_cents || 0,
        account_breakdown: recent?.account_breakdown || [],
        investment_total_cents: investmentTotal,
      },
      { onConflict: "partnership_id,snapshot_date" }
    );
  }
}
