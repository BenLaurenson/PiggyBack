export interface RecurringTransaction {
  description: string;
  averageAmount: number;
  frequency: "weekly" | "fortnightly" | "monthly";
  lastDate: Date;
  nextExpectedDate: Date;
  count: number;
  emoji: string;
}

export function detectRecurringTransactions(
  transactions: Array<{
    description: string;
    amount_cents: number;
    created_at: string;
  }>
): RecurringTransaction[] {
  // Group transactions by similar descriptions
  const groups = new Map<string, Array<{ amount: number; date: Date }>>();

  transactions.forEach(txn => {
    // Normalize description for grouping
    const normalized = txn.description
      .toLowerCase()
      .replace(/\d+/g, "") // Remove numbers
      .replace(/\s+/g, " ")
      .trim();

    if (!groups.has(normalized)) {
      groups.set(normalized, []);
    }

    groups.get(normalized)!.push({
      amount: Math.abs(txn.amount_cents),
      date: new Date(txn.created_at),
    });
  });

  const recurring: RecurringTransaction[] = [];

  groups.forEach((txns, description) => {
    // Need at least 2 occurrences to detect pattern (lowered from 3)
    if (txns.length < 2) return;

    // Sort by date
    txns.sort((a, b) => a.date.getTime() - b.date.getTime());

    // Calculate intervals between transactions
    const intervals: number[] = [];
    for (let i = 1; i < txns.length; i++) {
      const days = Math.round(
        (txns[i].date.getTime() - txns[i - 1].date.getTime()) / (1000 * 60 * 60 * 24)
      );
      intervals.push(days);
    }

    // Calculate average interval
    const avgInterval = intervals.reduce((sum, val) => sum + val, 0) / intervals.length;

    // Check if intervals are consistent (within 30% variance - increased from 20%)
    const variance = intervals.map(i => Math.abs(i - avgInterval) / avgInterval);
    const isConsistent = variance.every(v => v < 0.3);

    if (!isConsistent) return;

    // Check if amounts are similar (within 20% variance - increased from 10%)
    const avgAmount = txns.reduce((sum, t) => sum + t.amount, 0) / txns.length;
    const amountVariance = txns.map(t => Math.abs(t.amount - avgAmount) / avgAmount);
    const amountConsistent = amountVariance.every(v => v < 0.2);

    if (!amountConsistent) return;

    // Determine frequency (expanded ranges for more flexibility)
    let frequency: "weekly" | "fortnightly" | "monthly";
    if (avgInterval >= 5 && avgInterval <= 9) frequency = "weekly"; // Was 6-8
    else if (avgInterval >= 12 && avgInterval <= 16) frequency = "fortnightly"; // Was 13-15
    else if (avgInterval >= 26 && avgInterval <= 34) frequency = "monthly"; // Was 28-32
    else return; // Not a standard frequency

    // Calculate next expected date
    const lastDate = txns[txns.length - 1].date;
    const nextDate = new Date(lastDate);
    nextDate.setDate(nextDate.getDate() + avgInterval);

    // Determine emoji based on description
    let emoji = "💰";
    if (description.includes("rent")) emoji = "🏠";
    else if (description.includes("insurance")) emoji = "🚗";
    else if (description.includes("phone") || description.includes("mobile")) emoji = "📱";
    else if (description.includes("internet") || description.includes("wifi")) emoji = "🌐";
    else if (description.includes("electric") || description.includes("gas") || description.includes("water")) emoji = "⚡";
    else if (description.includes("netflix") || description.includes("spotify") || description.includes("subscription")) emoji = "📺";

    recurring.push({
      description: transactions.find(t =>
        t.description.toLowerCase().replace(/\d+/g, "").replace(/\s+/g, " ").trim() === description
      )?.description || description,
      averageAmount: avgAmount,
      frequency,
      lastDate,
      nextExpectedDate: nextDate,
      count: txns.length,
      emoji,
    });
  });

  // Sort by next expected date (soonest first)
  return recurring.sort((a, b) => a.nextExpectedDate.getTime() - b.nextExpectedDate.getTime());
}

