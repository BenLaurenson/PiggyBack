import { createClient } from "@/utils/supabase/server";
import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { CategoryProvider } from "@/contexts/category-context";
import { CategoryBudgetDetail } from "@/components/budget/category-budget-detail";

export default async function CategoryBudgetPage({
  params,
  searchParams,
}: {
  params: Promise<{ category: string }>;
  searchParams: Promise<{ from?: string }>;
}) {
  const { category: categorySlug } = await params;
  const { from: referrer } = await searchParams;
  const categoryName = decodeURIComponent(categorySlug).replace(/-/g, ' ').replace(/and/g, '&');

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return <div>Please log in</div>;
  }

  // Fetch category mappings
  const { data: categoryMappingsRaw } = await supabase
    .from("category_mappings")
    .select("*")
    .order("display_order");

  const categoryMappings = categoryMappingsRaw?.map(m => ({
    upCategoryId: m.up_category_id,
    newParentName: m.new_parent_name,
    newChildName: m.new_child_name,
    icon: m.icon,
    displayOrder: m.display_order
  })) || [];

  // Find UP Bank category IDs for this modern category
  const upCategoryIds = categoryMappings
    .filter(m => m.newParentName.toLowerCase() === categoryName.toLowerCase())
    .map(m => m.upCategoryId);

  // Special handling for "Miscellaneous" - transactions with no category
  const isMiscellaneous = categoryName.toLowerCase() === "miscellaneous";

  if (upCategoryIds.length === 0 && !isMiscellaneous) {
    notFound();
  }

  // Fetch user's accounts
  const { data: accounts } = await supabase
    .from("accounts")
    .select("id, display_name")
    .eq("user_id", user.id)
    .eq("is_active", true);

  const accountIds = accounts?.map(a => a.id) || [];

  // Categories that represent transfers between accounts - skip transfer_account_id filter for these
  const TRANSFER_CATEGORY_IDS = ['internal-transfer'];
  const includesTransfers = upCategoryIds.some(id => TRANSFER_CATEGORY_IDS.includes(id));

  // Fetch ALL transactions for this category (for accurate stats)
  let query = supabase
    .from("transactions")
    .select(`
      *,
      category:categories!category_id(id, name),
      parent_category:categories!parent_category_id(id, name),
      transaction_tags(tag_name)
    `)
    .in("account_id", accountIds)
    .order("settled_at", { ascending: false });

  // Only exclude transfers when not viewing transfer-type categories
  if (!includesTransfers) {
    query = query.is("transfer_account_id", null);
  }

  // For Miscellaneous, get transactions with null or unmapped category_ids
  // Otherwise filter by the mapped category IDs
  if (isMiscellaneous) {
    const allMappedIds = categoryMappings.map(m => m.upCategoryId);
    if (allMappedIds.length > 0) {
      query = query.or(`category_id.is.null,category_id.not.in.(${allMappedIds.join(',')})`);
    }
  } else {
    query = query.in("category_id", upCategoryIds);
  }

  const { data: allTransactions } = await query;

  if (!allTransactions || allTransactions.length === 0) {
    notFound();
  }

  // Add account names
  const transactionsWithAccounts = allTransactions.map(txn => ({
    ...txn,
    accounts: accounts?.find(a => a.id === txn.account_id),
  }));

  // Calculate stats
  const totalSpent = Math.abs(allTransactions.reduce((sum, t) => sum + t.amount_cents, 0));
  const transactionCount = allTransactions.length;
  const firstTransaction = allTransactions[allTransactions.length - 1];

  // Calculate months since first transaction
  const monthsSince = Math.max(
    1,
    Math.floor(
      (new Date().getTime() - new Date(firstTransaction.settled_at).getTime()) / (1000 * 60 * 60 * 24 * 30)
    )
  );

  // Calculate monthly average
  const averagePerMonth = totalSpent / monthsSince;

  // Get category icon (use folder icon for Miscellaneous)
  const categoryIcon = isMiscellaneous
    ? "📁"
    : categoryMappings.find(m => m.newParentName.toLowerCase() === categoryName.toLowerCase())?.icon || "📂";

  // Chart data (monthly spending)
  const monthlyData = allTransactions.reduce((acc, txn) => {
    const date = new Date(txn.settled_at);
    const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
    if (!acc[monthKey]) {
      acc[monthKey] = { month: monthKey, total: 0 };
    }
    acc[monthKey].total += Math.abs(txn.amount_cents);
    return acc;
  }, {} as Record<string, { month: string; total: number }>);

  const chartData = (Object.values(monthlyData) as Array<{ month: string; total: number }>).sort((a, b) =>
    a.month.localeCompare(b.month)
  );

  return (
    <div className="p-4 md:p-6 space-y-6" style={{ backgroundColor: 'var(--background)' }}>
      {/* Back Button - Smart navigation based on referrer */}
      <Link
        href={
          referrer === "analysis" ? "/analysis" :
          referrer === "budget" ? "/budget?tab=analysis" :
          referrer === "home" ? "/home" :
          "/activity"
        }
        className="text-sm font-[family-name:var(--font-dm-sans)] text-text-secondary hover:text-text-primary flex items-center gap-1 mb-2"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to {
          referrer === "analysis" ? "Analysis" :
          referrer === "budget" ? "Budget Analysis" :
          referrer === "home" ? "Home" :
          "Activity"
        }
      </Link>

      {/* Hero Section */}
      <div className="space-y-1">
        <div className="flex items-center gap-2 sm:gap-3">
          <span className="text-3xl sm:text-4xl">{categoryIcon}</span>
          <h1 className="font-[family-name:var(--font-nunito)] text-2xl sm:text-3xl md:text-4xl font-black break-words" style={{ color: 'var(--text-primary)' }}>
            {categoryName}
          </h1>
        </div>
        <p className="font-[family-name:var(--font-dm-sans)] text-sm sm:text-base" style={{ color: 'var(--text-tertiary)' }}>
          Complete spending history
        </p>
      </div>

      <CategoryProvider mappings={categoryMappings}>
        <CategoryBudgetDetail
          initialTransactions={transactionsWithAccounts}
          categoryName={categoryName}
          totalSpent={totalSpent}
          transactionCount={transactionCount}
          monthsSince={monthsSince}
          averagePerMonth={averagePerMonth}
          chartData={chartData}
        />
      </CategoryProvider>
    </div>
  );
}
