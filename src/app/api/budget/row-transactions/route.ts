import { createClient } from "@/utils/supabase/server";
import { NextResponse } from "next/server";
import { getEffectiveAccountIds } from "@/lib/get-effective-account-ids";

export async function GET(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const partnershipId = searchParams.get("partnership_id");
  const itemType = searchParams.get("type");
  const itemId = searchParams.get("id");
  const periodStart = searchParams.get("period_start");
  const periodEnd = searchParams.get("period_end");

  if (!partnershipId || !itemType || !itemId) {
    return NextResponse.json({ error: "Missing parameters" }, { status: 400 });
  }

  const { data: membership } = await supabase
    .from("partnership_members")
    .select("partnership_id")
    .eq("user_id", user.id)
    .eq("partnership_id", partnershipId)
    .maybeSingle();

  if (!membership) {
    return NextResponse.json({ error: "Not authorized" }, { status: 403 });
  }

  const budgetView = (searchParams.get("view") as 'individual' | 'shared') || 'shared';
  const accountIds = await getEffectiveAccountIds(supabase, partnershipId, user.id, budgetView);

  let transactions: any[] = [];

  if (itemType === 'category') {
    // Check if underlying categories are provided (for methodology categories)
    const underlyingCategoriesParam = searchParams.get("underlying_categories");
    let parentCategoriesToQuery = underlyingCategoriesParam
      ? underlyingCategoriesParam.split(',')
      : [itemId];

    // Special handling for Miscellaneous (uncategorized transactions)
    if (parentCategoriesToQuery.includes('Miscellaneous')) {
      let query = supabase
        .from("transactions")
        .select(`
          *,
          transaction_category_overrides(
            original_category_id,
            override_category_id,
            changed_by,
            changed_at,
            notes
          )
        `)
        .in("account_id", accountIds)
        .is("category_id", null)
        .is("transfer_account_id", null)
        .order("settled_at", { ascending: false });

      if (periodStart) query = query.gte("settled_at", periodStart);
      if (periodEnd) query = query.lte("settled_at", periodEnd);

      const { data } = await query.limit(50);
      transactions = data || [];
    } else {
      // Get UP Bank category IDs for all parent categories
      const { data: categoryMappings } = await supabase
        .from("category_mappings")
        .select("up_category_id")
        .in("new_parent_name", parentCategoriesToQuery);

      const upCategoryIds = categoryMappings?.map(m => m.up_category_id) || [];

      let query = supabase
        .from("transactions")
        .select(`
          *,
          transaction_category_overrides(
            original_category_id,
            override_category_id,
            changed_by,
            changed_at,
            notes
          )
        `)
        .in("account_id", accountIds)
        .in("category_id", upCategoryIds)
        .is("transfer_account_id", null)
        .order("settled_at", { ascending: false });

      if (periodStart) query = query.gte("settled_at", periodStart);
      if (periodEnd) query = query.lte("settled_at", periodEnd);

      const { data } = await query.limit(50);
      transactions = data || [];
    }

  } else if (itemType === 'subcategory') {
    // Query transactions for a specific subcategory (child category)
    const parentCategory = searchParams.get("parent_category");
    const subcategoryName = itemId; // itemId is the subcategory name

    // Get UP Bank category IDs for this specific subcategory
    let query = supabase
      .from("category_mappings")
      .select("up_category_id")
      .eq("new_child_name", subcategoryName);

    // Optionally filter by parent category for disambiguation
    if (parentCategory) {
      query = query.eq("new_parent_name", parentCategory);
    }

    const { data: categoryMappings } = await query;
    const upCategoryIds = categoryMappings?.map(m => m.up_category_id) || [];

    if (upCategoryIds.length > 0) {
      let txnQuery = supabase
        .from("transactions")
        .select(`
          *,
          transaction_category_overrides(
            original_category_id,
            override_category_id,
            changed_by,
            changed_at,
            notes
          )
        `)
        .in("account_id", accountIds)
        .in("category_id", upCategoryIds)
        .is("transfer_account_id", null)
        .order("settled_at", { ascending: false });

      if (periodStart) txnQuery = txnQuery.gte("settled_at", periodStart);
      if (periodEnd) txnQuery = txnQuery.lte("settled_at", periodEnd);

      const { data } = await txnQuery.limit(50);
      transactions = data || [];
    }

  } else if (itemType === 'goal' || itemType === 'asset') {
    transactions = [];
  }

  // Fetch expense_matches separately (PostgREST embedding unreliable with RLS)
  if (transactions.length > 0) {
    const txnIds = transactions.map(t => t.id);
    const { data: matches } = await supabase
      .from("expense_matches")
      .select("transaction_id, expense_definition_id, match_confidence")
      .in("transaction_id", txnIds);

    if (matches && matches.length > 0) {
      const matchesByTxn = new Map<string, typeof matches>();
      for (const m of matches) {
        const existing = matchesByTxn.get(m.transaction_id) || [];
        existing.push(m);
        matchesByTxn.set(m.transaction_id, existing);
      }
      for (const txn of transactions) {
        txn.expense_matches = matchesByTxn.get(txn.id) || [];
      }
    }
  }

  return NextResponse.json({ transactions });
}
