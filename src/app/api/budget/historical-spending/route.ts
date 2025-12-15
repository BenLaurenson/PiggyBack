import { createClient } from "@/utils/supabase/server";
import { NextResponse } from "next/server";
import { getEffectiveAccountIds } from "@/lib/get-effective-account-ids";
import { z } from "zod/v4";
import { generalReadLimiter } from "@/lib/rate-limiter";

/**
 * Get historical spending for categories (used for proportional distribution)
 * GET /api/budget/historical-spending?partnership_id=xxx&months=3&categories=Food & Dining,Housing
 */
export async function GET(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const rateCheck = generalReadLimiter.check(user.id);
  if (!rateCheck.allowed) {
    return NextResponse.json(
      { error: "Too many requests. Please try again later." },
      { status: 429, headers: { "Retry-After": String(Math.ceil((rateCheck.retryAfterMs || 60000) / 1000)) } }
    );
  }

  const { searchParams } = new URL(request.url);

  const querySchema = z.object({
    partnership_id: z.string().uuid(),
    months: z.string().max(5).optional(),
    categories: z.string().min(1).max(5000),
  });
  const paramResult = querySchema.safeParse(Object.fromEntries(searchParams.entries()));
  if (!paramResult.success) {
    return NextResponse.json({ error: "Invalid parameters" }, { status: 400 });
  }

  const partnershipId = paramResult.data.partnership_id;
  const monthsParam = paramResult.data.months;
  const categoriesParam = paramResult.data.categories;

  // Verify user is a member of this partnership
  const { data: membership } = await supabase
    .from("partnership_members")
    .select("partnership_id")
    .eq("user_id", user.id)
    .eq("partnership_id", partnershipId)
    .maybeSingle();

  if (!membership) {
    return NextResponse.json({ error: "Not authorized" }, { status: 403 });
  }

  const months = parseInt(monthsParam || '3');
  const categories = categoriesParam.split(',').filter(Boolean).slice(0, 100);

  // Get account IDs (with JOINT deduplication)
  const accountIds = await getEffectiveAccountIds(supabase, partnershipId, user.id, 'shared');

  // Calculate date range (last N months)
  const endDate = new Date();
  const startDate = new Date();
  startDate.setMonth(startDate.getMonth() - months);

  // Get category mappings
  const { data: categoryMappings } = await supabase
    .from("category_mappings")
    .select("up_category_id, new_parent_name")
    .in("new_parent_name", categories)
    .limit(200);

  // Fetch transactions for the period
  const upCategoryIds = categoryMappings?.map(m => m.up_category_id) || [];

  const { data: transactions } = await supabase
    .from("transactions")
    .select("amount_cents, category_id")
    .in("account_id", accountIds)
    .in("category_id", upCategoryIds)
    .gte("created_at", startDate.toISOString())
    .lte("created_at", endDate.toISOString())
    .lt("amount_cents", 0)
    .is("transfer_account_id", null)
    .neq("status", "DELETED")
    .limit(5000);

  // Aggregate by parent category
  const spending: Record<string, number> = {};

  transactions?.forEach(txn => {
    const mapping = categoryMappings?.find(m => m.up_category_id === txn.category_id);
    if (mapping) {
      const parentName = mapping.new_parent_name;
      spending[parentName] = (spending[parentName] || 0) + Math.abs(txn.amount_cents);
    }
  });

  return NextResponse.json({
    spending: Object.entries(spending).map(([category, amount]) => ({
      category,
      amount,
    })),
  });
}
