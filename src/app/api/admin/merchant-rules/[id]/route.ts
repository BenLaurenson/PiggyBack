import { NextResponse } from "next/server";
import { z } from "zod/v4";
import { createClient } from "@/utils/supabase/server";
import { createServiceRoleClient } from "@/utils/supabase/service-role";
import { isAdminEmail } from "@/lib/admin-auth";
import { parseBody, validateUuidParam } from "@/lib/validation";
import { invalidateMerchantDefaultRulesCache } from "@/lib/merchant-default-rules";

/**
 * Admin endpoints for a single `merchant_default_rules` row.
 *
 * PATCH  /api/admin/merchant-rules/[id]    update fields
 * DELETE /api/admin/merchant-rules/[id]    remove rule
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

const updateSchema = z.object({
  merchant_pattern: z.string().min(1).max(200).optional(),
  category_id: z.string().min(1).max(100).optional(),
  parent_category_id: z.string().max(100).nullable().optional(),
  notes: z.string().max(500).nullable().optional(),
  is_active: z.boolean().optional(),
});

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAdmin();
  if ("error" in auth) return auth.error;

  const { id } = await params;
  const idError = validateUuidParam(id);
  if (idError) return idError;

  const parsed = await parseBody(request, updateSchema);
  if (parsed.response) return parsed.response;

  if (Object.keys(parsed.data).length === 0) {
    return NextResponse.json(
      { error: "No fields to update" },
      { status: 400 }
    );
  }

  const admin = createServiceRoleClient();
  const { data, error } = await admin
    .from("merchant_default_rules")
    .update(parsed.data)
    .eq("id", id)
    .select()
    .single();

  if (error) {
    if (error.code === "23505") {
      return NextResponse.json(
        { error: "Another rule already uses that merchant_pattern" },
        { status: 409 }
      );
    }
    console.error("[admin/merchant-rules PATCH] failed:", error);
    return NextResponse.json(
      { error: "Failed to update rule" },
      { status: 500 }
    );
  }

  invalidateMerchantDefaultRulesCache();
  return NextResponse.json({ rule: data });
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAdmin();
  if ("error" in auth) return auth.error;

  const { id } = await params;
  const idError = validateUuidParam(id);
  if (idError) return idError;

  const admin = createServiceRoleClient();
  const { error } = await admin
    .from("merchant_default_rules")
    .delete()
    .eq("id", id);

  if (error) {
    console.error("[admin/merchant-rules DELETE] failed:", error);
    return NextResponse.json(
      { error: "Failed to delete rule" },
      { status: 500 }
    );
  }

  invalidateMerchantDefaultRulesCache();
  return NextResponse.json({ success: true });
}
