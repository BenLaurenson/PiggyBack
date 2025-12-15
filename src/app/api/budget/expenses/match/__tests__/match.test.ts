import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Tests for Issue 25 — Expense Match POST should verify update success
 *
 * After creating an expense match, the next_due_date update has no error checking.
 * When the date update fails, the response should include an error.
 */

vi.mock('@/utils/supabase/server', () => ({
  createClient: vi.fn(),
}));

vi.mock('@/lib/budget-zero-calculations', () => ({
  calculateNextDueDate: vi.fn((date: Date) => {
    const next = new Date(date);
    next.setMonth(next.getMonth() + 1);
    return next;
  }),
}));

describe('expense match POST route', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it('should return error when next_due_date update fails', async () => {
    // Setup: Auth succeeds, match insert succeeds, but date update FAILS
    const mockGetUser = vi.fn().mockResolvedValue({
      data: { user: { id: 'user-123' } },
    });

    const expenseSelectChain: any = {};
    ['select', 'eq', 'maybeSingle'].forEach(m => {
      expenseSelectChain[m] = vi.fn(() => expenseSelectChain);
    });
    expenseSelectChain.maybeSingle.mockResolvedValue({
      data: {
        partnership_id: 'partnership-1',
        recurrence_type: 'monthly',
        next_due_date: '2026-01-01',
      },
      error: null,
    });

    const membershipChain: any = {};
    ['select', 'eq', 'maybeSingle'].forEach(m => {
      membershipChain[m] = vi.fn(() => membershipChain);
    });
    membershipChain.maybeSingle.mockResolvedValue({
      data: { partnership_id: 'partnership-1' },
      error: null,
    });

    const insertChain: any = {};
    insertChain.insert = vi.fn(() => ({ error: null }));

    // The update FAILS with an error
    const updateChain: any = {};
    updateChain.update = vi.fn(() => ({
      eq: vi.fn(() => ({
        error: { message: 'Database update failed', code: '42P01' },
      })),
    }));

    let expenseCallCount = 0;
    const mockSupabase = {
      auth: { getUser: mockGetUser },
      from: vi.fn((table: string) => {
        switch (table) {
          case 'expense_definitions':
            expenseCallCount++;
            if (expenseCallCount === 1) {
              return expenseSelectChain; // First: select expense
            }
            return updateChain; // Second: update next_due_date
          case 'partnership_members':
            return membershipChain;
          case 'expense_matches':
            return insertChain;
          default: {
            const chain: any = {};
            ['select', 'eq', 'insert', 'update', 'maybeSingle'].forEach(m => {
              chain[m] = vi.fn(() => chain);
            });
            return chain;
          }
        }
      }),
    };

    const { createClient } = await import('@/utils/supabase/server');
    (createClient as any).mockResolvedValue(mockSupabase);

    const { POST } = await import('@/app/api/budget/expenses/match/route');

    const request = new Request('http://localhost:3000/api/budget/expenses/match', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        expense_id: '00000000-0000-0000-0000-000000000001',
        transaction_id: '00000000-0000-0000-0000-000000000002',
        confidence: 0.95,
      }),
    });

    const response = await POST(request);
    const json = await response.json();

    // The response should indicate that the date update failed
    // Current code: returns { success: true } even when update fails
    // Fixed code: should return error or warning
    expect(response.status).not.toBe(200);
    expect(json.error).toBeDefined();
  });

  it('should return success when everything works', async () => {
    const mockGetUser = vi.fn().mockResolvedValue({
      data: { user: { id: 'user-123' } },
    });

    const expenseSelectChain: any = {};
    ['select', 'eq', 'maybeSingle'].forEach(m => {
      expenseSelectChain[m] = vi.fn(() => expenseSelectChain);
    });
    expenseSelectChain.maybeSingle.mockResolvedValue({
      data: {
        partnership_id: 'partnership-1',
        recurrence_type: 'monthly',
        next_due_date: '2026-01-01',
      },
      error: null,
    });

    const membershipChain: any = {};
    ['select', 'eq', 'maybeSingle'].forEach(m => {
      membershipChain[m] = vi.fn(() => membershipChain);
    });
    membershipChain.maybeSingle.mockResolvedValue({
      data: { partnership_id: 'partnership-1' },
      error: null,
    });

    const insertChain: any = {};
    insertChain.insert = vi.fn(() => ({ error: null }));

    // The update succeeds
    const updateChain: any = {};
    updateChain.update = vi.fn(() => ({
      eq: vi.fn(() => ({
        error: null,
      })),
    }));

    let expenseCallCount = 0;
    const mockSupabase = {
      auth: { getUser: mockGetUser },
      from: vi.fn((table: string) => {
        switch (table) {
          case 'expense_definitions':
            expenseCallCount++;
            if (expenseCallCount === 1) return expenseSelectChain;
            return updateChain;
          case 'partnership_members':
            return membershipChain;
          case 'expense_matches':
            return insertChain;
          default: {
            const chain: any = {};
            ['select', 'eq', 'insert', 'update', 'maybeSingle'].forEach(m => {
              chain[m] = vi.fn(() => chain);
            });
            return chain;
          }
        }
      }),
    };

    const { createClient } = await import('@/utils/supabase/server');
    (createClient as any).mockResolvedValue(mockSupabase);

    const { POST } = await import('@/app/api/budget/expenses/match/route');

    const request = new Request('http://localhost:3000/api/budget/expenses/match', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        expense_id: '00000000-0000-0000-0000-000000000001',
        transaction_id: '00000000-0000-0000-0000-000000000002',
        confidence: 0.95,
      }),
    });

    const response = await POST(request);
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.success).toBe(true);
  });
});

describe('expense match DELETE route — Issue 5', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it('should succeed when user is a partnership member', async () => {
    const mockGetUser = vi.fn().mockResolvedValue({
      data: { user: { id: 'user-123' } },
    });

    // expense_matches select returns the match with its expense_definition_id
    const matchSelectChain: any = {};
    ['select', 'eq', 'maybeSingle'].forEach(m => {
      matchSelectChain[m] = vi.fn(() => matchSelectChain);
    });
    matchSelectChain.maybeSingle.mockResolvedValue({
      data: { expense_definition_id: 'exp-1' },
      error: null,
    });

    // expense_definitions select returns the expense with partnership_id
    const expenseSelectChain: any = {};
    ['select', 'eq', 'maybeSingle'].forEach(m => {
      expenseSelectChain[m] = vi.fn(() => expenseSelectChain);
    });
    expenseSelectChain.maybeSingle.mockResolvedValue({
      data: { partnership_id: 'partnership-1' },
      error: null,
    });

    // partnership_members check returns membership
    const membershipChain: any = {};
    ['select', 'eq', 'maybeSingle'].forEach(m => {
      membershipChain[m] = vi.fn(() => membershipChain);
    });
    membershipChain.maybeSingle.mockResolvedValue({
      data: { partnership_id: 'partnership-1' },
      error: null,
    });

    // delete chain
    const deleteChain: any = {};
    deleteChain.delete = vi.fn(() => ({
      eq: vi.fn(() => ({ error: null })),
    }));

    let matchesCallCount = 0;
    const mockSupabase = {
      auth: { getUser: mockGetUser },
      from: vi.fn((table: string) => {
        switch (table) {
          case 'expense_matches':
            matchesCallCount++;
            if (matchesCallCount === 1) return matchSelectChain; // First: lookup match
            return deleteChain; // Second: delete match
          case 'expense_definitions':
            return expenseSelectChain;
          case 'partnership_members':
            return membershipChain;
          default: {
            const chain: any = {};
            ['select', 'eq', 'delete', 'maybeSingle'].forEach(m => {
              chain[m] = vi.fn(() => chain);
            });
            return chain;
          }
        }
      }),
    };

    const { createClient } = await import('@/utils/supabase/server');
    (createClient as any).mockResolvedValue(mockSupabase);

    const { DELETE } = await import('@/app/api/budget/expenses/match/route');

    const request = new Request(
      'http://localhost:3000/api/budget/expenses/match?transaction_id=txn-1',
      { method: 'DELETE' }
    );

    const response = await DELETE(request);
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.success).toBe(true);
  });

  it('should return 403 when user is NOT a partnership member', async () => {
    const mockGetUser = vi.fn().mockResolvedValue({
      data: { user: { id: 'attacker-999' } },
    });

    // expense_matches select returns the match
    const matchSelectChain: any = {};
    ['select', 'eq', 'maybeSingle'].forEach(m => {
      matchSelectChain[m] = vi.fn(() => matchSelectChain);
    });
    matchSelectChain.maybeSingle.mockResolvedValue({
      data: { expense_definition_id: 'exp-1' },
      error: null,
    });

    // expense_definitions select returns the expense
    const expenseSelectChain: any = {};
    ['select', 'eq', 'maybeSingle'].forEach(m => {
      expenseSelectChain[m] = vi.fn(() => expenseSelectChain);
    });
    expenseSelectChain.maybeSingle.mockResolvedValue({
      data: { partnership_id: 'partnership-1' },
      error: null,
    });

    // partnership_members check returns NULL — user is NOT a member
    const membershipChain: any = {};
    ['select', 'eq', 'maybeSingle'].forEach(m => {
      membershipChain[m] = vi.fn(() => membershipChain);
    });
    membershipChain.maybeSingle.mockResolvedValue({
      data: null,
      error: null,
    });

    const mockSupabase = {
      auth: { getUser: mockGetUser },
      from: vi.fn((table: string) => {
        switch (table) {
          case 'expense_matches':
            return matchSelectChain;
          case 'expense_definitions':
            return expenseSelectChain;
          case 'partnership_members':
            return membershipChain;
          default: {
            const chain: any = {};
            ['select', 'eq', 'delete', 'maybeSingle'].forEach(m => {
              chain[m] = vi.fn(() => chain);
            });
            return chain;
          }
        }
      }),
    };

    const { createClient } = await import('@/utils/supabase/server');
    (createClient as any).mockResolvedValue(mockSupabase);

    const { DELETE } = await import('@/app/api/budget/expenses/match/route');

    const request = new Request(
      'http://localhost:3000/api/budget/expenses/match?transaction_id=txn-1',
      { method: 'DELETE' }
    );

    const response = await DELETE(request);
    const json = await response.json();

    expect(response.status).toBe(403);
    expect(json.error).toBeDefined();
  });
});
