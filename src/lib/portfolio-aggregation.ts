// Portfolio aggregation utilities for investment dashboard
// Pure functions — no side effects, no database access

export interface PortfolioInvestment {
  id: string;
  current_value_cents: number;
  purchase_value_cents: number | null;
  created_at: string;
}

export interface HistoryRecord {
  investment_id: string;
  value_cents: number;
  recorded_at: string;
}

export interface PortfolioDataPoint {
  date: string; // YYYY-MM-DD
  valueCents: number;
}

export interface PerformanceMetrics {
  totalROIPercent: number;
  totalGainCents: number;
  bestPerformer: { name: string; gainPercent: number } | null;
  worstPerformer: { name: string; gainPercent: number } | null;
}

export interface TopMover {
  id: string;
  name: string;
  ticker_symbol: string | null;
  asset_type: string;
  gainCents: number;
  gainPercent: number;
}

export interface RebalanceDelta {
  assetType: string;
  currentPercent: number;
  targetPercent: number;
  deltaPercent: number;
  deltaCents: number;
  isOverweight: boolean;
}

/**
 * Aggregate per-investment history into a combined portfolio value over time.
 *
 * For each date that has at least one history record, we forward-fill
 * the latest known value for every other investment and sum them.
 */
export function aggregatePortfolioHistory(
  investments: PortfolioInvestment[],
  history: HistoryRecord[],
  startDate: Date,
  endDate: Date
): PortfolioDataPoint[] {
  if (investments.length === 0) return [];

  // Collect all unique dates from history within range
  const startStr = toDateStr(startDate);
  const endStr = toDateStr(endDate);

  // Build per-investment timeline: investmentId -> sorted [{date, valueCents}]
  const perInvestment = new Map<string, { date: string; valueCents: number }[]>();
  for (const inv of investments) {
    perInvestment.set(inv.id, []);
  }

  for (const h of history) {
    const dateStr = toDateStr(new Date(h.recorded_at));
    if (dateStr < startStr || dateStr > endStr) continue;
    const arr = perInvestment.get(h.investment_id);
    if (arr) {
      arr.push({ date: dateStr, valueCents: h.value_cents });
    }
  }

  // Sort each timeline by date
  for (const [, arr] of perInvestment) {
    arr.sort((a, b) => a.date.localeCompare(b.date));
  }

  // Collect all unique dates across all investments
  const allDates = new Set<string>();
  for (const [, arr] of perInvestment) {
    for (const entry of arr) {
      allDates.add(entry.date);
    }
  }

  // Also add start and end dates if there's any history
  if (allDates.size > 0) {
    // Add the initial value date for investments that existed before startDate
    for (const inv of investments) {
      const invCreated = toDateStr(new Date(inv.created_at));
      if (invCreated <= startStr) {
        allDates.add(startStr);
      }
    }
    allDates.add(endStr);
  }

  const sortedDates = Array.from(allDates).sort();
  if (sortedDates.length === 0) return [];

  // For each date, forward-fill latest known value per investment
  const result: PortfolioDataPoint[] = [];
  const lastKnown = new Map<string, number>();

  // Initialize lastKnown with the most recent value before startDate for each investment
  for (const h of history) {
    const dateStr = toDateStr(new Date(h.recorded_at));
    if (dateStr < startStr) {
      const existing = lastKnown.get(h.investment_id);
      // Keep the most recent pre-start value
      if (existing === undefined) {
        lastKnown.set(h.investment_id, h.value_cents);
      } else {
        // history might not be sorted, so compare dates
        const existingEntries = history.filter(
          (x) => x.investment_id === h.investment_id && toDateStr(new Date(x.recorded_at)) < startStr
        );
        const latest = existingEntries.sort(
          (a, b) => new Date(b.recorded_at).getTime() - new Date(a.recorded_at).getTime()
        )[0];
        if (latest) {
          lastKnown.set(h.investment_id, latest.value_cents);
        }
      }
    }
  }

  // Also set initial values for investments with no pre-start history
  for (const inv of investments) {
    if (!lastKnown.has(inv.id)) {
      const invCreated = toDateStr(new Date(inv.created_at));
      if (invCreated <= startStr) {
        // Investment existed before start but no history — use current value as fallback
        lastKnown.set(inv.id, inv.current_value_cents);
      }
    }
  }

  for (const date of sortedDates) {
    // Update lastKnown with any values recorded on this date
    for (const [invId, arr] of perInvestment) {
      const entriesForDate = arr.filter((e) => e.date === date);
      if (entriesForDate.length > 0) {
        // Use the latest entry for this date
        lastKnown.set(invId, entriesForDate[entriesForDate.length - 1].valueCents);
      }
    }

    // Check if the investment existed by this date
    let total = 0;
    for (const inv of investments) {
      const invCreated = toDateStr(new Date(inv.created_at));
      if (invCreated <= date) {
        total += lastKnown.get(inv.id) || 0;
      }
    }

    result.push({ date, valueCents: total });
  }

  return result;
}

/**
 * Calculate performance metrics for the portfolio.
 */
export function calculatePerformanceMetrics(
  investments: (PortfolioInvestment & { name: string })[]
): PerformanceMetrics {
  const totalValue = investments.reduce((s, i) => s + i.current_value_cents, 0);
  const totalPurchase = investments.reduce((s, i) => s + (i.purchase_value_cents || 0), 0);
  const totalGainCents = totalValue - totalPurchase;
  const totalROIPercent = totalPurchase > 0 ? (totalGainCents / totalPurchase) * 100 : 0;

  let bestPerformer: { name: string; gainPercent: number } | null = null;
  let worstPerformer: { name: string; gainPercent: number } | null = null;

  for (const inv of investments) {
    if (!inv.purchase_value_cents || inv.purchase_value_cents <= 0) continue;
    const gain = inv.current_value_cents - inv.purchase_value_cents;
    const pct = (gain / inv.purchase_value_cents) * 100;

    if (!bestPerformer || pct > bestPerformer.gainPercent) {
      bestPerformer = { name: inv.name, gainPercent: pct };
    }
    if (!worstPerformer || pct < worstPerformer.gainPercent) {
      worstPerformer = { name: inv.name, gainPercent: pct };
    }
  }

  return { totalROIPercent, totalGainCents, bestPerformer, worstPerformer };
}

/**
 * Calculate top movers by gain/loss (both $ and %).
 */
export function calculateTopMovers(
  investments: (PortfolioInvestment & { name: string; ticker_symbol: string | null; asset_type: string })[]
): { gainers: TopMover[]; losers: TopMover[] } {
  const withGain = investments
    .filter((i) => i.purchase_value_cents && i.purchase_value_cents > 0)
    .map((i) => {
      const gainCents = i.current_value_cents - (i.purchase_value_cents || 0);
      const gainPercent = i.purchase_value_cents! > 0
        ? (gainCents / i.purchase_value_cents!) * 100
        : 0;
      return {
        id: i.id,
        name: i.name,
        ticker_symbol: i.ticker_symbol,
        asset_type: i.asset_type,
        gainCents,
        gainPercent,
      };
    });

  const gainers = [...withGain]
    .filter((m) => m.gainCents > 0)
    .sort((a, b) => b.gainPercent - a.gainPercent)
    .slice(0, 3);

  const losers = [...withGain]
    .filter((m) => m.gainCents < 0)
    .sort((a, b) => a.gainPercent - b.gainPercent)
    .slice(0, 3);

  return { gainers, losers };
}

/**
 * Calculate rebalancing deltas between current and target allocation.
 */
export function calculateRebalancing(
  currentAllocation: { assetType: string; valueCents: number }[],
  targetAllocations: { asset_type: string; target_percentage: number }[],
  totalValueCents: number
): RebalanceDelta[] {
  if (targetAllocations.length === 0 || totalValueCents <= 0) return [];

  const targetMap = new Map(targetAllocations.map((t) => [t.asset_type, t.target_percentage]));
  const currentMap = new Map(currentAllocation.map((c) => [c.assetType, c.valueCents]));

  // Combine all asset types from both current and target
  const allTypes = new Set([
    ...targetMap.keys(),
    ...currentMap.keys(),
  ]);

  const deltas: RebalanceDelta[] = [];
  for (const assetType of allTypes) {
    const currentCents = currentMap.get(assetType) || 0;
    const currentPercent = (currentCents / totalValueCents) * 100;
    const targetPercent = targetMap.get(assetType) || 0;
    const deltaPercent = currentPercent - targetPercent;
    const deltaCents = Math.round((deltaPercent / 100) * totalValueCents);

    deltas.push({
      assetType,
      currentPercent,
      targetPercent,
      deltaPercent,
      deltaCents,
      isOverweight: deltaPercent > 0,
    });
  }

  return deltas.sort((a, b) => Math.abs(b.deltaPercent) - Math.abs(a.deltaPercent));
}

/**
 * Get the start date for a given time period.
 */
export function getStartDateForPeriod(period: string, now: Date = new Date()): Date {
  const d = new Date(now);
  switch (period) {
    case "1W":
      d.setDate(d.getDate() - 7);
      return d;
    case "1M":
      d.setMonth(d.getMonth() - 1);
      return d;
    case "3M":
      d.setMonth(d.getMonth() - 3);
      return d;
    case "6M":
      d.setMonth(d.getMonth() - 6);
      return d;
    case "1Y":
      d.setFullYear(d.getFullYear() - 1);
      return d;
    case "ALL":
      return new Date(2000, 0, 1);
    default:
      d.setMonth(d.getMonth() - 3);
      return d;
  }
}

function toDateStr(d: Date): string {
  return d.toISOString().split("T")[0];
}
