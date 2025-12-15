import { createClient } from "@/utils/supabase/server";
import { NextResponse } from "next/server";
import { sanitizeForAI } from "@/lib/sanitize-ai-input";
import { generalReadLimiter } from "@/lib/rate-limiter";

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

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

  // Check if user has API key configured
  const { data: profile } = await supabase
    .from("profiles")
    .select("ai_api_key, ai_provider")
    .eq("id", user.id)
    .maybeSingle();

  const hasApiKey = !!profile?.ai_api_key;

  // Get partnership
  const { data: membership } = await supabase
    .from("partnership_members")
    .select("partnership_id")
    .eq("user_id", user.id)
    .limit(1)
    .maybeSingle();

  const partnershipId = membership?.partnership_id;

  // Fetch accounts
  const { data: accounts } = await supabase
    .from("accounts")
    .select("id, balance_cents, display_name, account_type")
    .eq("user_id", user.id)
    .eq("is_active", true);

  const accountIds = accounts?.map((a) => a.id) || [];
  const totalBalance =
    accounts?.reduce((sum, acc) => sum + (acc.balance_cents || 0), 0) || 0;

  // Current month transactions
  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0);

  const { data: monthTxns } = await supabase
    .from("transactions")
    .select(
      "description, amount_cents, category_id, is_income, created_at"
    )
    .in("account_id", accountIds)
    .is("transfer_account_id", null)
    .gte("created_at", startOfMonth.toISOString())
    .lte("created_at", endOfMonth.toISOString())
    .limit(500);

  // Last month transactions for comparison
  const startOfLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const endOfLastMonth = new Date(now.getFullYear(), now.getMonth(), 0);

  const { data: lastMonthTxns } = await supabase
    .from("transactions")
    .select("amount_cents, category_id, is_income")
    .in("account_id", accountIds)
    .is("transfer_account_id", null)
    .gte("created_at", startOfLastMonth.toISOString())
    .lte("created_at", endOfLastMonth.toISOString())
    .limit(500);

  // Category mappings
  const { data: categoryMappings } = await supabase
    .from("category_mappings")
    .select("up_category_id, new_parent_name")
    .limit(200);

  const catMap = new Map(
    categoryMappings?.map((c) => [c.up_category_id, c.new_parent_name]) || []
  );

  // Calculate spending by category
  const spending = monthTxns
    ?.filter((t) => t.amount_cents < 0 && !t.is_income)
    .reduce((acc, t) => {
      const cat = catMap.get(t.category_id || "") || "Uncategorized";
      acc[cat] = (acc[cat] || 0) + Math.abs(t.amount_cents);
      return acc;
    }, {} as Record<string, number>);

  const monthlySpending = Math.abs(
    monthTxns
      ?.filter((t) => t.amount_cents < 0 && !t.is_income)
      .reduce((sum, t) => sum + t.amount_cents, 0) || 0
  );

  const monthlyIncome =
    monthTxns
      ?.filter((t) => t.amount_cents > 0 || t.is_income)
      .reduce((sum, t) => sum + Math.abs(t.amount_cents), 0) || 0;

  const lastMonthSpending = Math.abs(
    lastMonthTxns
      ?.filter((t) => t.amount_cents < 0 && !t.is_income)
      .reduce((sum, t) => sum + t.amount_cents, 0) || 0
  );

  // Top categories
  const topCategories = Object.entries(spending || {})
    .sort(([, a], [, b]) => b - a)
    .slice(0, 8)
    .map(([cat, cents]) => `  - ${cat}: $${(cents / 100).toFixed(0)}`)
    .join("\n");

  // Recent transactions (last 15)
  const recentTxns = monthTxns
    ?.sort(
      (a, b) =>
        new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    )
    .slice(0, 15)
    .map((t) => {
      const cat = catMap.get(t.category_id || "") || "";
      return `  - ${sanitizeForAI(t.description)}: $${(Math.abs(t.amount_cents) / 100).toFixed(0)} ${t.amount_cents > 0 ? "(income)" : ""} ${cat ? `[${cat}]` : ""}`;
    })
    .join("\n");

  // Upcoming bills
  let billsContext = "";
  if (partnershipId) {
    const twoWeeksFromNow = new Date(
      now.getTime() + 14 * 24 * 60 * 60 * 1000
    );
    const { data: bills } = await supabase
      .from("expense_definitions")
      .select("name, expected_amount_cents, next_due_date, emoji")
      .eq("partnership_id", partnershipId)
      .eq("is_active", true)
      .lte("next_due_date", twoWeeksFromNow.toISOString().split("T")[0])
      .order("next_due_date")
      .limit(50);

    if (bills?.length) {
      billsContext = `\nUpcoming bills (next 14 days):\n${bills.map((b) => `  - ${b.emoji || "📄"} ${b.name}: $${(b.expected_amount_cents / 100).toFixed(0)} due ${b.next_due_date}`).join("\n")}`;
    }
  }

  // Goals
  let goalsContext = "";
  if (partnershipId) {
    const { data: goals } = await supabase
      .from("savings_goals")
      .select("name, current_amount_cents, target_amount_cents, deadline")
      .eq("partnership_id", partnershipId)
      .eq("is_completed", false)
      .limit(50);

    if (goals?.length) {
      goalsContext = `\nSavings goals:\n${goals.map((g) => `  - ${g.name}: $${(g.current_amount_cents / 100).toFixed(0)} / $${(g.target_amount_cents / 100).toFixed(0)} (${Math.round((g.current_amount_cents / g.target_amount_cents) * 100)}%)${g.deadline ? ` by ${g.deadline}` : ""}`).join("\n")}`;
    }
  }

  const monthName = now.toLocaleDateString("en-AU", {
    month: "long",
    year: "numeric",
  });
  const lastMonthName = new Date(
    now.getFullYear(),
    now.getMonth() - 1,
    1
  ).toLocaleDateString("en-AU", { month: "long" });

  const context = `Date: ${now.toLocaleDateString("en-AU")}

Accounts: ${accounts?.length || 0} active
Total balance: $${(totalBalance / 100).toFixed(0)}

${monthName} summary:
  Income: $${(monthlyIncome / 100).toFixed(0)}
  Spending: $${(monthlySpending / 100).toFixed(0)}
  Net: $${((monthlyIncome - monthlySpending) / 100).toFixed(0)}

${lastMonthName} spending: $${(lastMonthSpending / 100).toFixed(0)} (${monthlySpending > lastMonthSpending ? `up $${((monthlySpending - lastMonthSpending) / 100).toFixed(0)}` : `down $${((lastMonthSpending - monthlySpending) / 100).toFixed(0)}`})

Spending by category this month:
${topCategories || "  No spending data yet"}

Recent transactions:
${recentTxns || "  No transactions yet"}${billsContext}${goalsContext}`;

  return NextResponse.json({ context, hasApiKey });
}
