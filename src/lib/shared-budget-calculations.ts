/**
 * Shared Budget Calculations
 *
 * This module provides calculation logic for the shared expense system.
 *
 * Key Concepts:
 * - "My Budget" shows: Personal expenses (100%) + Shared expenses (user's percentage)
 * - "Our Budget" shows: Only shared expenses at full amount (100%)
 *
 * Priority Order:
 * 1. Transaction-level override (if exists) takes precedence
 * 2. Category-level default (if exists)
 * 3. Personal (not shared) if no configuration exists
 */

export interface CategoryShareConfig {
  categoryName: string;
  isShared: boolean;
  sharePercentage: number; // 0-100, user's share
}

export interface TransactionOverride {
  transactionId: string;
  isShared: boolean;
  sharePercentage: number; // 0-100, user's share
}

export interface ShareConfig {
  categoryShares: Map<string, CategoryShareConfig>;
  transactionOverrides: Map<string, TransactionOverride>;
}

export interface Transaction {
  id: string;
  amount_cents: number;
  category_id?: string;
  category_name?: string;
}

/**
 * Calculate the amount a user is responsible for in "My Budget" view
 *
 * Rules:
 * - If transaction has an override: use override percentage
 * - If category is shared: use category percentage
 * - Otherwise: full amount (personal expense)
 */
export function calculateMyBudgetAmount(
  transaction: Transaction,
  config: ShareConfig
): number {
  // Check for transaction-specific override first (highest priority)
  const txnOverride = config.transactionOverrides.get(transaction.id);
  if (txnOverride) {
    if (!txnOverride.isShared) {
      // Marked as personal - user pays full amount
      return transaction.amount_cents;
    }
    // Shared with specific percentage
    return Math.round(transaction.amount_cents * (txnOverride.sharePercentage / 100));
  }

  // Fall back to category default
  const categoryName = transaction.category_name || '';
  const categoryShare = config.categoryShares.get(categoryName);
  if (categoryShare?.isShared) {
    return Math.round(transaction.amount_cents * (categoryShare.sharePercentage / 100));
  }

  // Not shared - user pays full amount (personal expense)
  return transaction.amount_cents;
}

/**
 * Calculate the amount shown in "Our Budget" view
 *
 * Rules:
 * - If transaction/category is shared: show full amount (100%)
 * - If personal: show 0 (doesn't appear in shared view)
 */
export function calculateOurBudgetAmount(
  transaction: Transaction,
  config: ShareConfig
): number {
  // Check for transaction-specific override first
  const txnOverride = config.transactionOverrides.get(transaction.id);
  if (txnOverride !== undefined) {
    // If specifically marked as not shared, it's personal
    return txnOverride.isShared ? transaction.amount_cents : 0;
  }

  // Fall back to category default
  const categoryName = transaction.category_name || '';
  const categoryShare = config.categoryShares.get(categoryName);
  if (categoryShare !== undefined) {
    return categoryShare.isShared ? transaction.amount_cents : 0;
  }

  // No configuration - personal by default (doesn't appear in Our Budget)
  return 0;
}

/**
 * Determine if a transaction should appear in "Our Budget" view
 */
export function isTransactionShared(
  transaction: Transaction,
  config: ShareConfig
): boolean {
  // Check transaction override
  const txnOverride = config.transactionOverrides.get(transaction.id);
  if (txnOverride !== undefined) {
    return txnOverride.isShared;
  }

  // Check category default
  const categoryName = transaction.category_name || '';
  const categoryShare = config.categoryShares.get(categoryName);
  if (categoryShare !== undefined) {
    return categoryShare.isShared;
  }

  // Default: not shared (personal)
  return false;
}

/**
 * Get the user's share percentage for a transaction
 * Returns 100 if personal (user pays full amount)
 */
export function getTransactionSharePercentage(
  transaction: Transaction,
  config: ShareConfig
): number {
  const txnOverride = config.transactionOverrides.get(transaction.id);
  if (txnOverride) {
    return txnOverride.isShared ? txnOverride.sharePercentage : 100;
  }

  const categoryName = transaction.category_name || '';
  const categoryShare = config.categoryShares.get(categoryName);
  if (categoryShare?.isShared) {
    return categoryShare.sharePercentage;
  }

  return 100; // Personal - 100%
}

/**
 * Calculate spending totals for a category in "My Budget" view
 */
export function calculateCategoryMyBudgetSpending(
  transactions: Transaction[],
  categoryName: string,
  config: ShareConfig
): number {
  const categoryTransactions = transactions.filter(
    t => t.category_name === categoryName
  );

  return categoryTransactions.reduce(
    (sum, txn) => sum + Math.abs(calculateMyBudgetAmount(txn, config)),
    0
  );
}

/**
 * Calculate spending totals for a category in "Our Budget" view
 */
export function calculateCategoryOurBudgetSpending(
  transactions: Transaction[],
  categoryName: string,
  config: ShareConfig
): number {
  const categoryTransactions = transactions.filter(
    t => t.category_name === categoryName
  );

  return categoryTransactions.reduce(
    (sum, txn) => sum + Math.abs(calculateOurBudgetAmount(txn, config)),
    0
  );
}

/**
 * Calculate income-proportional split percentages
 *
 * @param userIncome User's income in cents
 * @param partnerIncome Partner's income in cents
 * @returns User's percentage (0-100)
 */
export function calculateIncomeProportionalSplit(
  userIncome: number,
  partnerIncome: number
): number {
  const totalIncome = userIncome + partnerIncome;
  if (totalIncome === 0) return 50; // Default to 50/50 if no income

  // User's share is proportional to their income
  return Math.round((userIncome / totalIncome) * 100);
}

/**
 * Build ShareConfig from raw database data
 */
export function buildShareConfig(
  categoryShares: Array<{
    category_name: string;
    is_shared: boolean;
    share_percentage: number;
  }>,
  transactionOverrides: Array<{
    transaction_id: string;
    is_shared: boolean;
    share_percentage: number;
  }>
): ShareConfig {
  const categorySharesMap = new Map<string, CategoryShareConfig>();
  categoryShares.forEach(cs => {
    categorySharesMap.set(cs.category_name, {
      categoryName: cs.category_name,
      isShared: cs.is_shared,
      sharePercentage: cs.share_percentage,
    });
  });

  const transactionOverridesMap = new Map<string, TransactionOverride>();
  transactionOverrides.forEach(to => {
    transactionOverridesMap.set(to.transaction_id, {
      transactionId: to.transaction_id,
      isShared: to.is_shared,
      sharePercentage: to.share_percentage,
    });
  });

  return {
    categoryShares: categorySharesMap,
    transactionOverrides: transactionOverridesMap,
  };
}

/**
 * Calculate summary statistics for shared vs personal spending
 */
export function calculateShareSummary(
  transactions: Transaction[],
  config: ShareConfig
): {
  totalShared: number;
  totalPersonal: number;
  userShareOfShared: number;
  partnerShareOfShared: number;
} {
  let totalShared = 0;
  let totalPersonal = 0;
  let userShareOfShared = 0;

  transactions.forEach(txn => {
    const amount = Math.abs(txn.amount_cents);
    if (isTransactionShared(txn, config)) {
      totalShared += amount;
      userShareOfShared += Math.abs(calculateMyBudgetAmount(txn, config));
    } else {
      totalPersonal += amount;
    }
  });

  return {
    totalShared,
    totalPersonal,
    userShareOfShared,
    partnerShareOfShared: totalShared - userShareOfShared,
  };
}
