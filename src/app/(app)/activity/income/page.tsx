import { createClient } from "@/utils/supabase/server";
import { redirect } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { IncomeHistoryClient } from "@/components/activity/income-history-client";
import { IncomeConfigProvider } from "@/contexts/income-config-context";
import { CategoryProvider } from "@/contexts/category-context";
import { Nunito, DM_Sans } from "next/font/google";

const nunito = Nunito({
  subsets: ["latin"],
  variable: "--font-nunito",
  weight: ["600", "700", "800", "900"]
});

const dmSans = DM_Sans({
  subsets: ["latin"],
  variable: "--font-dm-sans",
  weight: ["400", "500"]
});

/**
 * Helper function to get all income-related transactions in batches
 * Fetches both marked income (is_income=true) AND positive transactions
 * since Supabase has a default limit of 1000 rows
 */
async function getAllIncomeTransactions(
  supabase: any,
  accountIds: string[]
) {
  const allTransactions: any[] = [];
  let offset = 0;
  // Supabase has a default limit of 1000 rows per query
  const batchSize = 1000;
  let hasMore = true;

  while (hasMore) {
    // Fetch transactions that are either marked as income OR have positive amounts
    const { data, error } = await supabase
      .from("transactions")
      .select(`
        *,
        category:categories!category_id(id, name),
        parent_category:categories!parent_category_id(id, name),
        transaction_tags(tag_name)
      `)
      .in("account_id", accountIds)
      .is("transfer_account_id", null)
      .or("is_income.eq.true,amount_cents.gt.0") // Marked income OR positive amounts
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

    if (data.length < batchSize) {
      hasMore = false;
    } else {
      offset += batchSize;
    }
  }

  return allTransactions;
}

export default async function IncomePage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // Fetch user's accounts
  const { data: accounts } = await supabase
    .from("accounts")
    .select("id, display_name")
    .eq("user_id", user.id)
    .eq("is_active", true);

  const accountIds = accounts?.map(a => a.id) || [];

  // Fetch all income transactions in batches
  const transactions = await getAllIncomeTransactions(supabase, accountIds);

  // Add account names
  const transactionsWithAccounts = transactions.map(txn => ({
    ...txn,
    accounts: accounts?.find(a => a.id === txn.account_id),
  }));

  // Calculate stats
  const totalIncome = transactions.reduce((sum, t) => sum + t.amount_cents, 0);
  const incomeTransactions = transactions.filter(t => t.amount_cents > 0);
  const averageTransaction = incomeTransactions.length > 0 ? totalIncome / incomeTransactions.length : 0;
  const transactionCount = transactions.length;
  const firstTransaction = transactions[transactions.length - 1];

  // Prepare chart data (group by month)
  const monthlyData = transactions.reduce((acc: any, txn) => {
    const date = new Date(txn.created_at);
    const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
    if (!acc[monthKey]) {
      acc[monthKey] = { month: monthKey, total: 0 };
    }
    acc[monthKey].total += txn.amount_cents;
    return acc;
  }, {});

  const chartData: Array<{ month: string; total: number }> = (Object.values(monthlyData) as Array<{ month: string; total: number }>).sort((a, b) =>
    a.month.localeCompare(b.month)
  );

  // Calculate months since first transaction (minimum 1 month if transactions exist)
  const monthsSince = transactions.length > 0 ? Math.max(
    1,
    Math.floor(
      (new Date().getTime() - new Date(firstTransaction.created_at).getTime()) / (1000 * 60 * 60 * 24 * 30)
    )
  ) : 0;

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

  return (
    <div className={`p-4 md:p-6 space-y-6 ${nunito.variable} ${dmSans.variable}`} style={{ backgroundColor: 'var(--background)' }}>
      {/* Back Button */}
      <Link
        href="/activity"
        className="text-sm font-[family-name:var(--font-dm-sans)] text-text-secondary hover:text-text-primary flex items-center gap-1 mb-2"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to Activity
      </Link>

      {/* Hero Section */}
      <div className="space-y-1">
        <h1 className="font-[family-name:var(--font-nunito)] text-2xl sm:text-3xl md:text-4xl font-black break-words"
          style={{ color: 'var(--text-primary)' }}>
          Income History
        </h1>
        <p className="font-[family-name:var(--font-dm-sans)] text-sm sm:text-base"
          style={{ color: 'var(--text-tertiary)' }}>
          Complete transaction history
        </p>
      </div>

      <IncomeConfigProvider>
        <CategoryProvider mappings={categoryMappings}>
          <IncomeHistoryClient
            initialTransactions={transactionsWithAccounts}
            totalCount={transactionCount}
            totalIncome={totalIncome}
            averageTransaction={averageTransaction}
            monthsSince={monthsSince}
            chartData={chartData}
          />
        </CategoryProvider>
      </IncomeConfigProvider>
    </div>
  );
}
