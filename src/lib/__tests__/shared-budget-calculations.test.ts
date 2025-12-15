import { describe, it, expect } from 'vitest';
import {
  calculateMyBudgetAmount,
  calculateOurBudgetAmount,
  isTransactionShared,
  getTransactionSharePercentage,
  calculateCategoryMyBudgetSpending,
  calculateCategoryOurBudgetSpending,
  calculateIncomeProportionalSplit,
  buildShareConfig,
  calculateShareSummary,
} from '../shared-budget-calculations';
import type { ShareConfig, Transaction } from '../shared-budget-calculations';

// Helper to build a ShareConfig for tests
function makeConfig(
  categories: Array<{ name: string; isShared: boolean; pct: number }> = [],
  overrides: Array<{ txnId: string; isShared: boolean; pct: number }> = []
): ShareConfig {
  return buildShareConfig(
    categories.map(c => ({ category_name: c.name, is_shared: c.isShared, share_percentage: c.pct })),
    overrides.map(o => ({ transaction_id: o.txnId, is_shared: o.isShared, share_percentage: o.pct }))
  );
}

const makeTxn = (id: string, amountCents: number, categoryName?: string): Transaction => ({
  id,
  amount_cents: amountCents,
  category_name: categoryName,
});

describe('shared-budget-calculations', () => {
  // =====================================================
  // MY BUDGET AMOUNT
  // =====================================================
  describe('calculateMyBudgetAmount', () => {
    it('should return full amount when no config exists (personal)', () => {
      const txn = makeTxn('t1', -5000, 'Groceries');
      const config = makeConfig();
      expect(calculateMyBudgetAmount(txn, config)).toBe(-5000);
    });

    it('should apply category share percentage', () => {
      const txn = makeTxn('t1', -10000, 'Groceries');
      const config = makeConfig([{ name: 'Groceries', isShared: true, pct: 60 }]);
      expect(calculateMyBudgetAmount(txn, config)).toBe(-6000);
    });

    it('should return full amount for personal categories', () => {
      const txn = makeTxn('t1', -5000, 'Gaming');
      const config = makeConfig([{ name: 'Gaming', isShared: false, pct: 100 }]);
      expect(calculateMyBudgetAmount(txn, config)).toBe(-5000);
    });

    it('should prioritize transaction override over category config', () => {
      const txn = makeTxn('t1', -10000, 'Groceries');
      const config = makeConfig(
        [{ name: 'Groceries', isShared: true, pct: 50 }],
        [{ txnId: 't1', isShared: true, pct: 30 }]
      );
      // Override says 30%, not category's 50%
      expect(calculateMyBudgetAmount(txn, config)).toBe(-3000);
    });

    it('should return full amount when override marks as personal', () => {
      const txn = makeTxn('t1', -10000, 'Groceries');
      const config = makeConfig(
        [{ name: 'Groceries', isShared: true, pct: 50 }],
        [{ txnId: 't1', isShared: false, pct: 100 }]
      );
      expect(calculateMyBudgetAmount(txn, config)).toBe(-10000);
    });

    it('should handle 50/50 split', () => {
      const txn = makeTxn('t1', -10000, 'Groceries');
      const config = makeConfig([{ name: 'Groceries', isShared: true, pct: 50 }]);
      expect(calculateMyBudgetAmount(txn, config)).toBe(-5000);
    });

    it('should round correctly for odd splits', () => {
      const txn = makeTxn('t1', -10001, 'Groceries');
      const config = makeConfig([{ name: 'Groceries', isShared: true, pct: 33 }]);
      // 10001 * 33/100 = 3300.33 → rounds to -3300
      expect(calculateMyBudgetAmount(txn, config)).toBe(-3300);
    });
  });

  // =====================================================
  // OUR BUDGET AMOUNT
  // =====================================================
  describe('calculateOurBudgetAmount', () => {
    it('should return 0 for personal transactions (no config)', () => {
      const txn = makeTxn('t1', -5000, 'Gaming');
      const config = makeConfig();
      expect(calculateOurBudgetAmount(txn, config)).toBe(0);
    });

    it('should return full amount for shared transactions', () => {
      const txn = makeTxn('t1', -10000, 'Groceries');
      const config = makeConfig([{ name: 'Groceries', isShared: true, pct: 60 }]);
      expect(calculateOurBudgetAmount(txn, config)).toBe(-10000);
    });

    it('should return 0 for category marked not shared', () => {
      const txn = makeTxn('t1', -5000, 'Gaming');
      const config = makeConfig([{ name: 'Gaming', isShared: false, pct: 100 }]);
      expect(calculateOurBudgetAmount(txn, config)).toBe(0);
    });

    it('should prioritize transaction override', () => {
      const txn = makeTxn('t1', -10000, 'Groceries');
      const config = makeConfig(
        [{ name: 'Groceries', isShared: true, pct: 50 }],
        [{ txnId: 't1', isShared: false, pct: 100 }]
      );
      // Override says personal → 0 in Our Budget
      expect(calculateOurBudgetAmount(txn, config)).toBe(0);
    });

    it('should show full amount when override marks shared', () => {
      const txn = makeTxn('t1', -10000, 'Gaming');
      const config = makeConfig(
        [{ name: 'Gaming', isShared: false, pct: 100 }],
        [{ txnId: 't1', isShared: true, pct: 50 }]
      );
      expect(calculateOurBudgetAmount(txn, config)).toBe(-10000);
    });
  });

  // =====================================================
  // IS TRANSACTION SHARED
  // =====================================================
  describe('isTransactionShared', () => {
    it('should return false by default (no config)', () => {
      const txn = makeTxn('t1', -5000, 'Groceries');
      expect(isTransactionShared(txn, makeConfig())).toBe(false);
    });

    it('should return true for shared category', () => {
      const txn = makeTxn('t1', -5000, 'Groceries');
      const config = makeConfig([{ name: 'Groceries', isShared: true, pct: 50 }]);
      expect(isTransactionShared(txn, config)).toBe(true);
    });

    it('should return false for non-shared category', () => {
      const txn = makeTxn('t1', -5000, 'Gaming');
      const config = makeConfig([{ name: 'Gaming', isShared: false, pct: 100 }]);
      expect(isTransactionShared(txn, config)).toBe(false);
    });

    it('should prioritize transaction override', () => {
      const txn = makeTxn('t1', -5000, 'Groceries');
      const config = makeConfig(
        [{ name: 'Groceries', isShared: true, pct: 50 }],
        [{ txnId: 't1', isShared: false, pct: 100 }]
      );
      expect(isTransactionShared(txn, config)).toBe(false);
    });
  });

  // =====================================================
  // SHARE PERCENTAGE
  // =====================================================
  describe('getTransactionSharePercentage', () => {
    it('should return 100 for personal (no config)', () => {
      const txn = makeTxn('t1', -5000, 'Groceries');
      expect(getTransactionSharePercentage(txn, makeConfig())).toBe(100);
    });

    it('should return category percentage for shared', () => {
      const txn = makeTxn('t1', -5000, 'Groceries');
      const config = makeConfig([{ name: 'Groceries', isShared: true, pct: 60 }]);
      expect(getTransactionSharePercentage(txn, config)).toBe(60);
    });

    it('should return 100 for non-shared category', () => {
      const txn = makeTxn('t1', -5000, 'Gaming');
      const config = makeConfig([{ name: 'Gaming', isShared: false, pct: 100 }]);
      expect(getTransactionSharePercentage(txn, config)).toBe(100);
    });

    it('should use override percentage when present', () => {
      const txn = makeTxn('t1', -5000, 'Groceries');
      const config = makeConfig(
        [{ name: 'Groceries', isShared: true, pct: 50 }],
        [{ txnId: 't1', isShared: true, pct: 75 }]
      );
      expect(getTransactionSharePercentage(txn, config)).toBe(75);
    });
  });

  // =====================================================
  // CATEGORY SPENDING
  // =====================================================
  describe('calculateCategoryMyBudgetSpending', () => {
    it('should sum absolute amounts for matching category', () => {
      const txns: Transaction[] = [
        makeTxn('t1', -3000, 'Groceries'),
        makeTxn('t2', -7000, 'Groceries'),
        makeTxn('t3', -5000, 'Transport'), // different category
      ];
      const config = makeConfig();
      expect(calculateCategoryMyBudgetSpending(txns, 'Groceries', config)).toBe(10000);
    });

    it('should apply share percentage', () => {
      const txns: Transaction[] = [
        makeTxn('t1', -10000, 'Groceries'),
      ];
      const config = makeConfig([{ name: 'Groceries', isShared: true, pct: 50 }]);
      expect(calculateCategoryMyBudgetSpending(txns, 'Groceries', config)).toBe(5000);
    });

    it('should return 0 for empty category', () => {
      expect(calculateCategoryMyBudgetSpending([], 'Groceries', makeConfig())).toBe(0);
    });
  });

  describe('calculateCategoryOurBudgetSpending', () => {
    it('should return 0 for personal category', () => {
      const txns: Transaction[] = [makeTxn('t1', -10000, 'Gaming')];
      expect(calculateCategoryOurBudgetSpending(txns, 'Gaming', makeConfig())).toBe(0);
    });

    it('should return full amount for shared category', () => {
      const txns: Transaction[] = [
        makeTxn('t1', -3000, 'Groceries'),
        makeTxn('t2', -7000, 'Groceries'),
      ];
      const config = makeConfig([{ name: 'Groceries', isShared: true, pct: 50 }]);
      expect(calculateCategoryOurBudgetSpending(txns, 'Groceries', config)).toBe(10000);
    });
  });

  // =====================================================
  // INCOME PROPORTIONAL SPLIT
  // =====================================================
  describe('calculateIncomeProportionalSplit', () => {
    it('should return 50 when both incomes are zero', () => {
      expect(calculateIncomeProportionalSplit(0, 0)).toBe(50);
    });

    it('should return 50 for equal incomes', () => {
      expect(calculateIncomeProportionalSplit(500000, 500000)).toBe(50);
    });

    it('should return 100 when partner has no income', () => {
      expect(calculateIncomeProportionalSplit(500000, 0)).toBe(100);
    });

    it('should return 0 when user has no income', () => {
      expect(calculateIncomeProportionalSplit(0, 500000)).toBe(0);
    });

    it('should calculate proportional split', () => {
      // User earns $6k, partner earns $4k → user = 60%
      expect(calculateIncomeProportionalSplit(600000, 400000)).toBe(60);
    });

    it('should round to nearest integer', () => {
      // 1/3 ≈ 33.33% → rounds to 33
      expect(calculateIncomeProportionalSplit(100000, 200000)).toBe(33);
    });
  });

  // =====================================================
  // BUILD SHARE CONFIG
  // =====================================================
  describe('buildShareConfig', () => {
    it('should build config from raw database data', () => {
      const config = buildShareConfig(
        [{ category_name: 'Groceries', is_shared: true, share_percentage: 60 }],
        [{ transaction_id: 't1', is_shared: false, share_percentage: 100 }]
      );

      expect(config.categoryShares.get('Groceries')).toEqual({
        categoryName: 'Groceries',
        isShared: true,
        sharePercentage: 60,
      });
      expect(config.transactionOverrides.get('t1')).toEqual({
        transactionId: 't1',
        isShared: false,
        sharePercentage: 100,
      });
    });

    it('should handle empty arrays', () => {
      const config = buildShareConfig([], []);
      expect(config.categoryShares.size).toBe(0);
      expect(config.transactionOverrides.size).toBe(0);
    });

    it('should handle multiple categories', () => {
      const config = buildShareConfig(
        [
          { category_name: 'Groceries', is_shared: true, share_percentage: 50 },
          { category_name: 'Gaming', is_shared: false, share_percentage: 100 },
        ],
        []
      );
      expect(config.categoryShares.size).toBe(2);
    });
  });

  // =====================================================
  // SHARE SUMMARY
  // =====================================================
  describe('calculateShareSummary', () => {
    it('should calculate shared vs personal totals', () => {
      const txns: Transaction[] = [
        makeTxn('t1', -10000, 'Groceries'), // shared
        makeTxn('t2', -5000, 'Gaming'),     // personal
      ];
      const config = makeConfig([
        { name: 'Groceries', isShared: true, pct: 60 },
        { name: 'Gaming', isShared: false, pct: 100 },
      ]);

      const summary = calculateShareSummary(txns, config);
      expect(summary.totalShared).toBe(10000);
      expect(summary.totalPersonal).toBe(5000);
      expect(summary.userShareOfShared).toBe(6000); // 60% of 10000
      expect(summary.partnerShareOfShared).toBe(4000); // 40% of 10000
    });

    it('should handle all personal transactions', () => {
      const txns: Transaction[] = [
        makeTxn('t1', -5000, 'Gaming'),
        makeTxn('t2', -3000, 'Hobbies'),
      ];
      const config = makeConfig();

      const summary = calculateShareSummary(txns, config);
      expect(summary.totalShared).toBe(0);
      expect(summary.totalPersonal).toBe(8000);
      expect(summary.userShareOfShared).toBe(0);
      expect(summary.partnerShareOfShared).toBe(0);
    });

    it('should handle empty transactions', () => {
      const summary = calculateShareSummary([], makeConfig());
      expect(summary.totalShared).toBe(0);
      expect(summary.totalPersonal).toBe(0);
    });
  });
});
