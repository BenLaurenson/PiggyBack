// Investment page calculation utilities
// Pure functions — no side effects, no database access

export interface InvestmentRecord {
  id: string;
  asset_type: string;
  name: string;
  ticker_symbol: string | null;
  current_value_cents: number;
  purchase_value_cents: number | null;
  quantity: number | null;
  created_at: string;
}

export interface AllocationEntry {
  type: string;
  value: number;
  count: number;
}

export interface BudgetContribution {
  investmentName: string;
  assignedCents: number;
}

export interface DividendMonth {
  month: string;
  amountCents: number;
}

/**
 * Calculate portfolio totals
 */
export function calculatePortfolioTotals(investments: InvestmentRecord[]) {
  const totalValue = investments.reduce((sum, inv) => sum + (inv.current_value_cents || 0), 0);
  const totalPurchaseValue = investments.reduce((sum, inv) => sum + (inv.purchase_value_cents || 0), 0);
  const totalGain = totalValue - totalPurchaseValue;
  const totalGainPercentage = totalPurchaseValue > 0 ? (totalGain / totalPurchaseValue) * 100 : 0;

  return { totalValue, totalPurchaseValue, totalGain, totalGainPercentage };
}

/**
 * Group investments by asset type
 */
export function groupByAssetType(investments: InvestmentRecord[]): Record<string, InvestmentRecord[]> {
  const groups: Record<string, InvestmentRecord[]> = {};
  for (const inv of investments) {
    if (!groups[inv.asset_type]) groups[inv.asset_type] = [];
    groups[inv.asset_type].push(inv);
  }
  return groups;
}

/**
 * Calculate allocation breakdown by asset type
 */
export function calculateAllocation(investments: InvestmentRecord[]): AllocationEntry[] {
  const groups = groupByAssetType(investments);
  return Object.entries(groups).map(([type, items]) => ({
    type,
    value: items.reduce((sum, inv) => sum + (inv.current_value_cents || 0), 0),
    count: items.length,
  }));
}

/**
 * Calculate FIRE progress from profile data
 */
export function calculateFireProgress(
  totalInvestmentCents: number,
  superBalanceCents: number,
  annualExpenseOverrideCents: number | null,
  fireVariant: string,
  calculateFireNumber: (annualExpenses: number) => number
): {
  progressPercent: number;
  fireNumberCents: number;
  currentTotalCents: number;
  fireVariant: string;
} | null {
  const currentTotal = totalInvestmentCents + superBalanceCents;
  const annualExpenses = annualExpenseOverrideCents || 6000000; // $60k default
  const fireNumber = calculateFireNumber(annualExpenses);
  const progressPercent = fireNumber > 0 ? Math.min(100, (currentTotal / fireNumber) * 100) : 0;

  return {
    progressPercent,
    fireNumberCents: fireNumber,
    currentTotalCents: currentTotal,
    fireVariant: fireVariant || "regular",
  };
}

/**
 * Map budget assignments to investment contributions
 */
export function mapBudgetContributions(
  assignments: { asset_id: string; assigned_cents: number }[],
  investments: InvestmentRecord[]
): { contributions: BudgetContribution[]; total: number } {
  const contributions = assignments
    .map((a) => {
      const inv = investments.find((i) => i.id === a.asset_id);
      return {
        investmentName: inv?.name || "Unknown",
        assignedCents: a.assigned_cents || 0,
      };
    })
    .filter((c) => c.assignedCents > 0);

  const total = contributions.reduce((s, c) => s + c.assignedCents, 0);
  return { contributions, total };
}

/**
 * Aggregate dividend transactions by month for the last 12 months
 */
export function aggregateDividendsByMonth(
  transactions: { amount_cents: number; created_at: string }[],
  now: Date
): { monthly: DividendMonth[]; annualTotal: number; monthlyAvg: number } {
  const monthly: DividendMonth[] = [];

  for (let i = 11; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const monthStr = d.toLocaleDateString("en-AU", { month: "short" });
    const monthStart = new Date(d.getFullYear(), d.getMonth(), 1);
    const monthEnd = new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59);

    const monthTotal = transactions
      .filter((t) => {
        const txDate = new Date(t.created_at);
        return txDate >= monthStart && txDate <= monthEnd;
      })
      .reduce((s, t) => s + Math.abs(t.amount_cents || 0), 0);

    monthly.push({ month: monthStr, amountCents: monthTotal });
  }

  const annualTotal = monthly.reduce((s, d) => s + d.amountCents, 0);
  const monthlyAvg = monthly.length > 0 ? Math.round(annualTotal / monthly.length) : 0;

  return { monthly, annualTotal, monthlyAvg };
}

/**
 * Calculate annualized return for an investment
 */
export function calculateAnnualizedReturn(
  currentValueCents: number,
  purchaseValueCents: number | null,
  createdAt: string | null,
  now: Date = new Date()
): number {
  if (!purchaseValueCents || purchaseValueCents <= 0) return 0;

  const daysSincePurchase = createdAt
    ? Math.max(1, Math.floor((now.getTime() - new Date(createdAt).getTime()) / (1000 * 60 * 60 * 24)))
    : 1;

  const totalReturn = (currentValueCents - purchaseValueCents) / purchaseValueCents;

  if (daysSincePurchase >= 365) {
    return (Math.pow(1 + totalReturn, 365 / daysSincePurchase) - 1) * 100;
  }

  return totalReturn * 100;
}

/**
 * Calculate portfolio weight for a single investment
 */
export function calculatePortfolioWeight(
  investmentValueCents: number,
  totalPortfolioCents: number
): number {
  return totalPortfolioCents > 0
    ? (investmentValueCents / totalPortfolioCents) * 100
    : 0;
}
