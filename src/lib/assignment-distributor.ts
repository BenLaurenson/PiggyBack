/**
 * Assignment Distribution Utility
 * Distributes methodology category assignments across underlying UP Bank categories
 */

export type DistributionStrategy = 'equal' | 'proportional' | 'manual';

export interface CategoryDistribution {
  categoryName: string;
  amount: number;
  percentage: number;
}

/**
 * Distribute a methodology assignment across underlying categories
 */
export function distributeMethodologyAssignment(
  totalAmount: number,
  underlyingCategories: string[],
  historicalSpending: Map<string, number>,
  strategy: DistributionStrategy,
  manualAmounts?: Map<string, number>
): CategoryDistribution[] {

  if (strategy === 'equal') {
    // Equal split across all categories
    const perCategory = Math.floor(totalAmount / underlyingCategories.length);
    const remainder = totalAmount - (perCategory * underlyingCategories.length);

    return underlyingCategories.map((catName, index) => ({
      categoryName: catName,
      amount: perCategory + (index === 0 ? remainder : 0), // Give remainder to first category
      percentage: 100 / underlyingCategories.length,
    }));
  }

  if (strategy === 'proportional') {
    // Distribute based on historical spending patterns
    const totalHistoricalSpending = underlyingCategories.reduce((sum, cat) => {
      return sum + (historicalSpending.get(cat) || 0);
    }, 0);

    if (totalHistoricalSpending === 0) {
      // Fallback to equal if no historical data
      return distributeMethodologyAssignment(
        totalAmount,
        underlyingCategories,
        historicalSpending,
        'equal'
      );
    }

    let distributedSoFar = 0;
    const distribution = underlyingCategories.map((catName, index) => {
      const categorySpending = historicalSpending.get(catName) || 0;
      const proportion = categorySpending / totalHistoricalSpending;
      const percentage = proportion * 100;

      // For last category, give remainder to avoid rounding errors
      if (index === underlyingCategories.length - 1) {
        return {
          categoryName: catName,
          amount: totalAmount - distributedSoFar,
          percentage,
        };
      }

      const amount = Math.floor(totalAmount * proportion);
      distributedSoFar += amount;

      return {
        categoryName: catName,
        amount,
        percentage,
      };
    });

    return distribution;
  }

  if (strategy === 'manual' && manualAmounts) {
    // User has manually specified amounts
    return underlyingCategories.map(catName => {
      const amount = manualAmounts.get(catName) || 0;
      const percentage = totalAmount > 0 ? (amount / totalAmount) * 100 : 0;

      return {
        categoryName: catName,
        amount,
        percentage,
      };
    });
  }

  // Fallback to equal
  return distributeMethodologyAssignment(
    totalAmount,
    underlyingCategories,
    historicalSpending,
    'equal'
  );
}

/**
 * Validate that manual distribution adds up to total
 */
export function validateDistribution(
  distribution: CategoryDistribution[],
  expectedTotal: number
): { valid: boolean; actualTotal: number; difference: number } {
  const actualTotal = distribution.reduce((sum, d) => sum + d.amount, 0);
  const difference = actualTotal - expectedTotal;

  return {
    valid: difference === 0,
    actualTotal,
    difference,
  };
}

/**
 * Calculate historical spending for last N months
 */
export async function getHistoricalSpending(
  categoryNames: string[],
  partnershipId: string,
  months: number = 3
): Promise<Map<string, number>> {
  try {
    const response = await fetch(
      `/api/budget/historical-spending?partnership_id=${partnershipId}&months=${months}&categories=${categoryNames.join(',')}`
    );
    const data = await response.json();

    const spending = new Map<string, number>();
    data.spending?.forEach((item: { category: string; amount: number }) => {
      spending.set(item.category, item.amount);
    });

    return spending;
  } catch (error) {
    console.error("Failed to fetch historical spending:", error);
    return new Map();
  }
}
