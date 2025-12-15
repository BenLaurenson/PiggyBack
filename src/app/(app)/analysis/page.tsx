import { createClient } from "@/utils/supabase/server";
import { EmptyState } from "@/components/ui/empty-state";
import { BudgetAnalysisDashboard } from "@/components/budget/budget-analysis-dashboard";
import { getAnalysisData } from "@/lib/analysis-data";

// Cache for 5 minutes — revalidated on-demand by webhook + income server actions
export const revalidate = 300;

export default async function AnalysisPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return <div>Please log in</div>;
  }

  const data = await getAnalysisData(supabase, user.id);

  if (!data) {
    return (
      <div className="p-4 md:p-6">
        <EmptyState
          icon="📊"
          title="No data yet"
          description="Connect your bank account to start seeing spending analysis."
          action={{ label: "Get Started", href: "/settings/up-connection", color: "coral" }}
        />
      </div>
    );
  }

  return (
    <div
      className="min-h-screen pb-24"
      style={{ backgroundColor: "var(--background)" }}
    >
      <div className="p-4 md:p-6 lg:p-8">
        <div className="space-y-1 mb-6">
          <h1 className="font-[family-name:var(--font-nunito)] text-3xl font-black text-text-primary">
            Analysis
          </h1>
          <p className="font-[family-name:var(--font-dm-sans)] text-text-secondary">
            Track your spending patterns and trends over time
          </p>
        </div>
        <BudgetAnalysisDashboard
          allTransactions={data.allTransactions}
          incomeTransactions={data.incomeTransactions}
          categories={data.categories}
          subcategories={data.subcategories}
          categoryMappings={data.categoryMappings}
          incomeSources={data.incomeSources}
          partnerIncomeSources={data.partnerIncomeSources}
          netWorthSnapshots={data.netWorthSnapshots}
        />
      </div>
    </div>
  );
}
