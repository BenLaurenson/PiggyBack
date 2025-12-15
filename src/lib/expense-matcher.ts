/**
 * Expense Matcher - Links transactions to expense definitions
 * Handles pattern matching, confidence scoring, and auto-detection
 */

export interface Transaction {
  id: string;
  up_transaction_id?: string; // NEW: Up Bank transaction ID for direct matching
  description: string;
  amount_cents: number;
  created_at: string;
  category_id?: string;
}

// Import from canonical location and re-export for backward compatibility
import type { ExpenseDefinition } from '@/types/expense';
export type { ExpenseDefinition } from '@/types/expense';

export interface MatchResult {
  expense_id: string;
  transaction_id: string;
  confidence: number;
  reason: string;
}

// =====================================================
// PATTERN MATCHING
// =====================================================

/**
 * Check if transaction matches expense pattern
 * Supports SQL LIKE patterns (%, _)
 */
function matchesPattern(description: string, pattern: string): boolean {
  if (!pattern) return false;

  // Convert SQL LIKE pattern to regex
  // % = .* (any characters)
  // _ = . (single character)
  const regexPattern = pattern
    .replace(/[.*+?^${}()|[\]\\]/g, '\\$&') // Escape regex special chars
    .replace(/%/g, '.*') // % → .*
    .replace(/_/g, '.'); // _ → .

  const regex = new RegExp(`^${regexPattern}$`, 'i'); // Case insensitive
  return regex.test(description);
}

/**
 * Calculate match confidence score (0.0 - 1.0)
 * Based on description similarity, amount similarity, timing
 */
function calculateMatchConfidence(
  transaction: Transaction,
  expense: ExpenseDefinition
): number {
  let confidence = 0;

  // 1. Pattern match (40 points)
  if (expense.match_pattern && matchesPattern(transaction.description, expense.match_pattern)) {
    confidence += 0.4;
  } else {
    // Fuzzy name match (20 points for partial match)
    const expenseLower = expense.name.toLowerCase();
    const descLower = transaction.description.toLowerCase();
    if (descLower.includes(expenseLower) || expenseLower.includes(descLower)) {
      confidence += 0.2;
    } else {
      // No match, return early
      return 0;
    }
  }

  // 2. Amount similarity (40 points)
  const amountDiff = Math.abs(Math.abs(transaction.amount_cents) - expense.expected_amount_cents);
  const amountDiffPercent = amountDiff / expense.expected_amount_cents;

  if (amountDiffPercent <= 0.05) {
    // Within 5% - exact match
    confidence += 0.4;
  } else if (amountDiffPercent <= 0.10) {
    // Within 10%
    confidence += 0.3;
  } else if (amountDiffPercent <= 0.20) {
    // Within 20%
    confidence += 0.2;
  } else if (amountDiffPercent <= 0.50) {
    // Within 50%
    confidence += 0.1;
  }
  // Else: 0 points for amount

  // 3. Timing proximity (20 points)
  const dueDate = new Date(expense.next_due_date);
  const txnDate = new Date(transaction.created_at);
  const daysDiff = Math.abs((txnDate.getTime() - dueDate.getTime()) / (1000 * 60 * 60 * 24));

  if (daysDiff <= 1) {
    // Same day or 1 day off
    confidence += 0.2;
  } else if (daysDiff <= 3) {
    // Within 3 days
    confidence += 0.15;
  } else if (daysDiff <= 7) {
    // Within a week
    confidence += 0.1;
  } else if (daysDiff <= 14) {
    // Within 2 weeks
    confidence += 0.05;
  }
  // Else: 0 points for timing

  return Math.min(1.0, confidence);
}

/**
 * Find best matching expense for a transaction (ENHANCED)
 * Prioritizes direct transaction ID matches over pattern matching
 * Returns null if no confident match found
 */
export function findBestMatch(
  transaction: Transaction,
  expenses: ExpenseDefinition[],
  minConfidence: number = 0.6
): MatchResult | null {
  // NEW: First check for direct transaction ID match
  // This takes priority over pattern matching for accuracy
  const directMatch = expenses.find(
    e => e.linked_up_transaction_id && e.linked_up_transaction_id === transaction.up_transaction_id
  );

  if (directMatch) {
    return {
      expense_id: directMatch.id,
      transaction_id: transaction.id,
      confidence: 1.0,
      reason: 'Direct Up Bank transaction ID match',
    };
  }

  // FALLBACK: Use existing pattern matching
  const matches: MatchResult[] = [];

  for (const expense of expenses) {
    const confidence = calculateMatchConfidence(transaction, expense);

    if (confidence >= minConfidence) {
      matches.push({
        expense_id: expense.id,
        transaction_id: transaction.id,
        confidence,
        reason: buildMatchReason(transaction, expense, confidence),
      });
    }
  }

  if (matches.length === 0) return null;

  // Sort by confidence descending
  matches.sort((a, b) => b.confidence - a.confidence);

  // Return best match
  return matches[0];
}

/**
 * Build human-readable match reason
 */
function buildMatchReason(
  transaction: Transaction,
  expense: ExpenseDefinition,
  confidence: number
): string {
  const reasons: string[] = [];

  if (expense.match_pattern && matchesPattern(transaction.description, expense.match_pattern)) {
    reasons.push('pattern match');
  }

  const amountDiff = Math.abs(Math.abs(transaction.amount_cents) - expense.expected_amount_cents);
  const amountDiffPercent = (amountDiff / expense.expected_amount_cents) * 100;

  if (amountDiffPercent <= 5) {
    reasons.push('exact amount');
  } else if (amountDiffPercent <= 10) {
    reasons.push('similar amount');
  }

  const dueDate = new Date(expense.next_due_date);
  const txnDate = new Date(transaction.created_at);
  const daysDiff = Math.abs((txnDate.getTime() - dueDate.getTime()) / (1000 * 60 * 60 * 24));

  if (daysDiff <= 1) {
    reasons.push('on due date');
  } else if (daysDiff <= 3) {
    reasons.push('near due date');
  }

  if (reasons.length === 0) {
    reasons.push('description similarity');
  }

  return reasons.join(', ') + ` (${(confidence * 100).toFixed(0)}% confident)`;
}

// =====================================================
// AUTO-DETECTION HELPERS
// =====================================================

/**
 * Suggest match pattern from transaction description
 */
export function suggestMatchPattern(description: string): string {
  // Clean up description
  const cleaned = description
    .toUpperCase()
    .replace(/\d+/g, '') // Remove numbers
    .replace(/[^A-Z\s]/g, '') // Remove special chars
    .trim();

  // Take first 2-3 significant words
  const words = cleaned.split(/\s+/).filter(w => w.length > 2);
  const significantWords = words.slice(0, Math.min(3, words.length));

  if (significantWords.length === 0) {
    // Fallback to whole description
    return `%${cleaned}%`;
  }

  // Build pattern: Start with first word, add wildcard
  return `${significantWords[0]}%`;
}

/**
 * Suggest expense category based on description keywords
 */
export function suggestExpenseCategory(description: string): string {
  const lower = description.toLowerCase();

  // Housing & Utilities
  if (lower.includes('rent') || lower.includes('mortgage')) return 'Housing & Utilities';
  if (lower.includes('electric') || lower.includes('gas') || lower.includes('water')) return 'Housing & Utilities';
  if (lower.includes('internet') || lower.includes('wifi')) return 'Tech & Communication';

  // Transportation
  if (lower.includes('insurance') && (lower.includes('car') || lower.includes('auto'))) return 'Transportation';
  if (lower.includes('fuel') || lower.includes('petrol') || lower.includes('gas station')) return 'Transportation';
  if (lower.includes('uber') || lower.includes('taxi')) return 'Transportation';

  // Food & Dining
  if (lower.includes('woolworths') || lower.includes('coles') || lower.includes('aldi')) return 'Food & Dining';
  if (lower.includes('restaurant') || lower.includes('cafe') || lower.includes('food')) return 'Food & Dining';

  // Subscriptions
  if (lower.includes('netflix') || lower.includes('spotify') || lower.includes('subscription')) return 'Entertainment & Leisure';
  if (lower.includes('gym') || lower.includes('fitness')) return 'Health & Wellness';

  // Phone
  if (lower.includes('telstra') || lower.includes('optus') || lower.includes('vodafone')) return 'Tech & Communication';
  if (lower.includes('phone') || lower.includes('mobile')) return 'Tech & Communication';

  // Default
  return 'Other';
}

/**
 * Suggest emoji based on expense name/description
 */
export function suggestExpenseEmoji(name: string, category: string): string {
  const lower = name.toLowerCase();

  // Specific merchants/services
  if (lower.includes('netflix')) return '📺';
  if (lower.includes('spotify')) return '🎵';
  if (lower.includes('gym')) return '💪';
  if (lower.includes('rent')) return '🏠';
  if (lower.includes('mortgage')) return '🏠';
  if (lower.includes('insurance')) return '🛡️';
  if (lower.includes('phone')) return '📱';
  if (lower.includes('internet')) return '🌐';
  if (lower.includes('electric') || lower.includes('power')) return '⚡';
  if (lower.includes('gas')) return '🔥';
  if (lower.includes('water')) return '💧';
  if (lower.includes('grocery') || lower.includes('woolworths') || lower.includes('coles')) return '🛒';
  if (lower.includes('fuel') || lower.includes('petrol')) return '⛽';

  // Category-based fallback
  if (category.includes('Food')) return '🍔';
  if (category.includes('Housing')) return '🏠';
  if (category.includes('Transport')) return '🚗';
  if (category.includes('Entertainment')) return '🎮';
  if (category.includes('Health')) return '⚕️';
  if (category.includes('Tech')) return '💻';

  // Default
  return '💰';
}

// =====================================================
// PATTERN DETECTION HELPERS (for TransactionSelector)
// =====================================================

/**
 * Detect recurrence pattern from transaction gaps
 * Analyzes time between transactions to determine frequency
 */
export function detectRecurrenceFromGaps(transactions: Transaction[]): string {
  if (transactions.length < 2) return 'one-time';
  if (transactions.length === 2) return 'irregular';

  // Calculate gaps between consecutive transactions (in days)
  const gaps: number[] = [];
  for (let i = 1; i < transactions.length; i++) {
    const prevDate = new Date(transactions[i - 1].created_at);
    const currDate = new Date(transactions[i].created_at);
    const diffDays = Math.round((currDate.getTime() - prevDate.getTime()) / (1000 * 60 * 60 * 24));
    gaps.push(diffDays);
  }

  // Calculate average gap
  const avgGap = gaps.reduce((sum, gap) => sum + gap, 0) / gaps.length;

  // Calculate standard deviation to check consistency
  const variance = gaps.reduce((sum, gap) => sum + Math.pow(gap - avgGap, 2), 0) / gaps.length;
  const stdDev = Math.sqrt(variance);
  const consistency = stdDev / avgGap; // Lower is more consistent

  // If gaps are too inconsistent, mark as irregular
  if (consistency > 0.3) return 'irregular';

  // Determine recurrence based on average gap
  if (avgGap >= 6 && avgGap <= 8) return 'weekly';
  if (avgGap >= 13 && avgGap <= 15) return 'fortnightly';
  if (avgGap >= 28 && avgGap <= 35) return 'monthly';
  if (avgGap >= 85 && avgGap <= 95) return 'quarterly';
  if (avgGap >= 350 && avgGap <= 380) return 'yearly';

  return 'irregular';
}

/**
 * Check if transaction amounts are consistent
 * Returns true if most transactions are within 10% of average
 */
export function checkAmountConsistency(transactions: Transaction[]): boolean {
  if (transactions.length === 0) return false;
  if (transactions.length === 1) return true;

  // Calculate average amount
  const avgAmount = transactions.reduce((sum, t) => sum + Math.abs(t.amount_cents), 0) / transactions.length;

  // Check how many transactions are within 10% of average
  const withinRange = transactions.filter(t => {
    const diff = Math.abs(Math.abs(t.amount_cents) - avgAmount);
    const diffPercent = diff / avgAmount;
    return diffPercent <= 0.1;
  }).length;

  // At least 70% should be consistent
  return (withinRange / transactions.length) >= 0.7;
}

/**
 * Check if transaction timing is consistent
 * Returns true if transactions occur at regular intervals
 */
export function checkTimingConsistency(transactions: Transaction[]): boolean {
  if (transactions.length < 3) return false;

  // Calculate gaps between transactions
  const gaps: number[] = [];
  for (let i = 1; i < transactions.length; i++) {
    const prevDate = new Date(transactions[i - 1].created_at);
    const currDate = new Date(transactions[i].created_at);
    const diffDays = Math.round((currDate.getTime() - prevDate.getTime()) / (1000 * 60 * 60 * 24));
    gaps.push(diffDays);
  }

  // Calculate coefficient of variation
  const avgGap = gaps.reduce((sum, gap) => sum + gap, 0) / gaps.length;
  const variance = gaps.reduce((sum, gap) => sum + Math.pow(gap - avgGap, 2), 0) / gaps.length;
  const stdDev = Math.sqrt(variance);
  const cv = stdDev / avgGap;

  // CV < 0.25 means fairly consistent timing
  return cv < 0.25;
}

/**
 * Predict next transaction date based on recurrence pattern
 * Uses last transaction date and detected frequency
 */
export function predictNextDate(lastTransactionDate: string, recurrence: string): string {
  const lastDate = new Date(lastTransactionDate);
  let nextDate = new Date(lastDate);

  switch (recurrence) {
    case 'weekly':
      nextDate.setDate(nextDate.getDate() + 7);
      break;
    case 'fortnightly':
      nextDate.setDate(nextDate.getDate() + 14);
      break;
    case 'monthly':
      nextDate.setMonth(nextDate.getMonth() + 1);
      break;
    case 'quarterly':
      nextDate.setMonth(nextDate.getMonth() + 3);
      break;
    case 'yearly':
      nextDate.setFullYear(nextDate.getFullYear() + 1);
      break;
    case 'irregular':
    case 'one-time':
    default:
      // For irregular/one-time, predict 30 days from last
      nextDate.setDate(nextDate.getDate() + 30);
      break;
  }

  return nextDate.toISOString();
}
