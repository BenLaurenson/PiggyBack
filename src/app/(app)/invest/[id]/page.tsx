import { createClient } from "@/utils/supabase/server";
import { InvestDetailClient } from "@/components/invest/invest-detail-client";
import { redirect } from "next/navigation";
import { getStartDateForPeriod } from "@/lib/portfolio-aggregation";

interface InvestDetailPageProps {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}

export default async function InvestDetailPage({ params, searchParams }: InvestDetailPageProps) {
  const { id } = await params;
  const resolvedSearchParams = await searchParams;
  const period = (typeof resolvedSearchParams.period === "string" ? resolvedSearchParams.period : "3M") as string;

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  // Fetch the investment
  const { data: investment } = await supabase
    .from("investments")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (!investment) {
    redirect("/invest");
  }

  // Verify ownership through partnership
  const { data: membership } = await supabase
    .from("partnership_members")
    .select("partnership_id")
    .eq("user_id", user?.id)
    .limit(1)
    .maybeSingle();

  if (investment.partnership_id !== membership?.partnership_id) {
    redirect("/invest");
  }

  const now = new Date();
  const startDate = getStartDateForPeriod(period, now);

  // Fetch price history and portfolio total in parallel
  const [{ data: history }, { data: allInvestments }] = await Promise.all([
    supabase
      .from("investment_history")
      .select("value_cents, recorded_at")
      .eq("investment_id", id)
      .gte("recorded_at", startDate.toISOString())
      .order("recorded_at", { ascending: true }),
    supabase
      .from("investments")
      .select("current_value_cents")
      .eq("partnership_id", investment.partnership_id),
  ]);

  // Portfolio weight
  const totalPortfolio = (allInvestments || []).reduce((s, i) => s + (i.current_value_cents || 0), 0);
  const portfolioWeight = totalPortfolio > 0
    ? (investment.current_value_cents / totalPortfolio) * 100
    : 0;

  // Annualized return
  const daysSincePurchase = investment.created_at
    ? Math.max(1, Math.floor((now.getTime() - new Date(investment.created_at).getTime()) / (1000 * 60 * 60 * 24)))
    : 1;
  const totalReturn = investment.purchase_value_cents && investment.purchase_value_cents > 0
    ? (investment.current_value_cents - investment.purchase_value_cents) / investment.purchase_value_cents
    : 0;
  const annualizedReturn = daysSincePurchase >= 365
    ? (Math.pow(1 + totalReturn, 365 / daysSincePurchase) - 1) * 100
    : totalReturn * 100; // For less than a year, just show simple return

  return (
    <div className="p-4 md:p-6 lg:p-8">
      <InvestDetailClient
        investment={investment}
        history={history || []}
        currentPeriod={period}
        portfolioWeight={portfolioWeight}
        annualizedReturn={annualizedReturn}
      />
    </div>
  );
}
