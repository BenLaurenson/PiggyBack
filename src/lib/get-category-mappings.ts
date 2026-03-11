import { cache } from "react";
import { SupabaseClient } from "@supabase/supabase-js";

/**
 * Cached category mappings fetcher.
 * Wrapped in React.cache() to deduplicate calls within the same request
 * (home page, budget page, AI context all fetch this same global table).
 */
export const getCategoryMappings = cache(async (
  supabase: SupabaseClient
): Promise<{
  data: Array<{
    up_category_id: string;
    new_parent_name: string;
    new_child_name: string;
    icon: string;
    display_order: number | null;
  }> | null;
  error: any;
}> => {
  return supabase
    .from("category_mappings")
    .select("up_category_id, new_parent_name, new_child_name, icon, display_order")
    .limit(200);
});

/**
 * Build a lookup map from category_id to parent/child names.
 * Reusable across budget summary, home page, etc.
 */
export function buildCategoryLookup(
  mappings: Array<{ up_category_id: string; new_parent_name: string; new_child_name: string }>
): Map<string, { parent: string; child: string }> {
  const lookup = new Map<string, { parent: string; child: string }>();
  for (const m of mappings) {
    lookup.set(m.up_category_id, {
      parent: m.new_parent_name,
      child: m.new_child_name,
    });
  }
  return lookup;
}
