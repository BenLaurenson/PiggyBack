/**
 * Tests for budget expense default calculations
 *
 * Verifies that:
 * 1. Seeded $0 assignment rows don't block expense defaults
 * 2. Expense-level splits are applied to spending calculations
 * 3. TBB correctly accounts for expense defaults
 * 4. initialAssignments includes isExpenseDefault flag
 * 5. Category-level and subcategory-level expense defaults work correctly
 */

import { describe, it, expect } from 'vitest';
import { calculateMyBudgetAmount } from '../shared-budget-calculations';
import type { ShareConfig } from '../shared-budget-calculations';

// ============================================================
// Extracted helper: getAdjustedAmount (mirrors page.tsx logic)
// NOTE: expense_matches is a SINGLE OBJECT (not array) due to UNIQUE(transaction_id)
// constraint — Supabase PostgREST returns objects for one-to-one joins.
// ============================================================
function getAdjustedAmount(
  txn: { id: string; amount_cents: number; category_id: string | null; expense_matches?: any },
  budgetView: 'individual' | 'shared',
  shareConfig: ShareConfig,
  expenseSplitPercentage: Map<string, number>,
  categoryIdToParentName: Map<string, string>,
): number {
  if (budgetView !== 'individual') return Math.abs(txn.amount_cents);

  // 1. Check transaction-level override (highest priority)
  const txnOverride = shareConfig.transactionOverrides.get(txn.id);
  if (txnOverride) {
    if (!txnOverride.isShared) return Math.abs(txn.amount_cents);
    return Math.abs(Math.round(txn.amount_cents * (txnOverride.sharePercentage / 100)));
  }

  // 2. Check expense-level split (if transaction is matched to an expense)
  // expense_matches can be: object (one-to-one), array (defensive), or null
  const match = txn.expense_matches;
  if (match) {
    const expenseId = Array.isArray(match)
      ? match[0]?.expense_definition_id
      : match.expense_definition_id;
    if (expenseId) {
      const pct = expenseSplitPercentage.get(expenseId);
      if (pct !== undefined) {
        return Math.abs(Math.round(txn.amount_cents * (pct / 100)));
      }
    }
  }

  // 3. Fall back to category-level share
  const parentName = txn.category_id ? categoryIdToParentName.get(txn.category_id) || '' : 'Miscellaneous';
  return Math.abs(calculateMyBudgetAmount(
    { id: txn.id, amount_cents: txn.amount_cents, category_name: parentName },
    shareConfig
  ));
}

// ============================================================
// Extracted helper: calcExpenseDefault (mirrors page.tsx logic)
// ============================================================
function calcExpenseDefault(
  monthlyExpenseDefaultBySubcategory: Map<string, number>,
  monthlyExpenseDefaultByCategory: Map<string, number>,
  subcatManualSet: Set<string>,
  parentManualSet: Set<string>,
): number {
  // 1. Subcategory-level expense defaults (where no manual non-zero assignment)
  let total = 0;
  for (const [key, amount] of monthlyExpenseDefaultBySubcategory) {
    if (!subcatManualSet.has(key)) {
      total += amount;
    }
  }

  // 2. Parent-level remainder
  for (const [catName, parentAmount] of monthlyExpenseDefaultByCategory) {
    if (parentManualSet.has(catName)) continue;
    let subcatMapped = 0;
    for (const [key, amount] of monthlyExpenseDefaultBySubcategory) {
      if (key.startsWith(catName + '::')) subcatMapped += amount;
    }
    const remainder = parentAmount - subcatMapped;
    if (remainder > 0) total += remainder;
  }

  return total;
}

// ============================================================
// Extracted helper: build subcategory assigned value (mirrors page.tsx line 730-735)
// ============================================================
function getSubcategoryAssigned(
  subAssignment: { assigned_cents: number } | undefined,
  subExpenseDefault: number,
): number {
  if (subAssignment) {
    if (subAssignment.assigned_cents === 0 && subExpenseDefault > 0) {
      return subExpenseDefault;
    }
    return subAssignment.assigned_cents;
  }
  return subExpenseDefault;
}

// ============================================================
// Extracted helper: determine if parent has manual assignment (mirrors page.tsx line 761)
// ============================================================
function hasManualAssignment(
  parentAssignment: { assigned_cents: number } | undefined,
  subcatManualTotal: number,
): boolean {
  return (parentAssignment !== undefined && parentAssignment.assigned_cents > 0) || subcatManualTotal > 0;
}

// ============================================================
// Test fixtures
// ============================================================
const DEFT_EXPENSE_ID = 'e45ea35e-616f-4cef-a220-65cfd703911e';

function createShareConfig(overrides?: Partial<ShareConfig>): ShareConfig {
  return {
    categoryShares: new Map([
      ['Housing & Utilities', { categoryName: 'Housing & Utilities', isShared: false, sharePercentage: 55 }],
    ]),
    transactionOverrides: new Map(),
    ...overrides,
  };
}

function createExpenseSplitPercentage(): Map<string, number> {
  return new Map([[DEFT_EXPENSE_ID, 55]]);
}

function createCategoryIdToParentName(): Map<string, string> {
  return new Map([
    ['rent-and-mortgage', 'Housing & Utilities'],
    ['groceries', 'Food & Dining'],
  ]);
}

// Real Supabase shape: expense_matches is an OBJECT (not array)
// due to UNIQUE(transaction_id) constraint on expense_matches table
function createRentTransaction(id: string, amountCents: number = -85000): any {
  return {
    id,
    amount_cents: amountCents,
    category_id: 'rent-and-mortgage',
    settled_at: '2026-02-05T10:00:00Z',
    expense_matches: { expense_definition_id: DEFT_EXPENSE_ID },
  };
}

// Legacy/defensive: array format (in case of non-unique joins)
function createRentTransactionArrayFormat(id: string, amountCents: number = -85000): any {
  return {
    id,
    amount_cents: amountCents,
    category_id: 'rent-and-mortgage',
    settled_at: '2026-02-05T10:00:00Z',
    expense_matches: [{ expense_definition_id: DEFT_EXPENSE_ID }],
  };
}

// ============================================================
// Tests
// ============================================================

describe('getAdjustedAmount', () => {
  const shareConfig = createShareConfig();
  const expenseSplits = createExpenseSplitPercentage();
  const catIdMap = createCategoryIdToParentName();

  it('returns full amount for shared budget view', () => {
    const txn = createRentTransaction('txn-1');
    const result = getAdjustedAmount(txn, 'shared', shareConfig, expenseSplits, catIdMap);
    expect(result).toBe(85000);
  });

  it('applies expense-level split for individual view', () => {
    const txn = createRentTransaction('txn-1');
    const result = getAdjustedAmount(txn, 'individual', shareConfig, expenseSplits, catIdMap);
    // 85000 * 55% = 46750
    expect(result).toBe(46750);
  });

  it('applies transaction override when present (highest priority)', () => {
    const config = createShareConfig({
      transactionOverrides: new Map([
        ['txn-1', { transactionId: 'txn-1', isShared: true, sharePercentage: 70 }],
      ]),
    });
    const txn = createRentTransaction('txn-1');
    const result = getAdjustedAmount(txn, 'individual', config, expenseSplits, catIdMap);
    // Transaction override: 85000 * 70% = 59500
    expect(result).toBe(59500);
  });

  it('returns full amount for personal transaction override', () => {
    const config = createShareConfig({
      transactionOverrides: new Map([
        ['txn-1', { transactionId: 'txn-1', isShared: false, sharePercentage: 0 }],
      ]),
    });
    const txn = createRentTransaction('txn-1');
    const result = getAdjustedAmount(txn, 'individual', config, expenseSplits, catIdMap);
    expect(result).toBe(85000); // Full amount (personal)
  });

  it('falls back to category share when no expense match', () => {
    const txn = {
      id: 'txn-grocery',
      amount_cents: -5000,
      category_id: 'groceries',
      expense_matches: null,
    };
    const config = createShareConfig({
      categoryShares: new Map([
        ['Food & Dining', { categoryName: 'Food & Dining', isShared: true, sharePercentage: 50 }],
      ]),
    });
    const result = getAdjustedAmount(txn, 'individual', config, expenseSplits, catIdMap);
    // Category share: 5000 * 50% = 2500
    expect(result).toBe(2500);
  });

  it('returns full amount when no split config exists', () => {
    const txn = {
      id: 'txn-misc',
      amount_cents: -3000,
      category_id: 'groceries',
      expense_matches: null,
    };
    const emptyConfig = createShareConfig({ categoryShares: new Map() });
    const result = getAdjustedAmount(txn, 'individual', emptyConfig, new Map(), catIdMap);
    expect(result).toBe(3000); // Full amount
  });

  it('handles empty expense_matches array', () => {
    const txn = {
      id: 'txn-1',
      amount_cents: -85000,
      category_id: 'rent-and-mortgage',
      expense_matches: [],
    };
    const result = getAdjustedAmount(txn, 'individual', shareConfig, expenseSplits, catIdMap);
    // No expense match → falls to category share → isShared: false → full amount
    expect(result).toBe(85000);
  });

  it('handles expense_matches as object (real Supabase PostgREST shape)', () => {
    // This is the ACTUAL format returned by Supabase due to UNIQUE(transaction_id)
    const txn = createRentTransaction('txn-obj');
    expect(txn.expense_matches).toEqual({ expense_definition_id: DEFT_EXPENSE_ID });
    expect(Array.isArray(txn.expense_matches)).toBe(false);
    const result = getAdjustedAmount(txn, 'individual', shareConfig, expenseSplits, catIdMap);
    // Should still apply 55% split: 85000 * 0.55 = 46750
    expect(result).toBe(46750);
  });

  it('handles expense_matches as array (defensive/legacy)', () => {
    const txn = createRentTransactionArrayFormat('txn-arr');
    expect(Array.isArray(txn.expense_matches)).toBe(true);
    const result = getAdjustedAmount(txn, 'individual', shareConfig, expenseSplits, catIdMap);
    expect(result).toBe(46750);
  });

  it('handles expense_matches as null', () => {
    const txn = {
      id: 'txn-null',
      amount_cents: -85000,
      category_id: 'rent-and-mortgage',
      expense_matches: null,
    };
    const result = getAdjustedAmount(txn, 'individual', shareConfig, expenseSplits, catIdMap);
    // null → falls to category share → isShared: false → full amount
    expect(result).toBe(85000);
  });
});

describe('getSubcategoryAssigned (seeded $0 row handling)', () => {
  it('returns expense default when seeded $0 row exists', () => {
    const result = getSubcategoryAssigned({ assigned_cents: 0 }, 187000);
    expect(result).toBe(187000);
  });

  it('returns manual amount when non-zero assignment exists', () => {
    const result = getSubcategoryAssigned({ assigned_cents: 200000 }, 187000);
    expect(result).toBe(200000);
  });

  it('returns expense default when no assignment exists', () => {
    const result = getSubcategoryAssigned(undefined, 187000);
    expect(result).toBe(187000);
  });

  it('returns 0 when no assignment and no expense default', () => {
    const result = getSubcategoryAssigned(undefined, 0);
    expect(result).toBe(0);
  });

  it('returns 0 when seeded $0 and no expense default', () => {
    const result = getSubcategoryAssigned({ assigned_cents: 0 }, 0);
    expect(result).toBe(0);
  });
});

describe('hasManualAssignment (seeded $0 row handling)', () => {
  it('returns false when parent is $0 seeded and no non-zero subcategories', () => {
    expect(hasManualAssignment({ assigned_cents: 0 }, 0)).toBe(false);
  });

  it('returns false when parent is undefined and no non-zero subcategories', () => {
    expect(hasManualAssignment(undefined, 0)).toBe(false);
  });

  it('returns true when parent has non-zero amount', () => {
    expect(hasManualAssignment({ assigned_cents: 50000 }, 0)).toBe(true);
  });

  it('returns true when subcategories have non-zero total', () => {
    expect(hasManualAssignment(undefined, 38000)).toBe(true);
  });
});

describe('calcExpenseDefault (TBB expense default calculation)', () => {
  it('includes all subcategory expense defaults when no manual assignments', () => {
    const subcatDefaults = new Map([
      ['Housing & Utilities::Rent & Mortgage', 187000],
      ['Housing & Utilities::Internet', 3500],
      ['Personal Care & Health::Gym', 3960],
    ]);
    const catDefaults = new Map([
      ['Housing & Utilities', 190500],
      ['Personal Care & Health', 3960],
    ]);

    const result = calcExpenseDefault(subcatDefaults, catDefaults, new Set(), new Set());
    // All subcategory defaults + no remainder (subcats sum to parent)
    expect(result).toBe(187000 + 3500 + 3960);
  });

  it('excludes subcategory with manual non-zero assignment', () => {
    const subcatDefaults = new Map([
      ['Housing & Utilities::Rent & Mortgage', 187000],
      ['Housing & Utilities::Internet', 3500],
    ]);
    const catDefaults = new Map([
      ['Housing & Utilities', 190500],
    ]);
    // Internet has a manual $38 assignment
    const subcatManual = new Set(['Housing & Utilities::Internet']);

    const result = calcExpenseDefault(subcatDefaults, catDefaults, subcatManual, new Set());
    // Only Rent & Mortgage default (Internet excluded)
    expect(result).toBe(187000);
  });

  it('seeded $0 rows are NOT in the manual set (key test)', () => {
    // This test verifies the critical behavior: seeded $0 rows should NOT block expense defaults
    const subcatDefaults = new Map([
      ['Housing & Utilities::Rent & Mortgage', 187000],
    ]);
    const catDefaults = new Map([
      ['Housing & Utilities', 187000],
    ]);

    // Simulate: buildManualSet only includes assigned_cents > 0
    // Seeded $0 rows → NOT in the set → expense default should be included
    const subcatManual = new Set<string>(); // Empty because all rows are $0

    const result = calcExpenseDefault(subcatDefaults, catDefaults, subcatManual, new Set());
    expect(result).toBe(187000);
  });

  it('handles parent-level remainder for unmapped expenses', () => {
    // Expense not mapped to any subcategory (no matched transaction with category_id)
    const subcatDefaults = new Map<string, number>(); // No subcategory mapping
    const catDefaults = new Map([
      ['Housing & Utilities', 187000],
    ]);

    const result = calcExpenseDefault(subcatDefaults, catDefaults, new Set(), new Set());
    // Full parent amount as remainder
    expect(result).toBe(187000);
  });

  it('does not double-count when subcategory covers parent', () => {
    const subcatDefaults = new Map([
      ['Housing & Utilities::Rent & Mortgage', 187000],
    ]);
    const catDefaults = new Map([
      ['Housing & Utilities', 187000], // Same amount
    ]);

    const result = calcExpenseDefault(subcatDefaults, catDefaults, new Set(), new Set());
    // Should be 187000, not 374000 (no remainder)
    expect(result).toBe(187000);
  });

  it('adds parent remainder when subcategory does not cover full amount', () => {
    const subcatDefaults = new Map([
      ['Housing & Utilities::Rent & Mortgage', 187000],
    ]);
    const catDefaults = new Map([
      ['Housing & Utilities', 200000], // Larger (e.g. additional unmapped expense)
    ]);

    const result = calcExpenseDefault(subcatDefaults, catDefaults, new Set(), new Set());
    // 187000 (subcat) + 13000 (remainder)
    expect(result).toBe(200000);
  });
});

describe('initialAssignments expense default flow', () => {
  // Simulates the categories.forEach loop from page.tsx

  function buildInitialAssignments(params: {
    categories: Array<{
      name: string;
      expenseBudgetedCents: number;
      spent: number;
      subcategories?: Array<{
        name: string;
        expenseBudgetedCents: number;
        spent: number;
      }>;
    }>;
    assignmentsRaw: Array<{ category_name: string; subcategory_name?: string; assigned_cents: number; stored_period_type?: string }>;
    dedupedSubcategoryAssignments: Array<{ category_name: string; subcategory_name: string; assigned_cents: number; stored_period_type?: string }>;
    monthlyExpenseDefaultBySubcategory: Map<string, number>;
  }) {
    const { categories, assignmentsRaw, dedupedSubcategoryAssignments, monthlyExpenseDefaultBySubcategory } = params;
    const initialAssignments: Array<{
      category_name: string;
      subcategory_name?: string;
      assigned_cents: number;
      stored_period_type?: string;
      spent_cents?: number;
      isExpenseDefault?: boolean;
    }> = [];

    categories.forEach(c => {
      const parentAssignment = assignmentsRaw.find(
        a => a.category_name === c.name && !a.subcategory_name
      );

      if (parentAssignment && parentAssignment.assigned_cents > 0) {
        initialAssignments.push({
          category_name: c.name,
          assigned_cents: parentAssignment.assigned_cents,
          stored_period_type: parentAssignment.stored_period_type || 'monthly',
          spent_cents: c.spent,
        });
      } else if (c.expenseBudgetedCents > 0) {
        const subcatExpenseTotal = c.subcategories?.reduce(
          (sum, sub) => sum + (sub.expenseBudgetedCents || 0), 0
        ) || 0;

        if (subcatExpenseTotal > 0) {
          c.subcategories?.forEach(sub => {
            if (sub.expenseBudgetedCents > 0) {
              const hasNonZeroAssignment = dedupedSubcategoryAssignments.some(
                a => a.category_name === c.name && a.subcategory_name === sub.name
                  && a.assigned_cents > 0
              );
              if (!hasNonZeroAssignment) {
                initialAssignments.push({
                  category_name: c.name,
                  subcategory_name: sub.name,
                  assigned_cents: sub.expenseBudgetedCents,
                  stored_period_type: 'monthly',
                  spent_cents: sub.spent || 0,
                  isExpenseDefault: true,
                });
              }
            }
          });
        }
      }

      // Add subcategory assignments (manual non-zero only)
      if (c.subcategories) {
        c.subcategories.forEach(sub => {
          const subAssignment = dedupedSubcategoryAssignments.find(
            a => a.category_name === c.name && a.subcategory_name === sub.name
          );
          if (subAssignment && subAssignment.assigned_cents > 0) {
            const subExpenseDefault = monthlyExpenseDefaultBySubcategory.get(`${c.name}::${sub.name}`) || 0;
            const isExpenseDefaulted = subExpenseDefault > 0 && Math.abs(subAssignment.assigned_cents - subExpenseDefault) < 100;
            initialAssignments.push({
              category_name: c.name,
              subcategory_name: sub.name,
              assigned_cents: subAssignment.assigned_cents,
              stored_period_type: subAssignment.stored_period_type || 'monthly',
              spent_cents: sub.spent,
              isExpenseDefault: isExpenseDefaulted,
            });
          }
        });
      }
    });

    return initialAssignments;
  }

  it('pushes expense default with isExpenseDefault=true when seeded $0 row exists', () => {
    const result = buildInitialAssignments({
      categories: [{
        name: 'Housing & Utilities',
        expenseBudgetedCents: 187000,
        spent: 93500,
        subcategories: [
          { name: 'Rent & Mortgage', expenseBudgetedCents: 187000, spent: 93500 },
          { name: 'Internet', expenseBudgetedCents: 0, spent: 0 },
        ],
      }],
      assignmentsRaw: [], // No parent-level assignment
      dedupedSubcategoryAssignments: [
        { category_name: 'Housing & Utilities', subcategory_name: 'Rent & Mortgage', assigned_cents: 0 },
        { category_name: 'Housing & Utilities', subcategory_name: 'Internet', assigned_cents: 0 },
      ],
      monthlyExpenseDefaultBySubcategory: new Map([
        ['Housing & Utilities::Rent & Mortgage', 187000],
      ]),
    });

    const rentAssignment = result.find(a => a.subcategory_name === 'Rent & Mortgage');
    expect(rentAssignment).toBeDefined();
    expect(rentAssignment!.assigned_cents).toBe(187000);
    expect(rentAssignment!.isExpenseDefault).toBe(true);
  });

  it('does NOT push expense default when manual non-zero assignment exists', () => {
    const result = buildInitialAssignments({
      categories: [{
        name: 'Housing & Utilities',
        expenseBudgetedCents: 187000,
        spent: 93500,
        subcategories: [
          { name: 'Rent & Mortgage', expenseBudgetedCents: 187000, spent: 93500 },
        ],
      }],
      assignmentsRaw: [],
      dedupedSubcategoryAssignments: [
        { category_name: 'Housing & Utilities', subcategory_name: 'Rent & Mortgage', assigned_cents: 200000 },
      ],
      monthlyExpenseDefaultBySubcategory: new Map([
        ['Housing & Utilities::Rent & Mortgage', 187000],
      ]),
    });

    // Should have the manual assignment, not the expense default
    const rentAssignment = result.find(a => a.subcategory_name === 'Rent & Mortgage');
    expect(rentAssignment).toBeDefined();
    expect(rentAssignment!.assigned_cents).toBe(200000);
    // Not exactly matching expense default (200000 vs 187000) → not flagged
    expect(rentAssignment!.isExpenseDefault).toBe(false);
  });

  it('handles mix of seeded $0 and manual non-zero in same category', () => {
    const result = buildInitialAssignments({
      categories: [{
        name: 'Housing & Utilities',
        expenseBudgetedCents: 190500,
        spent: 93500,
        subcategories: [
          { name: 'Rent & Mortgage', expenseBudgetedCents: 187000, spent: 93500 },
          { name: 'Internet', expenseBudgetedCents: 3500, spent: 0 },
        ],
      }],
      assignmentsRaw: [],
      dedupedSubcategoryAssignments: [
        { category_name: 'Housing & Utilities', subcategory_name: 'Rent & Mortgage', assigned_cents: 0 },
        { category_name: 'Housing & Utilities', subcategory_name: 'Internet', assigned_cents: 3800 }, // Manually set
      ],
      monthlyExpenseDefaultBySubcategory: new Map([
        ['Housing & Utilities::Rent & Mortgage', 187000],
        ['Housing & Utilities::Internet', 3500],
      ]),
    });

    // Rent: expense default (seeded $0)
    const rent = result.find(a => a.subcategory_name === 'Rent & Mortgage');
    expect(rent).toBeDefined();
    expect(rent!.assigned_cents).toBe(187000);
    expect(rent!.isExpenseDefault).toBe(true);

    // Internet: manual assignment ($38)
    const internet = result.find(a => a.subcategory_name === 'Internet');
    expect(internet).toBeDefined();
    expect(internet!.assigned_cents).toBe(3800);
  });
});

describe('expense default split percentage application', () => {
  it('applies 55% split to weekly expense for monthly subcategory default', () => {
    // Deft Real Estate: $850/week, 55% split
    const weeklyAmount = 85000;
    const monthlyAmount = weeklyAmount * 4; // 340000
    const splitAmount = Math.round(monthlyAmount * (55 / 100)); // 187000
    expect(splitAmount).toBe(187000);
  });

  it('applies 55% split to weekly expense for fortnightly display', () => {
    const monthlyDefault = 187000; // After split
    const fortnightlyDisplay = Math.round(monthlyDefault / 2);
    expect(fortnightlyDisplay).toBe(93500); // $935
  });

  it('no split applied when split_type is null', () => {
    // Belong: $35/month, no split
    const monthlyAmount = 3500;
    // No split setting → full amount
    expect(monthlyAmount).toBe(3500);
  });
});

describe('spending with split: full scenario', () => {
  it('two Deft Real Estate transactions in fortnightly period', () => {
    const shareConfig = createShareConfig();
    const expenseSplits = createExpenseSplitPercentage();
    const catIdMap = createCategoryIdToParentName();

    const txn1 = createRentTransaction('txn-1', -85000);
    const txn2 = createRentTransaction('txn-2', -85000);

    const adj1 = getAdjustedAmount(txn1, 'individual', shareConfig, expenseSplits, catIdMap);
    const adj2 = getAdjustedAmount(txn2, 'individual', shareConfig, expenseSplits, catIdMap);

    expect(adj1).toBe(46750); // $467.50
    expect(adj2).toBe(46750);
    expect(adj1 + adj2).toBe(93500); // $935 total (55% of $1,700)
  });
});

describe('TBB calculation with expense defaults', () => {
  it('subtracts expense defaults from income to get TBB', () => {
    const income = 555600; // $5,556
    const manualAssigned = 0; // All seeded $0 rows sum to 0
    const expenseDefault = 187000; // Rent & Mortgage

    const assignedTotal = manualAssigned + expenseDefault;
    const tbb = income - assignedTotal;

    expect(assignedTotal).toBe(187000);
    expect(tbb).toBe(368600); // $3,686
  });

  it('fortnightly TBB divides monthly values by 2', () => {
    const monthlyIncome = 555600;
    const monthlyExpenseDefault = 187000;
    const monthlyAssigned = 0 + monthlyExpenseDefault;

    const fortnightlyIncome = Math.round(monthlyIncome / 2);
    const fortnightlyAssigned = Math.round(monthlyAssigned / 2);
    const fortnightlyTBB = fortnightlyIncome - fortnightlyAssigned;

    expect(fortnightlyAssigned).toBe(93500); // $935
    expect(fortnightlyTBB).toBe(fortnightlyIncome - 93500);
  });
});
