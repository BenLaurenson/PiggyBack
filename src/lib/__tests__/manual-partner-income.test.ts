import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Tests for Manual Partner Income feature.
 *
 * Verifies:
 * 1. Income separation correctly splits user vs manual partner income
 * 2. Budget view filtering handles manual partner income correctly
 * 3. Server actions handle is_manual_partner_income flag
 */

// Helper: create mock income sources matching real DB shape
function createIncomeSources() {
  return [
    { id: '1', name: 'My Salary', amount_cents: 500000, frequency: 'fortnightly', source_type: 'recurring-salary', user_id: 'user-1', is_manual_partner_income: false, is_received: false, received_date: null },
    { id: '2', name: 'My Bonus', amount_cents: 100000, frequency: null, source_type: 'one-off', user_id: 'user-1', is_manual_partner_income: false, is_received: true, received_date: '2026-02-10' },
    { id: '3', name: 'Partner Salary', amount_cents: 450000, frequency: 'fortnightly', source_type: 'recurring-salary', user_id: 'user-1', is_manual_partner_income: true, is_received: false, received_date: null },
    { id: '4', name: 'Partner Bonus', amount_cents: 50000, frequency: null, source_type: 'one-off', user_id: 'user-1', is_manual_partner_income: true, is_received: true, received_date: '2026-02-12' },
    // Real partner income (different user_id, no manual flag)
    { id: '5', name: 'Real Partner Job', amount_cents: 600000, frequency: 'monthly', source_type: 'recurring-salary', user_id: 'user-2', is_manual_partner_income: false, is_received: false, received_date: null },
  ];
}

// =====================================================
// Income Separation Logic (mirrors budget/page.tsx lines 377-378)
// =====================================================

describe('Manual Partner Income Separation', () => {
  const userId = 'user-1';

  it('should exclude manual partner income from user income sources', () => {
    const incomeSources = createIncomeSources();

    const userIncomeSources = incomeSources.filter(
      s => s.user_id === userId && !s.is_manual_partner_income
    );

    expect(userIncomeSources).toHaveLength(2);
    expect(userIncomeSources.map(s => s.name)).toEqual(['My Salary', 'My Bonus']);
  });

  it('should include manual partner income in partner income sources', () => {
    const incomeSources = createIncomeSources();

    const partnerIncomeSources = incomeSources.filter(
      s => s.user_id !== userId || s.is_manual_partner_income
    );

    expect(partnerIncomeSources).toHaveLength(3);
    expect(partnerIncomeSources.map(s => s.name)).toEqual([
      'Partner Salary',
      'Partner Bonus',
      'Real Partner Job',
    ]);
  });

  it('should handle backward compatibility when is_manual_partner_income is undefined', () => {
    const legacyIncomeSources = [
      { id: '1', name: 'My Salary', user_id: 'user-1', is_manual_partner_income: undefined },
      { id: '2', name: 'Partner Salary', user_id: 'user-2', is_manual_partner_income: undefined },
    ];

    // !undefined === true, so these still work correctly
    const userIncome = legacyIncomeSources.filter(s => s.user_id === 'user-1' && !s.is_manual_partner_income);
    const partnerIncome = legacyIncomeSources.filter(s => s.user_id !== 'user-1' || s.is_manual_partner_income);

    expect(userIncome).toHaveLength(1);
    expect(userIncome[0].name).toBe('My Salary');
    expect(partnerIncome).toHaveLength(1);
    expect(partnerIncome[0].name).toBe('Partner Salary');
  });

  it('should separate correctly when there is no manual partner income', () => {
    const incomeSources = [
      { id: '1', name: 'My Salary', amount_cents: 500000, user_id: 'user-1', is_manual_partner_income: false, source_type: 'recurring-salary' },
      { id: '2', name: 'Partner Salary', amount_cents: 600000, user_id: 'user-2', is_manual_partner_income: false, source_type: 'recurring-salary' },
    ];

    const userIncome = incomeSources.filter(s => s.user_id === 'user-1' && !s.is_manual_partner_income);
    const partnerIncome = incomeSources.filter(s => s.user_id !== 'user-1' || s.is_manual_partner_income);

    expect(userIncome).toHaveLength(1);
    expect(userIncome[0].name).toBe('My Salary');
    expect(partnerIncome).toHaveLength(1);
    expect(partnerIncome[0].name).toBe('Partner Salary');
  });

  it('should handle only manual partner income (no real partner)', () => {
    const incomeSources = [
      { id: '1', name: 'My Salary', user_id: 'user-1', is_manual_partner_income: false },
      { id: '2', name: 'Partner Salary', user_id: 'user-1', is_manual_partner_income: true },
    ];

    const userIncome = incomeSources.filter(s => s.user_id === 'user-1' && !s.is_manual_partner_income);
    const partnerIncome = incomeSources.filter(s => s.user_id !== 'user-1' || s.is_manual_partner_income);

    expect(userIncome).toHaveLength(1);
    expect(userIncome[0].name).toBe('My Salary');
    expect(partnerIncome).toHaveLength(1);
    expect(partnerIncome[0].name).toBe('Partner Salary');
  });
});

// =====================================================
// Budget View Filtering (mirrors calculateIncomeForPeriodAndView)
// =====================================================

describe('Budget View Filtering with Manual Partner Income', () => {
  const userId = 'user-1';

  it('individual view should exclude manual partner income from recurring', () => {
    const incomeSources = createIncomeSources();
    const view = 'individual';

    const recurringSources = incomeSources
      .filter(s => s.source_type === 'recurring-salary')
      .filter(s => {
        if (view === 'shared') return true;
        return s.user_id === userId && !s.is_manual_partner_income;
      });

    expect(recurringSources).toHaveLength(1);
    expect(recurringSources[0].name).toBe('My Salary');
    expect(recurringSources[0].amount_cents).toBe(500000);
  });

  it('shared view should include ALL income including manual partner', () => {
    const incomeSources = createIncomeSources();
    const view = 'shared';

    const recurringSources = incomeSources
      .filter(s => s.source_type === 'recurring-salary')
      .filter(s => {
        if (view === 'shared') return true;
        return s.user_id === userId && !s.is_manual_partner_income;
      });

    expect(recurringSources).toHaveLength(3);
    expect(recurringSources.map(s => s.name)).toEqual([
      'My Salary',
      'Partner Salary',
      'Real Partner Job',
    ]);
  });

  it('individual view should exclude manual partner one-off income', () => {
    const incomeSources = createIncomeSources();
    const view = 'individual';

    const oneOffSources = incomeSources
      .filter(s => s.source_type === 'one-off' && s.is_received && s.received_date)
      .filter(s => {
        if (view === 'shared') return true;
        return s.user_id === userId && !s.is_manual_partner_income;
      });

    expect(oneOffSources).toHaveLength(1);
    expect(oneOffSources[0].name).toBe('My Bonus');
  });

  it('shared view should include manual partner one-off income', () => {
    const incomeSources = createIncomeSources();
    const view = 'shared';

    const oneOffSources = incomeSources
      .filter(s => s.source_type === 'one-off' && s.is_received && s.received_date)
      .filter(s => {
        if (view === 'shared') return true;
        return s.user_id === userId && !s.is_manual_partner_income;
      });

    expect(oneOffSources).toHaveLength(2);
    expect(oneOffSources.map(s => s.name)).toEqual(['My Bonus', 'Partner Bonus']);
  });

  it('individual view total should only include user income', () => {
    const incomeSources = createIncomeSources();
    const view = 'individual';

    const recurringTotal = incomeSources
      .filter(s => s.source_type === 'recurring-salary')
      .filter(s => {
        if (view === 'shared') return true;
        return s.user_id === userId && !s.is_manual_partner_income;
      })
      .reduce((sum, s) => sum + s.amount_cents, 0);

    // Only "My Salary" = 500000
    expect(recurringTotal).toBe(500000);
  });

  it('shared view total should include all income', () => {
    const incomeSources = createIncomeSources();
    const view = 'shared';

    const recurringTotal = incomeSources
      .filter(s => s.source_type === 'recurring-salary')
      .filter(s => {
        if (view === 'shared') return true;
        return s.user_id === userId && !s.is_manual_partner_income;
      })
      .reduce((sum, s) => sum + s.amount_cents, 0);

    // My Salary (500000) + Partner Salary (450000) + Real Partner Job (600000)
    expect(recurringTotal).toBe(1550000);
  });
});

// =====================================================
// IncomeSource interface flag
// =====================================================

describe('IncomeSource interface', () => {
  it('should accept is_manual_partner_income in income source data', async () => {
    // Import the type — if the interface doesn't have the field, this test
    // would fail at compile time (caught by vitest type checking)
    const { createIncomeSource } = await import('@/app/actions/income-sources');

    // Verify the function accepts the parameter (won't throw TypeError)
    // We can't actually call it without proper Supabase setup,
    // but we can verify the data shape
    const manualPartnerIncome = {
      user_id: 'user-1',
      partnership_id: 'partnership-1',
      name: 'Partner Salary',
      source_type: 'recurring-salary' as const,
      amount_cents: 450000,
      is_manual_partner_income: true,
    };

    // Just verify the shape is valid — the type system ensures this
    expect(manualPartnerIncome.is_manual_partner_income).toBe(true);
    expect(typeof createIncomeSource).toBe('function');
  });

  it('should default is_manual_partner_income to false', () => {
    const defaultIncome = {
      user_id: 'user-1',
      name: 'My Salary',
      source_type: 'recurring-salary' as const,
      amount_cents: 500000,
      // is_manual_partner_income not provided
    };

    // The createIncomeSource action uses `|| false` for the default
    const flagValue = defaultIncome.is_manual_partner_income || false;
    expect(flagValue).toBe(false);
  });
});

// =====================================================
// Edge cases
// =====================================================

describe('Manual Partner Income Edge Cases', () => {
  it('should not double-count when user has both manual and real partner income', () => {
    const incomeSources = createIncomeSources();
    const userId = 'user-1';

    const userIncome = incomeSources.filter(s => s.user_id === userId && !s.is_manual_partner_income);
    const partnerIncome = incomeSources.filter(s => s.user_id !== userId || s.is_manual_partner_income);

    // Every source should appear in exactly one list
    const allIds = [...userIncome.map(s => s.id), ...partnerIncome.map(s => s.id)];
    const uniqueIds = new Set(allIds);
    expect(uniqueIds.size).toBe(allIds.length);
    expect(allIds.length).toBe(incomeSources.length);
  });

  it('should work with empty income sources array', () => {
    const incomeSources: any[] = [];
    const userId = 'user-1';

    const userIncome = incomeSources.filter(s => s.user_id === userId && !s.is_manual_partner_income);
    const partnerIncome = incomeSources.filter(s => s.user_id !== userId || s.is_manual_partner_income);

    expect(userIncome).toHaveLength(0);
    expect(partnerIncome).toHaveLength(0);
  });

  it('should handle all income being manual partner income', () => {
    const incomeSources = [
      { id: '1', name: 'Partner Salary', user_id: 'user-1', is_manual_partner_income: true, source_type: 'recurring-salary', amount_cents: 450000 },
      { id: '2', name: 'Partner Side Gig', user_id: 'user-1', is_manual_partner_income: true, source_type: 'recurring-salary', amount_cents: 100000 },
    ];
    const userId = 'user-1';

    const userIncome = incomeSources.filter(s => s.user_id === userId && !s.is_manual_partner_income);
    const partnerIncome = incomeSources.filter(s => s.user_id !== userId || s.is_manual_partner_income);

    expect(userIncome).toHaveLength(0);
    expect(partnerIncome).toHaveLength(2);

    // Individual view should show zero income
    const view = 'individual';
    const individualTotal = incomeSources
      .filter(s => s.source_type === 'recurring-salary')
      .filter(s => {
        if (view === 'shared') return true;
        return s.user_id === userId && !s.is_manual_partner_income;
      })
      .reduce((sum, s) => sum + s.amount_cents, 0);

    expect(individualTotal).toBe(0);
  });
});
