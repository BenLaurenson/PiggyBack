import { SupabaseClient } from "@supabase/supabase-js";
import { getUserPartnershipId } from "@/lib/get-user-partnership";
import { getEffectiveAccountIds } from "@/lib/get-effective-account-ids";
import { getCurrentDate } from "@/lib/demo-guard";

export interface AnalysisTransaction {
  amount_cents: number;
  category_id: string | null;
  settled_at: string;
}

export interface AnalysisIncomeTransaction {
  amount_cents: number;
  category_id: string | null;
  settled_at: string;
  description: string | null;
  is_income: boolean | null;
}

export interface AnalysisCategoryMapping {
  upCategoryId: string;
  newParentName: string;
  newChildName: string;
  icon: string;
  displayOrder: number;
}

export interface AnalysisCategory {
  name: string;
  icon: string;
  assigned: number;
  spent: number;
}

export interface AnalysisSubcategory {
  name: string;
  parentName: string;
  icon: string;
  assigned: number;
  spent: number;
}

export interface AnalysisIncomeSource {
  id: string;
  name: string;
  amount_cents: number;
  frequency?: string;
}

export interface AnalysisNetWorthSnapshot {
  snapshot_date: string;
  total_balance_cents: number;
  investment_total_cents: number | null;
}

export interface AnalysisData {
  allTransactions: AnalysisTransaction[];
  incomeTransactions: AnalysisIncomeTransaction[];
  categories: AnalysisCategory[];
  subcategories: AnalysisSubcategory[];
  categoryMappings: AnalysisCategoryMapping[];
  incomeSources: AnalysisIncomeSource[];
  partnerIncomeSources: AnalysisIncomeSource[];
  netWorthSnapshots: AnalysisNetWorthSnapshot[];
}

export async function getAnalysisData(
  supabase: SupabaseClient,
  userId: string
): Promise<AnalysisData | null> {
  const partnershipId = await getUserPartnershipId(supabase, userId);
  if (!partnershipId) return null;

  const accountIds = await getEffectiveAccountIds(supabase, partnershipId, userId, "individual");

  const referenceDate = getCurrentDate();
  const twoYearsAgo = new Date(referenceDate);
  twoYearsAgo.setFullYear(twoYearsAgo.getFullYear() - 2);
  twoYearsAgo.setDate(1);

  const sixMonthsAhead = new Date(referenceDate);
  sixMonthsAhead.setMonth(sixMonthsAhead.getMonth() + 6);
  sixMonthsAhead.setDate(
    new Date(sixMonthsAhead.getFullYear(), sixMonthsAhead.getMonth() + 1, 0).getDate()
  );

  const dateFrom = twoYearsAgo.toISOString();
  const dateTo = sixMonthsAhead.toISOString();
  const BATCH = 1000;

  // Fetch ALL data in parallel — paginated transactions + metadata concurrently
  const [allTransactions, incomeTransactions, { data: categoryMappingsRaw }, { data: incomeSources }, { data: netWorthSnapshots }] = await Promise.all([
    // Spending transactions (paginated)
    (async () => {
      const results: AnalysisTransaction[] = [];
      let offset = 0;
      while (true) {
        const { data } = await supabase
          .from("transactions")
          .select("amount_cents, category_id, settled_at")
          .in("account_id", accountIds)
          .gte("settled_at", dateFrom)
          .lte("settled_at", dateTo)
          .lt("amount_cents", 0)
          .is("transfer_account_id", null)
          .order("settled_at", { ascending: false })
          .range(offset, offset + BATCH - 1);
        if (!data || data.length === 0) break;
        results.push(...data);
        if (data.length < BATCH) break;
        offset += BATCH;
      }
      return results;
    })(),
    // Income transactions (paginated)
    (async () => {
      const results: AnalysisIncomeTransaction[] = [];
      let offset = 0;
      while (true) {
        const { data } = await supabase
          .from("transactions")
          .select("amount_cents, category_id, settled_at, description, is_income")
          .in("account_id", accountIds)
          .gte("settled_at", dateFrom)
          .lte("settled_at", dateTo)
          .gt("amount_cents", 0)
          .is("transfer_account_id", null)
          .order("settled_at", { ascending: false })
          .range(offset, offset + BATCH - 1);
        if (!data || data.length === 0) break;
        results.push(...data);
        if (data.length < BATCH) break;
        offset += BATCH;
      }
      return results;
    })(),
    supabase
      .from("category_mappings")
      .select("*")
      .order("display_order"),
    supabase
      .from("income_sources")
      .select("id, name, amount_cents, frequency, source_type, user_id, is_manual_partner_income")
      .eq("partnership_id", partnershipId)
      .eq("is_active", true),
    supabase
      .from("net_worth_snapshots")
      .select("snapshot_date, total_balance_cents, investment_total_cents")
      .eq("partnership_id", partnershipId)
      .gte("snapshot_date", twoYearsAgo.toISOString().split("T")[0])
      .order("snapshot_date", { ascending: true }),
  ]);

  const categoryMappings: AnalysisCategoryMapping[] =
    categoryMappingsRaw?.map((m) => ({
      upCategoryId: m.up_category_id,
      newParentName: m.new_parent_name,
      newChildName: m.new_child_name,
      icon: m.icon,
      displayOrder: m.display_order,
    })) || [];

  // Build parent category names
  const modernCategoryNames = [
    ...new Set(categoryMappings.map((m) => m.newParentName)),
    "Miscellaneous",
  ];

  // Build spending by subcategory from ALL transactions (for analysis across time ranges)
  const spendingBySubcategory = new Map<string, Map<string, number>>();
  const spendingByCategory = new Map<string, number>();

  allTransactions.forEach((txn) => {
    let mapping: AnalysisCategoryMapping | undefined;

    if (txn.category_id === null) {
      mapping = {
        upCategoryId: "uncategorized",
        newParentName: "Miscellaneous",
        newChildName: "Uncategorized",
        icon: "❓",
        displayOrder: 999,
      };
    } else {
      mapping = categoryMappings.find((m) => m.upCategoryId === txn.category_id);
    }

    if (mapping) {
      // Parent spending
      const parentCurrent = spendingByCategory.get(mapping.newParentName) || 0;
      spendingByCategory.set(mapping.newParentName, parentCurrent + Math.abs(txn.amount_cents));

      // Subcategory spending
      if (!spendingBySubcategory.has(mapping.newParentName)) {
        spendingBySubcategory.set(mapping.newParentName, new Map());
      }
      const childMap = spendingBySubcategory.get(mapping.newParentName)!;
      const current = childMap.get(mapping.newChildName) || 0;
      childMap.set(mapping.newChildName, current + Math.abs(txn.amount_cents));
    }
  });

  const categories: AnalysisCategory[] = modernCategoryNames.map((name) => {
    if (name === "Miscellaneous") {
      return { name: "Miscellaneous", icon: "❓", assigned: 0, spent: spendingByCategory.get("Miscellaneous") || 0 };
    }
    const firstMapping = categoryMappings.find((m) => m.newParentName === name);
    return {
      name,
      icon: firstMapping?.icon || "📂",
      assigned: 0,
      spent: spendingByCategory.get(name) || 0,
    };
  });

  // Build subcategories array
  const subcategories: AnalysisSubcategory[] = [];
  for (const parentName of modernCategoryNames) {
    if (parentName === "Miscellaneous") {
      subcategories.push({
        name: "Uncategorized",
        parentName: "Miscellaneous",
        icon: "❓",
        assigned: 0,
        spent: spendingBySubcategory.get("Miscellaneous")?.get("Uncategorized") || 0,
      });
      continue;
    }

    const childMappings = categoryMappings.filter((m) => m.newParentName === parentName);
    for (const child of childMappings) {
      const subSpending =
        spendingBySubcategory.get(parentName)?.get(child.newChildName) || 0;

      subcategories.push({
        name: child.newChildName,
        parentName,
        icon: child.icon,
        assigned: 0,
        spent: subSpending,
      });
    }
  }

  // Separate income sources
  const userIncomeSources =
    incomeSources?.filter(
      (s) => s.user_id === userId && !s.is_manual_partner_income
    ) || [];
  const partnerIncSources =
    incomeSources?.filter(
      (s) => s.user_id !== userId || s.is_manual_partner_income
    ) || [];

  return {
    allTransactions,
    incomeTransactions,
    categories,
    subcategories,
    categoryMappings,
    incomeSources: userIncomeSources,
    partnerIncomeSources: partnerIncSources,
    netWorthSnapshots: netWorthSnapshots || [],
  };
}
