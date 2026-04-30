import { NextResponse } from "next/server";
import { z } from "zod/v4";
import { createClient } from "@/utils/supabase/server";
import { createServiceRoleClient } from "@/utils/supabase/service-role";
import { isAdminEmail } from "@/lib/admin-auth";
import { parseBody } from "@/lib/validation";
import { invalidateMerchantDefaultRulesCache } from "@/lib/merchant-default-rules";

/**
 * Admin endpoints for `merchant_default_rules`.
 *
 * GET   /api/admin/merchant-rules?page=1&pageSize=50&q=Aldi
 *   Paginated list of all rules (active + inactive).
 *
 * POST  /api/admin/merchant-rules
 *   Body: { merchant_pattern, category_id, parent_category_id?, notes? }
 *   Creates a new curated rule.
 *
 * Both require the caller to be in ADMIN_EMAILS.
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

export async function GET(request: Request) {
  const auth = await requireAdmin();
  if ("error" in auth) return auth.error;

  const { searchParams } = new URL(request.url);
  const page = Math.max(1, Number(searchParams.get("page") || "1"));
  const pageSize = Math.min(
    200,
    Math.max(1, Number(searchParams.get("pageSize") || "50"))
  );
  const q = (searchParams.get("q") || "").trim();
  const sourceFilter = searchParams.get("source");

  const admin = createServiceRoleClient();
  let query = admin
    .from("merchant_default_rules")
    .select(
      "id, merchant_pattern, category_id, parent_category_id, source, suggested_by_user_id, notes, is_active, last_applied_at, applied_count, created_at, updated_at",
      { count: "exact" }
    )
    .order("merchant_pattern", { ascending: true })
    .range((page - 1) * pageSize, page * pageSize - 1);

  if (q) {
    query = query.ilike("merchant_pattern", `%${q}%`);
  }
  if (sourceFilter) {
    query = query.eq("source", sourceFilter);
  }

  const { data, error, count } = await query;
  if (error) {
    console.error("[admin/merchant-rules GET] failed:", error);
    return NextResponse.json(
      { error: "Failed to load rules" },
      { status: 500 }
    );
  }

  return NextResponse.json({
    rules: data || [],
    page,
    pageSize,
    total: count ?? 0,
  });
}

const createSchema = z.object({
  merchant_pattern: z.string().min(1).max(200),
  category_id: z.string().min(1).max(100),
  parent_category_id: z.string().max(100).nullable().optional(),
  notes: z.string().max(500).nullable().optional(),
});

export async function POST(request: Request) {
  const auth = await requireAdmin();
  if ("error" in auth) return auth.error;

  const parsed = await parseBody(request, createSchema);
  if (parsed.response) return parsed.response;

  const admin = createServiceRoleClient();
  const { data, error } = await admin
    .from("merchant_default_rules")
    .insert({
      merchant_pattern: parsed.data.merchant_pattern.trim(),
      category_id: parsed.data.category_id,
      parent_category_id: parsed.data.parent_category_id ?? null,
      notes: parsed.data.notes ?? null,
      source: "curated",
    })
    .select()
    .single();

  if (error) {
    if (error.code === "23505") {
      return NextResponse.json(
        { error: "A rule for that merchant_pattern already exists" },
        { status: 409 }
      );
    }
    console.error("[admin/merchant-rules POST] failed:", error);
    return NextResponse.json(
      { error: "Failed to create rule" },
      { status: 500 }
    );
  }

  invalidateMerchantDefaultRulesCache();
  return NextResponse.json({ rule: data }, { status: 201 });
}
