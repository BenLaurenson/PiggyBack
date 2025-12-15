import { createClient } from "@/utils/supabase/server";
import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { MerchantHistoryClient } from "@/components/activity/merchant-history-client";
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

export default async function MerchantPage({
  params,
  searchParams,
}: {
  params: Promise<{ merchant: string }>;
  searchParams: Promise<{ from?: string }>;
}) {
  const { merchant } = await params;
  const { from: referrer } = await searchParams;
  const merchantName = decodeURIComponent(merchant);
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

  // Fetch all transactions for this merchant
  const { data: transactions } = await supabase
    .from("transactions")
    .select(`
      *,
      category:categories!category_id(id, name),
      parent_category:categories!parent_category_id(id, name),
      transaction_tags(tag_name)
    `)
    .in("account_id", accountIds)
    .eq("description", merchantName)
    .order("created_at", { ascending: false });

  if (!transactions || transactions.length === 0) {
    notFound();
  }

  // Add account names
  const transactionsWithAccounts = transactions.map(txn => ({
    ...txn,
    accounts: accounts?.find(a => a.id === txn.account_id),
  }));

  // Calculate stats
  const totalSpent = Math.abs(transactions.reduce((sum, t) => sum + (t.amount_cents < 0 ? t.amount_cents : 0), 0));
  const expenseTransactions = transactions.filter(t => t.amount_cents < 0);
  const averageTransaction = expenseTransactions.length > 0 ? totalSpent / expenseTransactions.length : 0;
  const transactionCount = transactions.length;
  const firstTransaction = transactions[transactions.length - 1];
  const lastTransaction = transactions[0];

  const formatCurrency = (cents: number) => {
    return new Intl.NumberFormat("en-AU", {
      style: "currency",
      currency: "AUD",
      minimumFractionDigits: 0,
    }).format(cents / 100);
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString("en-AU", {
      day: "numeric",
      month: "short",
      year: "numeric",
    });
  };

  // Prepare chart data (group by month)
  const monthlyData = transactions.reduce((acc: any, txn) => {
    if (txn.amount_cents >= 0) return acc; // Skip income
    const date = new Date(txn.created_at);
    const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
    if (!acc[monthKey]) {
      acc[monthKey] = { month: monthKey, total: 0 };
    }
    acc[monthKey].total += Math.abs(txn.amount_cents);
    return acc;
  }, {});

  const chartData: Array<{ month: string; total: number }> = Object.values(monthlyData).sort((a: any, b: any) =>
    a.month.localeCompare(b.month)
  ) as Array<{ month: string; total: number }>;

  // Calculate months since first transaction (minimum 1 month if transactions exist)
  const monthsSince = Math.max(
    1,
    Math.floor(
      (new Date().getTime() - new Date(firstTransaction.created_at).getTime()) / (1000 * 60 * 60 * 24 * 30)
    )
  );

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
      {/* Back Button - Smart navigation based on referrer */}
      <Link
        href={
          referrer === "analysis" ? "/analysis" :
          referrer === "budget" ? "/budget?tab=analysis" :
          referrer === "home" ? "/home" :
          referrer === "plan" ? "/plan" :
          referrer === "settings" ? "/settings" :
          "/activity"
        }
        className="text-sm font-[family-name:var(--font-dm-sans)] text-text-secondary hover:text-text-primary flex items-center gap-1 mb-2"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to {
          referrer === "analysis" ? "Analysis" :
          referrer === "budget" ? "Budget Analysis" :
          referrer === "home" ? "Home" :
          referrer === "plan" ? "Plan" :
          referrer === "settings" ? "Settings" :
          "Activity"
        }
      </Link>

      {/* Hero Section */}
      <div className="space-y-1">
        <h1 className="font-[family-name:var(--font-nunito)] text-2xl sm:text-3xl md:text-4xl font-black break-words"
          style={{ color: 'var(--text-primary)' }}>
          {merchantName}
        </h1>
        <p className="font-[family-name:var(--font-dm-sans)] text-sm sm:text-base"
          style={{ color: 'var(--text-tertiary)' }}>
          Complete transaction history
        </p>
      </div>

      <CategoryProvider mappings={categoryMappings}>
        <MerchantHistoryClient
          initialTransactions={transactionsWithAccounts}
          merchantName={merchantName}
          totalCount={transactionCount}
          totalSpent={totalSpent}
          averageTransaction={averageTransaction}
          monthsSince={monthsSince}
          chartData={chartData}
        />
      </CategoryProvider>
    </div>
  );
}
