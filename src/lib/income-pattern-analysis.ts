/**
 * Income Pattern Analysis
 * Analyzes income transaction history to detect pay frequency,
 * average amount, and predict next pay date.
 */

export interface IncomeTransaction {
  id: string;
  created_at: string;
  amount_cents: number;
  description: string;
  income_type?: string;
}

export interface DetectedPaySchedule {
  frequency: 'weekly' | 'fortnightly' | 'monthly' | 'bi-monthly' | 'unknown';
  averageAmountCents: number;
  lastPayAmountCents: number;
  nextPredictedPayDate: string | null;
  confidence: 'high' | 'medium' | 'low';
  transactionCount: number;
}

/**
 * Analyze income transaction pattern
 */
export function analyzeIncomePattern(transactions: IncomeTransaction[]): DetectedPaySchedule {
  if (transactions.length === 0) {
    return {
      frequency: 'unknown',
      averageAmountCents: 0,
      lastPayAmountCents: 0,
      nextPredictedPayDate: null,
      confidence: 'low',
      transactionCount: 0,
    };
  }

  // Sort by date ascending
  const sorted = [...transactions].sort(
    (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
  );

  // Calculate average amount
  const totalCents = sorted.reduce((sum, t) => sum + t.amount_cents, 0);
  const averageAmountCents = Math.round(totalCents / sorted.length);
  const lastPayAmountCents = sorted[sorted.length - 1].amount_cents;

  // Detect frequency by analyzing gaps between transactions
  const frequency = detectPayFrequency(sorted);

  // Predict next pay date
  const lastPayDate = new Date(sorted[sorted.length - 1].created_at);
  const nextPredictedPayDate = predictNextPayDate(lastPayDate, frequency);

  // Determine confidence based on transaction count and consistency
  const confidence = determineConfidence(sorted.length, frequency);

  return {
    frequency,
    averageAmountCents,
    lastPayAmountCents,
    nextPredictedPayDate,
    confidence,
    transactionCount: sorted.length,
  };
}

/**
 * Detect pay frequency by analyzing gaps between transactions
 */
function detectPayFrequency(
  transactions: IncomeTransaction[]
): 'weekly' | 'fortnightly' | 'monthly' | 'bi-monthly' | 'unknown' {
  if (transactions.length < 2) {
    return 'unknown';
  }

  // Calculate gaps in days between consecutive transactions
  const gaps: number[] = [];
  for (let i = 1; i < transactions.length; i++) {
    const prevDate = new Date(transactions[i - 1].created_at);
    const currDate = new Date(transactions[i].created_at);
    const daysDiff = Math.round((currDate.getTime() - prevDate.getTime()) / (1000 * 60 * 60 * 24));
    gaps.push(daysDiff);
  }

  // Calculate average gap
  const avgGap = gaps.reduce((sum, gap) => sum + gap, 0) / gaps.length;

  // Detect frequency with tolerance
  if (avgGap >= 6 && avgGap <= 8) {
    return 'weekly';
  } else if (avgGap >= 13 && avgGap <= 15) {
    return 'fortnightly';
  } else if (avgGap >= 28 && avgGap <= 32) {
    return 'monthly';
  } else if (avgGap >= 56 && avgGap <= 65) {
    return 'bi-monthly';
  }

  return 'unknown';
}

/**
 * Predict next pay date based on last pay date and frequency
 */
function predictNextPayDate(
  lastPayDate: Date,
  frequency: 'weekly' | 'fortnightly' | 'monthly' | 'bi-monthly' | 'unknown'
): string | null {
  if (frequency === 'unknown') {
    return null;
  }

  const next = new Date(lastPayDate);

  switch (frequency) {
    case 'weekly':
      next.setDate(next.getDate() + 7);
      break;
    case 'fortnightly':
      next.setDate(next.getDate() + 14);
      break;
    case 'monthly':
      next.setMonth(next.getMonth() + 1);
      break;
    case 'bi-monthly':
      next.setMonth(next.getMonth() + 2);
      break;
  }

  return next.toISOString().split('T')[0];
}

/**
 * Determine confidence level based on data quality
 */
function determineConfidence(
  transactionCount: number,
  frequency: 'weekly' | 'fortnightly' | 'monthly' | 'bi-monthly' | 'unknown'
): 'high' | 'medium' | 'low' {
  if (frequency === 'unknown') {
    return 'low';
  }

  if (transactionCount >= 6) {
    return 'high';
  } else if (transactionCount >= 3) {
    return 'medium';
  }

  return 'low';
}

