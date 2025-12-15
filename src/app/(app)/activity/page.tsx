import { createClient } from "@/utils/supabase/server";
import { ActivityClient } from "@/components/activity/activity-client";
import { CategoryProvider } from "@/contexts/category-context";
import { IncomeConfigProvider } from "@/contexts/income-config-context";
import { EmptyState } from "@/components/ui/empty-state";
import { getCurrentDate } from "@/lib/demo-guard";

/**
 * Helper function to get all transactions in batches
 * since Supabase has a default limit of 1000 rows
 */
async function getAllTransactions(
  supabase: any,
  accountIds: string[]
) {
  const allTransactions: any[] = [];
  let offset = 0;
  // Supabase has a default limit of 1000 rows per query, so use that as batch size
  const batchSize = 1000;
  let hasMore = true;

  while (hasMore) {
    const { data, error } = await supabase
      .from("transactions")
      .select("amount_cents, is_income")
      .in("account_id", accountIds)
      .is("transfer_account_id", null)
      .order("created_at", { ascending: false })
      .range(offset, offset + batchSize - 1);

    if (error) {
      hasMore = false;
      break;
    }

    if (!data || data.length === 0) {
      hasMore = false;
      break;
    }

    allTransactions.push(...data);

    // If we got fewer than batch size, we're done
    if (data.length < batchSize) {
      hasMore = false;
    } else {
      offset += batchSize;
    }
  }

  return allTransactions;
}

export default async function ActivityPage({
  searchParams,
}: {
  searchParams: Promise<{
    category?: string;
    categoryName?: string;
    search?: string;
    dateRange?: string;
    incomeSource?: string;
    from?: string;  // Track where user came from for smart breadcrumbs
  }>;
}) {
  const params = await searchParams;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  // Fetch user's accounts
  const { data: accounts } = await supabase
    .from("accounts")
    .select("id, display_name")
    .eq("user_id", user?.id)
    .eq("is_active", true);

  const accountIds = accounts?.map(a => a.id) || [];

  if (accountIds.length === 0) {
    return (
      <div className="p-4 md:p-6 space-y-6">
        <div className="space-y-1">
          <h1 className="font-[family-name:var(--font-nunito)] text-3xl font-black text-text-primary">
            Activity
          </h1>
        </div>
        <EmptyState
          icon="💳"
          title="No transactions yet"
          description="Connect your UP Bank account to see your transaction history."
          action={{ label: "Connect Bank", href: "/settings/up-connection", color: "blue" }}
        />
      </div>
    );
  }

  // Fetch transactions with explicit FK relationships (increased limit for pagination)
  // Exclude transfers by default (user can toggle them in filters)
  const { data: transactions, error: txnError } = await supabase
    .from("transactions")
    .select(`
      *,
      category:categories!category_id(id, name),
      parent_category:categories!parent_category_id(id, name),
      transaction_tags(tag_name)
    `)
    .in("account_id", accountIds)
    .is("transfer_account_id", null) // Exclude transfers by default
    .order("created_at", { ascending: false })
    .range(0, 499); // Fetch first 500 for display

  if (txnError) {
    console.error("Failed to fetch transactions:", txnError);
  }

  // Manually join account display names
  const transactionsWithAccounts = transactions?.map(txn => {
    const account = accounts?.find(a => a.id === txn.account_id);
    return {
      ...txn,
      accounts: account ? { display_name: account.display_name } : null,
    };
  }) || [];

  // Fetch ALL categories (both parent and child) for filtering
  const { data: allCategories } = await supabase
    .from("categories")
    .select("id, name, parent_category_id")
    .order("name");

  // Fetch category mappings for modern category display
  const { data: categoryMappingsRaw } = await supabase
    .from("category_mappings")
    .select("up_category_id, new_parent_name, new_child_name, icon, display_order")
    .order("display_order");

  // Transform snake_case to camelCase for TypeScript
  const categoryMappings = categoryMappingsRaw?.map(m => ({
    upCategoryId: m.up_category_id,
    newParentName: m.new_parent_name,
    newChildName: m.new_child_name,
    icon: m.icon,
    displayOrder: m.display_order
  })) || [];

  // Calculate this month's spending
  const now = getCurrentDate();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const thisMonthTransactions = transactionsWithAccounts?.filter(
    (t) => new Date(t.created_at) >= startOfMonth && t.amount_cents < 0
  ) || [];
  const monthlySpending = Math.abs(
    thisMonthTransactions.reduce((sum, t) => sum + t.amount_cents, 0)
  );

  // Calculate this month's income (from positive transactions, matching trend chart logic)
  const monthlyIncome = transactionsWithAccounts
    ?.filter((t) =>
      new Date(t.created_at) >= startOfMonth &&
      t.amount_cents > 0
    )
    .reduce((sum, t) => sum + t.amount_cents, 0) || 0;

  // Calculate all-time totals by fetching ALL transactions in batches
  // The API endpoint uses the same logic for consistency
  const allTransactions = await getAllTransactions(supabase, accountIds);

  const allTimeIncome = allTransactions
    ?.filter(t => t.amount_cents > 0)
    .reduce((sum, t) => sum + t.amount_cents, 0) || 0;

  const markedIncomeTotal = allTransactions
    ?.filter(t => t.is_income === true)
    .reduce((sum, t) => sum + Math.abs(t.amount_cents), 0) || 0;

  const markedIncomeCount = allTransactions?.filter(t => t.is_income === true).length || 0;

  const allTimeSpending = Math.abs(
    allTransactions?.filter(t => t.amount_cents < 0).reduce((sum, t) => sum + t.amount_cents, 0) || 0
  );

  const allTimeSpendingCount = allTransactions?.filter(t => t.amount_cents < 0).length || 0;

  // Extract available years from transactions
  const availableYears = Array.from(
    new Set(
      transactionsWithAccounts?.map(t => new Date(t.created_at).getFullYear()) || []
    )
  ).sort((a, b) => b - a); // Sort descending (newest first)

  // Get total count
  const { count: totalCount } = await supabase
    .from("transactions")
    .select("*", { count: "exact", head: true })
    .in("account_id", accountIds)
    .is("transfer_account_id", null);

  return (
    <div className="p-4 md:p-6 space-y-6">
      {/* Header */}
      <div className="space-y-1">
        <h1 className="font-[family-name:var(--font-nunito)] text-3xl font-black text-text-primary">
          Activity
        </h1>
        <p className="font-[family-name:var(--font-dm-sans)] text-text-secondary">
          View and search your transactions
        </p>
      </div>

      <IncomeConfigProvider>
        <CategoryProvider mappings={categoryMappings}>
          <ActivityClient
            initialTransactions={transactionsWithAccounts.slice(0, 25)}
            accounts={accounts || []}
            categories={allCategories || []}
            monthlySpending={monthlySpending}
            monthlyIncome={monthlyIncome}
            thisMonthCount={thisMonthTransactions.length}
            availableYears={availableYears}
            totalCount={totalCount || 0}
            allTimeSpending={allTimeSpending}
            allTimeIncome={allTimeIncome}
            allTimeSpendingCount={allTimeSpendingCount}
            initialFilters={{
              categoryName: params.categoryName,
              search: params.search,
              dateRange: params.dateRange,
              incomeSource: params.incomeSource,
            }}
            referrer={params.from}
          />
        </CategoryProvider>
      </IncomeConfigProvider>
    </div>
  );
}
