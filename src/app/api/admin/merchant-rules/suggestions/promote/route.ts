import { NextResponse } from "next/server";
import { z } from "zod/v4";
import { createClient } from "@/utils/supabase/server";
import { createServiceRoleClient } from "@/utils/supabase/service-role";
import { isAdminEmail } from "@/lib/admin-auth";
import { parseBody } from "@/lib/validation";
import { invalidateMerchantDefaultRulesCache } from "@/lib/merchant-default-rules";

/**
 * POST /api/admin/merchant-rules/suggestions/promote
 *
 * Body: {
 *   merchant_pattern: string,
 *   category_id: string,
 *   parent_category_id?: string | null,
 *   notes?: string | null,
 *   reject?: boolean   // if true, just clear share_with_everyone instead
 * }
 *
 * Promotes a user-suggested rule into the global default set, or
 * rejects it (clears the share_with_everyone flag on the matching user
 * rules).
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

const promoteSchema = z.object({
  merchant_pattern: z.string().min(1).max(200),
  category_id: z.string().min(1).max(100),
  parent_category_id: z.string().max(100).nullable().optional(),
  notes: z.string().max(500).nullable().optional(),
  reject: z.boolean().optional(),
});

export async function POST(request: Request) {
  const auth = await requireAdmin();
  if ("error" in auth) return auth.error;

  const parsed = await parseBody(request, promoteSchema);
  if (parsed.response) return parsed.response;

  const admin = createServiceRoleClient();
  const pattern = parsed.data.merchant_pattern.trim();

  if (parsed.data.reject) {
    // Clear share flag on every matching user rule.
    const { error } = await admin
      .from("merchant_category_rules")
      .update({ share_with_everyone: false })
      .eq("merchant_description", pattern)
      .eq("share_with_everyone", true);

    if (error) {
      console.error("[admin promote reject] failed:", error);
      return NextResponse.json(
        { error: "Failed to reject suggestion" },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true, action: "rejected" });
  }

  // Promotion: insert/update the global default rule, then clear the
  // share flag on the contributing user rules so they leave the queue.
  const { data: rule, error: insertError } = await admin
    .from("merchant_default_rules")
    .upsert(
      {
        merchant_pattern: pattern,
        category_id: parsed.data.category_id,
        parent_category_id: parsed.data.parent_category_id ?? null,
        notes: parsed.data.notes ?? null,
        source: "promoted",
      },
      { onConflict: "merchant_pattern" }
    )
    .select()
    .single();

  if (insertError) {
    console.error("[admin promote] failed:", insertError);
    return NextResponse.json(
      { error: "Failed to promote suggestion" },
      { status: 500 }
    );
  }

  await admin
    .from("merchant_category_rules")
    .update({ share_with_everyone: false })
    .eq("merchant_description", pattern)
    .eq("share_with_everyone", true);

  invalidateMerchantDefaultRulesCache();
  return NextResponse.json({ success: true, action: "promoted", rule });
}
