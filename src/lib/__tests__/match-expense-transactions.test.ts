import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Tests for match-expense-transactions.ts
 *
 * Issues covered:
 * - Issue 3: Amount tolerance should be consistent (±10%) in both batch and webhook paths
 * - Issue 7: Webhook next_due_date advancement should use while-loop like batch
 */

// Mock dependencies
vi.mock('@/utils/supabase/server', () => ({
  createClient: vi.fn(),
}));

vi.mock('@/utils/supabase/service-role', () => ({
  createServiceRoleClient: vi.fn(),
}));

vi.mock('@/lib/expense-period-utils', () => ({
  getPeriodForTransaction: vi.fn(() => '2026-01-01'),
}));

vi.mock('@/lib/budget-zero-calculations', () => ({
  calculateNextDueDate: vi.fn((date: Date, recurrenceType: string) => {
    const next = new Date(date);
    switch (recurrenceType) {
      case 'weekly':
        next.setDate(next.getDate() + 7);
        break;
      case 'fortnightly':
        next.setDate(next.getDate() + 14);
        break;
      case 'monthly':
        next.setMonth(next.getMonth() + 1);
        break;
      case 'quarterly':
        next.setMonth(next.getMonth() + 3);
        break;
      case 'yearly':
        next.setFullYear(next.getFullYear() + 1);
        break;
    }
    return next;
  }),
}));

// Helper to build a fluent Supabase mock chain
function createSupabaseMock(responses: Record<string, any> = {}) {
  const chainMethods: any = {};

  const createChain = () => {
    const chain: any = {};
    const methods = ['select', 'eq', 'in', 'lt', 'is', 'ilike', 'not', 'gte', 'order', 'single', 'maybeSingle', 'insert', 'update', 'upsert'];
    methods.forEach(method => {
      chain[method] = vi.fn(() => chain);
    });
    return chain;
  };

  const mockFrom = vi.fn((table: string) => {
    if (responses[table]) {
      return responses[table];
    }
    return createChain();
  });

  return { from: mockFrom };
}

describe('match-expense-transactions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Issue 3 — Amount tolerance consistency', () => {
    describe('AMOUNT_TOLERANCE_PERCENT constant', () => {
      it('should export AMOUNT_TOLERANCE_PERCENT as 10', async () => {
        const { AMOUNT_TOLERANCE_PERCENT } = await import('@/lib/match-expense-transactions');
        expect(AMOUNT_TOLERANCE_PERCENT).toBe(10);
      });
    });

    describe('batch matching (matchExpenseToTransactions)', () => {
      it('should reject transaction 30% over expected amount', async () => {
        // Expense expects $100 (10000 cents)
        // Transaction is $130 (13000 cents) → 30% over → should NOT match
        const expenseChain: any = {};
        ['select', 'eq', 'single'].forEach(m => { expenseChain[m] = vi.fn(() => expenseChain); });
        expenseChain.single.mockResolvedValue({
          data: {
            merchant_name: 'TestMerchant',
            match_pattern: null,
            expected_amount_cents: 10000,
            recurrence_type: 'monthly',
            next_due_date: '2026-01-01',
          },
          error: null,
        });

        const membersChain: any = {};
        ['select', 'eq'].forEach(m => { membersChain[m] = vi.fn(() => membersChain); });
        membersChain.eq.mockResolvedValue({
          data: [{ user_id: 'user-1' }],
          error: null,
        });

        const accountsChain: any = {};
        ['select', 'in', 'eq'].forEach(m => { accountsChain[m] = vi.fn(() => accountsChain); });
        accountsChain.eq.mockResolvedValue({
          data: [{ id: 'acc-1' }],
          error: null,
        });

        const transactionsChain: any = {};
        ['select', 'in', 'lt', 'is', 'ilike', 'order'].forEach(m => { transactionsChain[m] = vi.fn(() => transactionsChain); });
        transactionsChain.order.mockResolvedValue({
          data: [
            { id: 'txn-1', description: 'TestMerchant Payment', amount_cents: -13000, created_at: '2026-01-15T10:00:00Z', settled_at: '2026-01-15T10:00:00Z' },
          ],
          error: null,
        });

        const existingMatchesChain: any = {};
        ['select', 'eq'].forEach(m => { existingMatchesChain[m] = vi.fn(() => existingMatchesChain); });
        existingMatchesChain.eq.mockResolvedValue({
          data: [],
          error: null,
        });

        let fromCallCount = 0;
        const mockSupabase = {
          from: vi.fn((table: string) => {
            switch (table) {
              case 'expense_definitions': return expenseChain;
              case 'partnership_members': return membersChain;
              case 'accounts': return accountsChain;
              case 'transactions': return transactionsChain;
              case 'expense_matches': return existingMatchesChain;
              default: return expenseChain;
            }
          }),
        };

        const { createClient } = await import('@/utils/supabase/server');
        (createClient as any).mockResolvedValue(mockSupabase);

        const { matchExpenseToTransactions } = await import('@/lib/match-expense-transactions');
        const result = await matchExpenseToTransactions('exp-1', 'partnership-1');

        // 30% off should NOT match with ±10% tolerance
        expect(result.matched).toBe(0);
      });
    });

    describe('webhook matching (matchSingleTransactionToExpenses)', () => {
      it('should reject transaction 30% over expected amount', async () => {
        // Expense expects $100 (10000 cents)
        // Transaction is $130 (13000 cents) → 30% over → should NOT match
        const accountChain: any = {};
        ['select', 'eq', 'single'].forEach(m => { accountChain[m] = vi.fn(() => accountChain); });
        accountChain.single.mockResolvedValue({
          data: { user_id: 'user-1' },
          error: null,
        });

        const membershipChain: any = {};
        ['select', 'eq', 'single'].forEach(m => { membershipChain[m] = vi.fn(() => membershipChain); });
        membershipChain.single.mockResolvedValue({
          data: { partnership_id: 'partnership-1' },
          error: null,
        });

        const expensesChain: any = {};
        ['select', 'eq', 'not'].forEach(m => { expensesChain[m] = vi.fn(() => expensesChain); });
        expensesChain.not.mockResolvedValue({
          data: [
            {
              id: 'exp-1',
              name: 'TestExpense',
              recurrence_type: 'monthly',
              merchant_name: 'TestMerchant',
              expected_amount_cents: 10000,
              next_due_date: '2026-01-01',
            },
          ],
          error: null,
        });

        const mockSupabase = {
          from: vi.fn((table: string) => {
            switch (table) {
              case 'accounts': return accountChain;
              case 'partnership_members': return membershipChain;
              case 'expense_definitions': return expensesChain;
              default: {
                const chain: any = {};
                ['select', 'eq', 'in', 'insert', 'update'].forEach(m => { chain[m] = vi.fn(() => chain); });
                return chain;
              }
            }
          }),
        };

        const { createServiceRoleClient } = await import('@/utils/supabase/service-role');
        (createServiceRoleClient as any).mockReturnValue(mockSupabase);

        const { matchSingleTransactionToExpenses } = await import('@/lib/match-expense-transactions');
        const result = await matchSingleTransactionToExpenses(
          'txn-1',
          'TestMerchant Payment',
          'acc-1',
          '2026-01-15T10:00:00Z',
          -13000 // 30% over the expected $100
        );

        // 30% off should NOT match with ±10% tolerance
        expect(result.matched).toHaveLength(0);
      });

      it('should accept transaction within 10% of expected amount', async () => {
        // Expense expects $100 (10000 cents)
        // Transaction is $108 (10800 cents) → 8% over → should match
        const accountChain: any = {};
        ['select', 'eq', 'single'].forEach(m => { accountChain[m] = vi.fn(() => accountChain); });
        accountChain.single.mockResolvedValue({
          data: { user_id: 'user-1' },
          error: null,
        });

        const membershipChain: any = {};
        ['select', 'eq', 'single'].forEach(m => { membershipChain[m] = vi.fn(() => membershipChain); });
        membershipChain.single.mockResolvedValue({
          data: { partnership_id: 'partnership-1' },
          error: null,
        });

        const expensesChain: any = {};
        ['select', 'eq', 'not'].forEach(m => { expensesChain[m] = vi.fn(() => expensesChain); });
        expensesChain.not.mockResolvedValue({
          data: [
            {
              id: 'exp-1',
              name: 'TestExpense',
              recurrence_type: 'monthly',
              merchant_name: 'TestMerchant',
              expected_amount_cents: 10000,
              next_due_date: '2026-01-01',
            },
          ],
          error: null,
        });

        const matchesCheckChain: any = {};
        ['select', 'eq', 'in'].forEach(m => { matchesCheckChain[m] = vi.fn(() => matchesCheckChain); });
        matchesCheckChain.in.mockResolvedValue({
          data: [],
          error: null,
        });

        // Upsert returns the inserted row data
        const upsertSelectChain: any = {};
        upsertSelectChain.select = vi.fn(() => ({
          data: [{ expense_definition_id: 'exp-1', transaction_id: 'txn-1' }],
          error: null,
        }));
        const upsertChain: any = {};
        upsertChain.upsert = vi.fn(() => upsertSelectChain);

        const updateChain: any = {};
        ['update', 'eq'].forEach(m => { updateChain[m] = vi.fn(() => updateChain); });
        updateChain.eq.mockResolvedValue({ error: null });

        const mockSupabase = {
          from: vi.fn((table: string) => {
            switch (table) {
              case 'accounts': return accountChain;
              case 'partnership_members': return membershipChain;
              case 'expense_definitions':
                // First call: select expenses, second call: update next_due_date
                return { ...expensesChain, update: updateChain.update };
              case 'expense_matches':
                return { select: matchesCheckChain.select, upsert: upsertChain.upsert };
              default: {
                const chain: any = {};
                ['select', 'eq', 'in', 'upsert', 'update'].forEach(m => { chain[m] = vi.fn(() => chain); });
                return chain;
              }
            }
          }),
        };

        const { createServiceRoleClient } = await import('@/utils/supabase/service-role');
        (createServiceRoleClient as any).mockReturnValue(mockSupabase);

        const { matchSingleTransactionToExpenses } = await import('@/lib/match-expense-transactions');
        const result = await matchSingleTransactionToExpenses(
          'txn-1',
          'TestMerchant Payment',
          'acc-1',
          '2026-01-15T10:00:00Z',
          -10800 // 8% over → within ±10%
        );

        // 8% off should match with ±10% tolerance
        expect(result.matched).toHaveLength(1);
        expect(result.matched[0]).toBe('TestExpense');
      });
    });
  });

  describe('Issue 6 — Webhook race condition (duplicate insert)', () => {
    it('should not advance next_due_date when insert returns no rows (duplicate)', async () => {
      // Scenario: Two simultaneous webhook deliveries for the same transaction.
      // The second one should see that insert returned 0 rows (ON CONFLICT DO NOTHING)
      // and NOT advance next_due_date.
      const accountChain: any = {};
      ['select', 'eq', 'single'].forEach(m => { accountChain[m] = vi.fn(() => accountChain); });
      accountChain.single.mockResolvedValue({
        data: { user_id: 'user-1' },
        error: null,
      });

      const membershipChain: any = {};
      ['select', 'eq', 'single'].forEach(m => { membershipChain[m] = vi.fn(() => membershipChain); });
      membershipChain.single.mockResolvedValue({
        data: { partnership_id: 'partnership-1' },
        error: null,
      });

      const expensesChain: any = {};
      ['select', 'eq', 'not'].forEach(m => { expensesChain[m] = vi.fn(() => expensesChain); });
      expensesChain.not.mockResolvedValue({
        data: [
          {
            id: 'exp-1',
            name: 'Monthly Bill',
            recurrence_type: 'monthly',
            merchant_name: 'TestMerchant',
            expected_amount_cents: 10000,
            next_due_date: '2026-01-01',
          },
        ],
        error: null,
      });

      const matchesCheckChain: any = {};
      ['select', 'eq', 'in'].forEach(m => { matchesCheckChain[m] = vi.fn(() => matchesCheckChain); });
      matchesCheckChain.in.mockResolvedValue({
        data: [], // No existing matches (pre-check passes)
        error: null,
      });

      // Simulate upsert returning empty data (ON CONFLICT DO NOTHING — duplicate row)
      const upsertSelectChain: any = {};
      upsertSelectChain.select = vi.fn(() => ({
        data: [], // Empty! The row already existed, nothing was inserted
        error: null,
      }));
      const upsertChain: any = {};
      upsertChain.upsert = vi.fn(() => upsertSelectChain);

      // Track whether next_due_date was updated
      let updatedNextDueDate: string | null = null;
      const updateChain: any = {};
      updateChain.update = vi.fn((data: any) => {
        updatedNextDueDate = data.next_due_date;
        return {
          eq: vi.fn(() => ({ error: null })),
        };
      });

      const mockSupabase = {
        from: vi.fn((table: string) => {
          switch (table) {
            case 'accounts': return accountChain;
            case 'partnership_members': return membershipChain;
            case 'expense_definitions':
              return { ...expensesChain, update: updateChain.update };
            case 'expense_matches':
              return { select: matchesCheckChain.select, upsert: upsertChain.upsert };
            default: {
              const chain: any = {};
              ['select', 'eq', 'in', 'upsert', 'update'].forEach(m => { chain[m] = vi.fn(() => chain); });
              return chain;
            }
          }
        }),
      };

      const { createServiceRoleClient } = await import('@/utils/supabase/service-role');
      (createServiceRoleClient as any).mockReturnValue(mockSupabase);

      const { matchSingleTransactionToExpenses } = await import('@/lib/match-expense-transactions');
      const result = await matchSingleTransactionToExpenses(
        'txn-1',
        'TestMerchant Payment',
        'acc-1',
        '2026-01-15T10:00:00Z',
        -10000
      );

      // The upsert should have been called (not plain insert)
      expect(upsertChain.upsert).toHaveBeenCalled();

      // next_due_date should NOT have been advanced because the upsert returned 0 rows
      expect(updatedNextDueDate).toBeNull();

      // Should return empty matched list since no new rows were actually inserted
      expect(result.matched).toHaveLength(0);
    });

    it('should not error on duplicate transaction insert', async () => {
      // Verify that duplicate inserts don't cause errors (ON CONFLICT DO NOTHING)
      const accountChain: any = {};
      ['select', 'eq', 'single'].forEach(m => { accountChain[m] = vi.fn(() => accountChain); });
      accountChain.single.mockResolvedValue({
        data: { user_id: 'user-1' },
        error: null,
      });

      const membershipChain: any = {};
      ['select', 'eq', 'single'].forEach(m => { membershipChain[m] = vi.fn(() => membershipChain); });
      membershipChain.single.mockResolvedValue({
        data: { partnership_id: 'partnership-1' },
        error: null,
      });

      const expensesChain: any = {};
      ['select', 'eq', 'not'].forEach(m => { expensesChain[m] = vi.fn(() => expensesChain); });
      expensesChain.not.mockResolvedValue({
        data: [
          {
            id: 'exp-1',
            name: 'Monthly Bill',
            recurrence_type: 'monthly',
            merchant_name: 'TestMerchant',
            expected_amount_cents: 10000,
            next_due_date: '2026-01-01',
          },
        ],
        error: null,
      });

      const matchesCheckChain: any = {};
      ['select', 'eq', 'in'].forEach(m => { matchesCheckChain[m] = vi.fn(() => matchesCheckChain); });
      matchesCheckChain.in.mockResolvedValue({
        data: [],
        error: null,
      });

      // Simulate upsert returning the inserted row (successful first insert)
      const upsertSelectChain: any = {};
      upsertSelectChain.select = vi.fn(() => ({
        data: [{ expense_definition_id: 'exp-1', transaction_id: 'txn-1' }],
        error: null,
      }));
      const upsertChain: any = {};
      upsertChain.upsert = vi.fn(() => upsertSelectChain);

      const updateChain: any = {};
      updateChain.update = vi.fn(() => ({
        eq: vi.fn(() => ({ error: null })),
      }));

      const mockSupabase = {
        from: vi.fn((table: string) => {
          switch (table) {
            case 'accounts': return accountChain;
            case 'partnership_members': return membershipChain;
            case 'expense_definitions':
              return { ...expensesChain, update: updateChain.update };
            case 'expense_matches':
              return { select: matchesCheckChain.select, upsert: upsertChain.upsert };
            default: {
              const chain: any = {};
              ['select', 'eq', 'in', 'upsert', 'update'].forEach(m => { chain[m] = vi.fn(() => chain); });
              return chain;
            }
          }
        }),
      };

      const { createServiceRoleClient } = await import('@/utils/supabase/service-role');
      (createServiceRoleClient as any).mockReturnValue(mockSupabase);

      const { matchSingleTransactionToExpenses } = await import('@/lib/match-expense-transactions');
      const result = await matchSingleTransactionToExpenses(
        'txn-1',
        'TestMerchant Payment',
        'acc-1',
        '2026-01-15T10:00:00Z',
        -10000
      );

      // Should succeed without errors
      expect(result.error).toBeUndefined();
      expect(result.matched).toHaveLength(1);
    });
  });

  describe('Issue 7 — Webhook next_due_date advancement', () => {
    it('should advance next_due_date past the transaction date using while-loop', async () => {
      // Scenario: monthly expense with next_due_date 2025-11-01
      // Transaction date: 2026-01-15 (well past due)
      // Should advance: Nov → Dec → Jan → Feb (past Jan 15)
      const accountChain: any = {};
      ['select', 'eq', 'single'].forEach(m => { accountChain[m] = vi.fn(() => accountChain); });
      accountChain.single.mockResolvedValue({
        data: { user_id: 'user-1' },
        error: null,
      });

      const membershipChain: any = {};
      ['select', 'eq', 'single'].forEach(m => { membershipChain[m] = vi.fn(() => membershipChain); });
      membershipChain.single.mockResolvedValue({
        data: { partnership_id: 'partnership-1' },
        error: null,
      });

      const expensesChain: any = {};
      ['select', 'eq', 'not'].forEach(m => { expensesChain[m] = vi.fn(() => expensesChain); });
      expensesChain.not.mockResolvedValue({
        data: [
          {
            id: 'exp-1',
            name: 'Monthly Bill',
            recurrence_type: 'monthly',
            merchant_name: 'TestMerchant',
            expected_amount_cents: 10000,
            next_due_date: '2025-11-01', // Way behind
          },
        ],
        error: null,
      });

      const matchesCheckChain: any = {};
      ['select', 'eq', 'in'].forEach(m => { matchesCheckChain[m] = vi.fn(() => matchesCheckChain); });
      matchesCheckChain.in.mockResolvedValue({
        data: [],
        error: null,
      });

      // Upsert returns the inserted row data
      const upsertSelectChain: any = {};
      upsertSelectChain.select = vi.fn(() => ({
        data: [{ expense_definition_id: 'exp-1', transaction_id: 'txn-1' }],
        error: null,
      }));
      const upsertChain: any = {};
      upsertChain.upsert = vi.fn(() => upsertSelectChain);

      // Track what next_due_date gets updated to
      let updatedNextDueDate: string | null = null;
      const updateChain: any = {};
      updateChain.update = vi.fn((data: any) => {
        updatedNextDueDate = data.next_due_date;
        return {
          eq: vi.fn(() => ({ error: null })),
        };
      });

      const mockSupabase = {
        from: vi.fn((table: string) => {
          switch (table) {
            case 'accounts': return accountChain;
            case 'partnership_members': return membershipChain;
            case 'expense_definitions':
              return { ...expensesChain, update: updateChain.update };
            case 'expense_matches':
              return { select: matchesCheckChain.select, upsert: upsertChain.upsert };
            default: {
              const chain: any = {};
              ['select', 'eq', 'in', 'upsert', 'update'].forEach(m => { chain[m] = vi.fn(() => chain); });
              return chain;
            }
          }
        }),
      };

      const { createServiceRoleClient } = await import('@/utils/supabase/service-role');
      (createServiceRoleClient as any).mockReturnValue(mockSupabase);

      const { matchSingleTransactionToExpenses } = await import('@/lib/match-expense-transactions');
      await matchSingleTransactionToExpenses(
        'txn-1',
        'TestMerchant Payment',
        'acc-1',
        '2026-01-15T10:00:00Z',
        -10000
      );

      // Should advance to 2026-02-01 (past Jan 15), not just one step to 2025-12-01
      expect(updatedNextDueDate).toBe('2026-02-01');
    });
  });
});
