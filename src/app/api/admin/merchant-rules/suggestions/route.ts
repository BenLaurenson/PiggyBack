import { NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";
import { createServiceRoleClient } from "@/utils/supabase/service-role";
import { isAdminEmail } from "@/lib/admin-auth";

/**
 * GET /api/admin/merchant-rules/suggestions
 *
 * Returns the queue of user-suggested merchant rules - i.e.
 * `merchant_category_rules` rows where share_with_everyone = true and
 * the merchant_description hasn't been promoted into the global default
 * set yet.
 */
async function requireAdmin() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return {
      error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    };
  }
  if (!isAdminEmail(user.email ?? null)) {
    return {
      error: NextResponse.json({ error: "Forbidden" }, { status: 403 }),
    };
  }
  return { user };
}

export async function GET() {
  const auth = await requireAdmin();
  if ("error" in auth) return auth.error;

  const admin = createServiceRoleClient();

  // Pull every user-shared rule
  const { data: userRules, error: rulesError } = await admin
    .from("merchant_category_rules")
    .select(
      "id, user_id, merchant_description, category_id, parent_category_id, last_applied_at, created_at"
    )
    .eq("share_with_everyone", true);

  if (rulesError) {
    console.error("[admin suggestions] failed:", rulesError);
    return NextResponse.json(
      { error: "Failed to load suggestions" },
      { status: 500 }
    );
  }

  // Skip suggestions whose merchant_description already has a default rule.
  const patterns = Array.from(
    new Set((userRules || []).map((r) => r.merchant_description))
  );

  let existingPatterns = new Set<string>();
  if (patterns.length > 0) {
    const { data: defaults } = await admin
      .from("merchant_default_rules")
      .select("merchant_pattern")
      .in("merchant_pattern", patterns);
    existingPatterns = new Set(
      (defaults || []).map((d) => d.merchant_pattern)
    );
  }

  // Aggregate by merchant_description so admin sees one row per pattern,
  // with vote count.
  const aggregated = new Map<
    string,
    {
      merchant_description: string;
      category_id: string;
      parent_category_id: string | null;
      vote_count: number;
      first_suggested_at: string;
      most_recent_apply_at: string | null;
      sample_user_ids: string[];
    }
  >();

  for (const r of userRules || []) {
    if (existingPatterns.has(r.merchant_description)) continue;
    const existing = aggregated.get(r.merchant_description);
    if (!existing) {
      aggregated.set(r.merchant_description, {
        merchant_description: r.merchant_description,
        category_id: r.category_id,
        parent_category_id: r.parent_category_id,
        vote_count: 1,
        first_suggested_at: r.created_at,
        most_recent_apply_at: r.last_applied_at,
        sample_user_ids: [r.user_id],
      });
    } else {
      existing.vote_count += 1;
      if (r.created_at < existing.first_suggested_at) {
        existing.first_suggested_at = r.created_at;
      }
      if (
        r.last_applied_at &&
        (!existing.most_recent_apply_at ||
          r.last_applied_at > existing.most_recent_apply_at)
      ) {
        existing.most_recent_apply_at = r.last_applied_at;
      }
      if (existing.sample_user_ids.length < 5) {
        existing.sample_user_ids.push(r.user_id);
      }
    }
  }

  const suggestions = Array.from(aggregated.values()).sort(
    (a, b) => b.vote_count - a.vote_count
  );

  return NextResponse.json({ suggestions });
}
