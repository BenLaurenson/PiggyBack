/**
 * Daily resource-usage counter for Supabase Mgmt + Vercel API calls.
 * Called from every external Mgmt API call so we can alert before quota.
 */
import { createServiceRoleClient } from "@/utils/supabase/service-role";

export type ResourceType = "supabase_mgmt" | "vercel" | "provisions_created";

export async function incrementResourceUsage(
  resourceType: ResourceType,
  delta = 1
): Promise<void> {
  try {
    const supabase = createServiceRoleClient();
    const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD

    // Read-modify-write isn't great but volumes are tiny (<10k/day) and
    // we don't have a stored proc here. Race conditions slightly undercount
    // — acceptable for a quota signal.
    const { data: existing } = await supabase
      .from("provision_resource_usage")
      .select("call_count")
      .eq("date", today)
      .eq("resource_type", resourceType)
      .maybeSingle();

    if (existing) {
      await supabase
        .from("provision_resource_usage")
        .update({ call_count: (existing.call_count as number) + delta })
        .eq("date", today)
        .eq("resource_type", resourceType);
    } else {
      await supabase
        .from("provision_resource_usage")
        .insert({ date: today, resource_type: resourceType, call_count: delta });
    }
  } catch (err) {
    // Counter failures must never break the actual API call.
    console.warn(`[resource-usage] failed to increment ${resourceType}:`, err);
  }
}

export async function getDailyUsage(
  resourceType: ResourceType,
  date?: string
): Promise<number> {
  const supabase = createServiceRoleClient();
  const day = date ?? new Date().toISOString().slice(0, 10);
  const { data } = await supabase
    .from("provision_resource_usage")
    .select("call_count")
    .eq("date", day)
    .eq("resource_type", resourceType)
    .maybeSingle();
  return ((data?.call_count as number | undefined) ?? 0);
}
