import { createClient } from "@/utils/supabase/server";
import { NextRequest, NextResponse } from "next/server";
import { getEffectiveAccountIds } from "@/lib/get-effective-account-ids";

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const {
    format = "csv",
    dateFrom,
    dateTo,
    categoryFilter,
  } = body as {
    format: "csv" | "markdown";
    dateFrom?: string;
    dateTo?: string;
    categoryFilter?: string;
  };

  // Get accounts (with JOINT deduplication)
  const { data: membership } = await supabase
    .from("partnership_members")
    .select("partnership_id")
    .eq("user_id", user.id)
    .limit(1)
    .maybeSingle();

  if (!membership) {
    return NextResponse.json({ error: "Please set up your budget first" }, { status: 400 });
  }

  const accountIds = await getEffectiveAccountIds(supabase, membership.partnership_id, user.id, 'shared');

  // Build query
  let query = supabase
    .from("transactions")
    .select(
      "description, amount_cents, created_at, settled_at, status, category_id, parent_category_id, is_income, is_internal_transfer"
    )
    .in("account_id", accountIds)
    .is("transfer_account_id", null)
    .order("created_at", { ascending: false });

  if (dateFrom) query = query.gte("created_at", dateFrom);
  if (dateTo) query = query.lte("created_at", dateTo);
  if (categoryFilter)
    query = query.or(
      `category_id.eq.${categoryFilter},parent_category_id.eq.${categoryFilter}`
    );

  const { data: transactions } = await query;

  // Fetch category mappings
  const { data: categoryMappings } = await supabase
    .from("category_mappings")
    .select("up_category_id, new_parent_name, new_child_name");

  const catMap = new Map(
    categoryMappings?.map((m) => [m.up_category_id, m]) || []
  );

  const getCatName = (catId: string | null, parentId: string | null) => {
    if (catId) {
      const m = catMap.get(catId);
      if (m) return { parent: m.new_parent_name, child: m.new_child_name };
    }
    if (parentId) {
      const m = catMap.get(parentId);
      if (m) return { parent: m.new_parent_name, child: "" };
    }
    return { parent: "Uncategorized", child: "" };
  };

  if (format === "csv") {
    const header = "Date,Description,Amount,Category,Subcategory,Status,Type\n";
    const rows = (transactions || [])
      .map((t) => {
        const cat = getCatName(t.category_id, t.parent_category_id);
        const date = new Date(t.settled_at || t.created_at).toLocaleDateString(
          "en-AU"
        );
        const amount = (t.amount_cents / 100).toFixed(2);
        const type = t.is_income
          ? "Income"
          : t.is_internal_transfer
            ? "Transfer"
            : "Expense";
        const desc = t.description.replace(/,/g, " ");
        return `${date},"${desc}",${amount},"${cat.parent}","${cat.child}",${t.status},${type}`;
      })
      .join("\n");

    const csv = header + rows;
    const filename = `piggyback-transactions-${new Date().toISOString().split("T")[0]}.csv`;

    return new Response(csv, {
      headers: {
        "Content-Type": "text/csv",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  }

  // Markdown report
  const spending = (transactions || []).filter(
    (t) => t.amount_cents < 0 && !t.is_internal_transfer && !t.is_income
  );
  const income = (transactions || []).filter(
    (t) => t.amount_cents > 0 || t.is_income
  );

  const totalSpending = spending.reduce(
    (s, t) => s + Math.abs(t.amount_cents),
    0
  );
  const totalIncome = income.reduce(
    (s, t) => s + Math.abs(t.amount_cents),
    0
  );

  // Category totals
  const catTotals = new Map<string, number>();
  for (const t of spending) {
    const cat = getCatName(t.category_id, t.parent_category_id);
    catTotals.set(
      cat.parent,
      (catTotals.get(cat.parent) || 0) + Math.abs(t.amount_cents)
    );
  }

  const sortedCats = Array.from(catTotals.entries()).sort(
    (a, b) => b[1] - a[1]
  );

  // Top merchants
  const merchantTotals = new Map<string, number>();
  for (const t of spending) {
    merchantTotals.set(
      t.description,
      (merchantTotals.get(t.description) || 0) + Math.abs(t.amount_cents)
    );
  }
  const topMerchants = Array.from(merchantTotals.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10);

  const fmt = (cents: number) =>
    new Intl.NumberFormat("en-AU", {
      style: "currency",
      currency: "AUD",
      minimumFractionDigits: 0,
    }).format(cents / 100);

  const period = dateFrom && dateTo
    ? `${new Date(dateFrom).toLocaleDateString("en-AU")} - ${new Date(dateTo).toLocaleDateString("en-AU")}`
    : "All time";

  let md = `# PiggyBack Spending Report\n\n`;
  md += `**Period:** ${period}\n`;
  md += `**Generated:** ${new Date().toLocaleDateString("en-AU")}\n\n`;
  md += `## Overview\n\n`;
  md += `- **Total Income:** ${fmt(totalIncome)}\n`;
  md += `- **Total Spending:** ${fmt(totalSpending)}\n`;
  md += `- **Net:** ${fmt(totalIncome - totalSpending)}\n`;
  md += `- **Transactions:** ${transactions?.length || 0}\n\n`;
  md += `## Spending by Category\n\n`;
  md += `| Category | Amount | % |\n|----------|--------|---|\n`;
  for (const [cat, total] of sortedCats) {
    const pct = totalSpending > 0 ? ((total / totalSpending) * 100).toFixed(1) : "0";
    md += `| ${cat} | ${fmt(total)} | ${pct}% |\n`;
  }
  md += `\n## Top 10 Merchants\n\n`;
  md += `| Merchant | Amount |\n|----------|--------|\n`;
  for (const [merchant, total] of topMerchants) {
    md += `| ${merchant} | ${fmt(total)} |\n`;
  }

  const filename = `piggyback-report-${new Date().toISOString().split("T")[0]}.md`;

  return new Response(md, {
    headers: {
      "Content-Type": "text/markdown",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
