import { describe, it, expect } from 'vitest';
import {
  generatePaidInstances,
  separatePaidExpenses,
  type ExpenseWithMatches,
  type ExpenseData,
} from '../expense-projections';

describe('expense-projections', () => {
  // Test data factory
  const createExpense = (overrides: Partial<ExpenseData> = {}): ExpenseData => ({
    id: 'exp-1',
    name: 'Deft Real Estate',
    category_name: 'Housing',
    expected_amount_cents: 200000, // $2000
    recurrence_type: 'monthly',
    next_due_date: '2026-01-01',
    emoji: '🏠',
    is_matched: false,
    ...overrides,
  });

  const createExpenseWithMatches = (
    expenseOverrides: Partial<ExpenseData> = {},
    matches: ExpenseWithMatches['expense_matches'] = []
  ): ExpenseWithMatches => ({
    ...createExpense(expenseOverrides),
    expense_matches: matches,
  });

  describe('generatePaidInstances', () => {
    describe('monthly periods with UTC period boundaries', () => {
      // January 2026 period (UTC)
      const periodStart = new Date(Date.UTC(2026, 0, 1, 0, 0, 0, 0));
      const periodEnd = new Date(Date.UTC(2026, 0, 31, 23, 59, 59, 999));

      it('should include match with for_period on period start date', () => {
        const expense = createExpenseWithMatches({}, [
          {
            id: 'match-1',
            for_period: '2026-01-01',
            matched_at: '2026-01-01T00:00:00Z',
            transaction_id: 'txn-1',
            transactions: {
              amount_cents: -200000,
              settled_at: '2026-01-01T10:00:00Z',
              created_at: '2026-01-01T09:00:00Z',
            },
          },
        ]);

        const instances = generatePaidInstances([expense], periodStart, periodEnd);

        expect(instances).toHaveLength(1);
        expect(instances[0].name).toBe('Deft Real Estate');
        expect(instances[0].is_matched).toBe(true);
      });

      it('should include match with for_period in middle of period', () => {
        const expense = createExpenseWithMatches({}, [
          {
            id: 'match-1',
            for_period: '2026-01-15',
            matched_at: '2026-01-15T00:00:00Z',
            transaction_id: 'txn-1',
            transactions: {
              amount_cents: -200000,
              settled_at: '2026-01-15T10:00:00Z',
              created_at: '2026-01-15T09:00:00Z',
            },
          },
        ]);

        const instances = generatePaidInstances([expense], periodStart, periodEnd);

        expect(instances).toHaveLength(1);
      });

      it('should include match with for_period on period end date', () => {
        const expense = createExpenseWithMatches({}, [
          {
            id: 'match-1',
            for_period: '2026-01-31',
            matched_at: '2026-01-31T00:00:00Z',
            transaction_id: 'txn-1',
            transactions: {
              amount_cents: -200000,
              settled_at: '2026-01-31T10:00:00Z',
              created_at: '2026-01-31T09:00:00Z',
            },
          },
        ]);

        const instances = generatePaidInstances([expense], periodStart, periodEnd);

        expect(instances).toHaveLength(1);
      });

      it('should EXCLUDE match with for_period before period', () => {
        const expense = createExpenseWithMatches({}, [
          {
            id: 'match-1',
            for_period: '2025-12-01', // December, not January
            matched_at: '2025-12-01T00:00:00Z',
            transaction_id: 'txn-1',
            transactions: {
              amount_cents: -200000,
              settled_at: '2025-12-01T10:00:00Z',
              created_at: '2025-12-01T09:00:00Z',
            },
          },
        ]);

        const instances = generatePaidInstances([expense], periodStart, periodEnd);

        expect(instances).toHaveLength(0);
      });

      it('should EXCLUDE match with for_period after period', () => {
        const expense = createExpenseWithMatches({}, [
          {
            id: 'match-1',
            for_period: '2026-02-01', // February, not January
            matched_at: '2026-02-01T00:00:00Z',
            transaction_id: 'txn-1',
            transactions: {
              amount_cents: -200000,
              settled_at: '2026-02-01T10:00:00Z',
              created_at: '2026-02-01T09:00:00Z',
            },
          },
        ]);

        const instances = generatePaidInstances([expense], periodStart, periodEnd);

        expect(instances).toHaveLength(0);
      });

      it('should handle multiple matches in same period', () => {
        const expense = createExpenseWithMatches({ recurrence_type: 'weekly' }, [
          {
            id: 'match-1',
            for_period: '2026-01-01',
            matched_at: '2026-01-01T00:00:00Z',
            transaction_id: 'txn-1',
            transactions: {
              amount_cents: -50000,
              settled_at: '2026-01-01T10:00:00Z',
              created_at: '2026-01-01T09:00:00Z',
            },
          },
          {
            id: 'match-2',
            for_period: '2026-01-08',
            matched_at: '2026-01-08T00:00:00Z',
            transaction_id: 'txn-2',
            transactions: {
              amount_cents: -50000,
              settled_at: '2026-01-08T10:00:00Z',
              created_at: '2026-01-08T09:00:00Z',
            },
          },
          {
            id: 'match-3',
            for_period: '2026-01-15',
            matched_at: '2026-01-15T00:00:00Z',
            transaction_id: 'txn-3',
            transactions: {
              amount_cents: -50000,
              settled_at: '2026-01-15T10:00:00Z',
              created_at: '2026-01-15T09:00:00Z',
            },
          },
        ]);

        const instances = generatePaidInstances([expense], periodStart, periodEnd);

        expect(instances).toHaveLength(3);
      });
    });

    describe('for_period parsing', () => {
      const periodStart = new Date(Date.UTC(2026, 0, 1, 0, 0, 0, 0));
      const periodEnd = new Date(Date.UTC(2026, 0, 31, 23, 59, 59, 999));

      it('should parse for_period with T00:00:00Z suffix', () => {
        // This is how generatePaidInstances parses it: new Date(match.for_period + 'T00:00:00Z')
        const forPeriod = '2026-01-01';
        const parsed = new Date(forPeriod + 'T00:00:00Z');

        expect(parsed.getTime()).toBe(Date.UTC(2026, 0, 1, 0, 0, 0, 0));
        expect(parsed >= periodStart).toBe(true);
        expect(parsed <= periodEnd).toBe(true);
      });

      it('should correctly compare parsed for_period against UTC boundaries', () => {
        // CRITICAL: This is the exact logic from generatePaidInstances
        const forPeriod = '2026-01-01';
        const forPeriodDate = new Date(forPeriod + 'T00:00:00Z');

        console.log('forPeriodDate:', forPeriodDate.toISOString());
        console.log('periodStart:', periodStart.toISOString());
        console.log('periodEnd:', periodEnd.toISOString());
        console.log('forPeriodDate >= periodStart:', forPeriodDate >= periodStart);
        console.log('forPeriodDate <= periodEnd:', forPeriodDate <= periodEnd);

        expect(forPeriodDate.toISOString()).toBe('2026-01-01T00:00:00.000Z');
        expect(forPeriodDate >= periodStart).toBe(true);
        expect(forPeriodDate <= periodEnd).toBe(true);
      });
    });

    describe('fallback to transaction date (legacy)', () => {
      const periodStart = new Date(Date.UTC(2026, 0, 1, 0, 0, 0, 0));
      const periodEnd = new Date(Date.UTC(2026, 0, 31, 23, 59, 59, 999));

      it('should use transaction date when for_period is missing', () => {
        const expense = createExpenseWithMatches({}, [
          {
            id: 'match-1',
            for_period: '', // Empty - no for_period
            matched_at: '2026-01-15T00:00:00Z',
            transaction_id: 'txn-1',
            transactions: {
              amount_cents: -200000,
              settled_at: '2026-01-15T10:00:00Z',
              created_at: '2026-01-15T09:00:00Z',
            },
          },
        ]);

        const instances = generatePaidInstances([expense], periodStart, periodEnd);

        expect(instances).toHaveLength(1);
      });

      it('should prefer settled_at over created_at', () => {
        const expense = createExpenseWithMatches({}, [
          {
            id: 'match-1',
            for_period: '',
            matched_at: '2026-01-15T00:00:00Z',
            transaction_id: 'txn-1',
            transactions: {
              amount_cents: -200000,
              settled_at: '2026-01-20T10:00:00Z', // In period
              created_at: '2025-12-25T09:00:00Z', // Before period
            },
          },
        ]);

        const instances = generatePaidInstances([expense], periodStart, periodEnd);

        // Should be included because settled_at is in period
        expect(instances).toHaveLength(1);
      });
    });

    describe('expense with no matches', () => {
      const periodStart = new Date(Date.UTC(2026, 0, 1, 0, 0, 0, 0));
      const periodEnd = new Date(Date.UTC(2026, 0, 31, 23, 59, 59, 999));

      it('should return empty array for expense with no matches', () => {
        const expense = createExpenseWithMatches({}, []);
        const instances = generatePaidInstances([expense], periodStart, periodEnd);

        expect(instances).toHaveLength(0);
      });

      it('should return empty array for expense with undefined matches', () => {
        const expense = createExpense();
        // @ts-expect-error - testing undefined matches
        const instances = generatePaidInstances([expense], periodStart, periodEnd);

        expect(instances).toHaveLength(0);
      });
    });

    describe('instance properties', () => {
      const periodStart = new Date(Date.UTC(2026, 0, 1, 0, 0, 0, 0));
      const periodEnd = new Date(Date.UTC(2026, 0, 31, 23, 59, 59, 999));

      it('should set matched_amount from transaction', () => {
        const expense = createExpenseWithMatches({}, [
          {
            id: 'match-1',
            for_period: '2026-01-01',
            matched_at: '2026-01-01T00:00:00Z',
            transaction_id: 'txn-1',
            transactions: {
              amount_cents: -195000, // Slightly different from expected
              settled_at: '2026-01-01T10:00:00Z',
              created_at: '2026-01-01T09:00:00Z',
            },
          },
        ]);

        const instances = generatePaidInstances([expense], periodStart, periodEnd);

        expect(instances[0].matched_amount).toBe(195000); // Absolute value
      });

      it('should set matched_date from transaction settled_at', () => {
        const expense = createExpenseWithMatches({}, [
          {
            id: 'match-1',
            for_period: '2026-01-01',
            matched_at: '2026-01-01T00:00:00Z',
            transaction_id: 'txn-1',
            transactions: {
              amount_cents: -200000,
              settled_at: '2026-01-01T10:30:00Z',
              created_at: '2026-01-01T09:00:00Z',
            },
          },
        ]);

        const instances = generatePaidInstances([expense], periodStart, periodEnd);

        expect(instances[0].matched_date).toBe('2026-01-01T10:30:00Z');
      });
    });
  });

  describe('separatePaidExpenses', () => {
    const periodStart = new Date(Date.UTC(2026, 0, 1));
    const periodEnd = new Date(Date.UTC(2026, 0, 31, 23, 59, 59, 999));

    it('should separate expenses by transaction dates in period', () => {
      const expenses: ExpenseWithMatches[] = [
        createExpenseWithMatches({ id: '1', name: 'Rent' }, [
          {
            id: 'match-1',
            for_period: '2026-01-01',
            matched_at: '2026-01-01T00:00:00Z',
            transaction_id: 'txn-1',
            transactions: {
              amount_cents: -200000,
              settled_at: '2026-01-05T10:00:00Z',
              created_at: '2026-01-05T09:00:00Z',
            },
          },
        ]),
        createExpenseWithMatches({ id: '2', name: 'Electricity' }, []),
        createExpenseWithMatches({ id: '3', name: 'Internet' }, [
          {
            id: 'match-2',
            for_period: '2026-01-15',
            matched_at: '2026-01-15T00:00:00Z',
            transaction_id: 'txn-2',
            transactions: {
              amount_cents: -8000,
              settled_at: '2026-01-15T10:00:00Z',
              created_at: '2026-01-15T09:00:00Z',
            },
          },
        ]),
      ];

      const { paid, unpaid } = separatePaidExpenses(expenses, periodStart, periodEnd);

      expect(paid).toHaveLength(2);
      expect(unpaid).toHaveLength(1);
      expect(paid.map(e => e.name)).toContain('Rent');
      expect(paid.map(e => e.name)).toContain('Internet');
      expect(unpaid.map(e => e.name)).toContain('Electricity');
    });

    it('should sort paid by matched_date descending', () => {
      const expenses: ExpenseWithMatches[] = [
        createExpenseWithMatches({
          id: '1',
          name: 'First',
          matched_date: '2026-01-01T10:00:00Z',
        }, [
          {
            id: 'match-1',
            for_period: '2026-01-01',
            matched_at: '2026-01-01T00:00:00Z',
            transaction_id: 'txn-1',
            transactions: {
              amount_cents: -200000,
              settled_at: '2026-01-01T10:00:00Z',
              created_at: '2026-01-01T09:00:00Z',
            },
          },
        ]),
        createExpenseWithMatches({
          id: '2',
          name: 'Second',
          matched_date: '2026-01-15T10:00:00Z',
        }, [
          {
            id: 'match-2',
            for_period: '2026-01-15',
            matched_at: '2026-01-15T00:00:00Z',
            transaction_id: 'txn-2',
            transactions: {
              amount_cents: -200000,
              settled_at: '2026-01-15T10:00:00Z',
              created_at: '2026-01-15T09:00:00Z',
            },
          },
        ]),
        createExpenseWithMatches({
          id: '3',
          name: 'Third',
          matched_date: '2026-01-10T10:00:00Z',
        }, [
          {
            id: 'match-3',
            for_period: '2026-01-10',
            matched_at: '2026-01-10T00:00:00Z',
            transaction_id: 'txn-3',
            transactions: {
              amount_cents: -200000,
              settled_at: '2026-01-10T10:00:00Z',
              created_at: '2026-01-10T09:00:00Z',
            },
          },
        ]),
      ];

      const { paid } = separatePaidExpenses(expenses, periodStart, periodEnd);

      expect(paid[0].name).toBe('Second'); // Jan 15 - most recent
      expect(paid[1].name).toBe('Third');  // Jan 10
      expect(paid[2].name).toBe('First');  // Jan 1 - oldest
    });

    it('should sort unpaid by due_date ascending', () => {
      const expenses: ExpenseWithMatches[] = [
        createExpenseWithMatches({
          id: '1',
          name: 'First',
          next_due_date: '2026-01-15',
        }, []),
        createExpenseWithMatches({
          id: '2',
          name: 'Second',
          next_due_date: '2026-01-05',
        }, []),
        createExpenseWithMatches({
          id: '3',
          name: 'Third',
          next_due_date: '2026-01-10',
        }, []),
      ];

      const { unpaid } = separatePaidExpenses(expenses, periodStart, periodEnd);

      expect(unpaid[0].name).toBe('Second'); // Jan 5 - soonest
      expect(unpaid[1].name).toBe('Third');  // Jan 10
      expect(unpaid[2].name).toBe('First');  // Jan 15 - latest
    });

    it('should exclude matches outside the period', () => {
      const expenses: ExpenseWithMatches[] = [
        createExpenseWithMatches({ id: '1', name: 'OldMatch' }, [
          {
            id: 'match-1',
            for_period: '2025-12-01',
            matched_at: '2025-12-01T00:00:00Z',
            transaction_id: 'txn-1',
            transactions: {
              amount_cents: -200000,
              settled_at: '2025-12-01T10:00:00Z',
              created_at: '2025-12-01T09:00:00Z',
            },
          },
        ]),
      ];

      const { paid, unpaid } = separatePaidExpenses(expenses, periodStart, periodEnd);

      expect(paid).toHaveLength(0);
      expect(unpaid).toHaveLength(1);
    });
  });
});
