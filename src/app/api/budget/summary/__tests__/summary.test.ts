import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Integration tests for /api/budget/summary
 *
 * Phase 1 #45 follow-up: confirms `transaction_share_overrides` are wired
 * through the budget summary path so per-transaction custom splits replace
 * (not stack with) `couple_split_settings` defaults, and surface in
 * `partnerBreakdown` for the shared view.
 *
 * Acceptance criterion (the test below):
 * A 2Up account with one transaction marked 70/30 (vs partnership default
 * of 60/40) shows the correct per-partner spend on the shared budget view.
 */

// Module-level mocks must run before route import.
vi.mock('@/utils/supabase/server', () => ({
  createClient: vi.fn(),
}));

vi.mock('@/lib/get-user-partnership', () => ({
  getUserPartnershipId: vi.fn(async () => 'partnership-1'),
}));

vi.mock('@/lib/get-effective-account-ids', () => ({
  getEffectiveAccountIds: vi.fn(async () => ['account-1']),
}));

vi.mock('@/lib/rate-limiter', () => ({
  generalReadLimiter: {
    check: vi.fn(() => ({ allowed: true })),
  },
}));

interface QueryResult {
  data: unknown;
  error: unknown;
}

/**
 * Build a permissive Supabase chain mock. Every chain method returns the same
 * proxy and finally a `.then()`-able resolving to the configured result for
 * the table.
 *
 * `tableHandlers` maps a Supabase table name to either a static `QueryResult`
 * or a function that returns one based on a "tag" we attach via `.maybeSingle`
 * vs default. We keep it simple — one fixture per (table, tag) pair.
 */
function buildSupabaseMock(tableHandlers: Record<string, QueryResult>) {
  const makeChain = (table: string) => {
    const result = tableHandlers[table] ?? { data: [], error: null };
    const single: any = {
      data: Array.isArray(result.data) ? (result.data[0] ?? null) : result.data,
      error: result.error,
    };
    const chain: any = {
      // Chainable accessor methods: every one returns `chain`.
      select: vi.fn(() => chain),
      eq: vi.fn(() => chain),
      neq: vi.fn(() => chain),
      in: vi.fn(() => chain),
      gte: vi.fn(() => chain),
      lte: vi.fn(() => chain),
      lt: vi.fn(() => chain),
      gt: vi.fn(() => chain),
      is: vi.fn(() => chain),
      not: vi.fn(() => chain),
      ilike: vi.fn(() => chain),
      or: vi.fn(() => chain),
      order: vi.fn(() => chain),
      range: vi.fn(() => chain),
      limit: vi.fn(() => chain),
      // Terminating methods that PostgREST thenables resolve to a single row:
      maybeSingle: vi.fn(() => Promise.resolve(single)),
      single: vi.fn(() => Promise.resolve(single)),
      // The chain is itself a thenable resolving to the array result.
      then: (resolve: (value: QueryResult) => unknown) => resolve(result),
    };
    return chain;
  };

  return {
    auth: {
      getUser: vi.fn(async () => ({ data: { user: { id: 'user-owner' } } })),
    },
    from: vi.fn((table: string) => makeChain(table)),
  };
}

describe('GET /api/budget/summary — partnerBreakdown', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it('reflects per-transaction 70/30 override (vs partnership default 60/40) for shared view', async () => {
    const { createClient } = await import('@/utils/supabase/server');

    const supabaseMock = buildSupabaseMock({
      // Budget shell — partnership-1, owned by user-owner, shared view, monthly
      user_budgets: {
        data: {
          id: 'budget-1',
          partnership_id: 'partnership-1',
          period_type: 'monthly',
          budget_view: 'shared',
          methodology: 'zero-based',
          total_budget: null,
          created_by: 'user-owner',
        },
        error: null,
      },
      // Empty income, assignments, expense defs — irrelevant for partnerBreakdown
      income_sources: { data: [], error: null },
      budget_assignments: { data: [], error: null },
      expense_definitions: { data: [], error: null },
      // Partnership default split: 60% owner / 40% partner. Should be IGNORED
      // for the override txn.
      couple_split_settings: {
        data: [
          {
            category_name: 'Food & Dining',
            expense_definition_id: null,
            split_type: 'custom',
            owner_percentage: 60,
          },
        ],
        error: null,
      },
      // Single category mapping for the test transaction.
      category_mappings: {
        data: [
          {
            up_category_id: 'groceries',
            new_parent_name: 'Food & Dining',
            new_child_name: 'Groceries',
            icon: '🛒',
            display_order: 1,
          },
        ],
        error: null,
      },
      budget_months: { data: null, error: null },
      budget_layout_presets: { data: null, error: null },
      savings_goals: { data: [], error: null },
      investments: { data: [], error: null },
      investment_contributions: { data: [], error: null },
      // The single transaction in this period: $100 at category "groceries".
      transactions: {
        data: [
          {
            id: 'txn-1',
            amount_cents: -10000,
            category_id: 'groceries',
            settled_at: '2026-02-15T10:00:00Z',
            expense_matches: null,
          },
        ],
        error: null,
      },
      // Per-txn override: owner share is 70 (so partner share is 30). REPLACES
      // the partnership-level 60/40.
      transaction_share_overrides: {
        data: [
          {
            transaction_id: 'txn-1',
            share_percentage: 70,
            is_shared: true,
          },
        ],
        error: null,
      },
      // The other partnership member.
      partnership_members: {
        data: { user_id: 'user-partner' },
        error: null,
      },
    });

    (createClient as any).mockResolvedValue(supabaseMock);

    const { GET } = await import('@/app/api/budget/summary/route');

    const response = await GET(
      new Request('http://localhost:3000/api/budget/summary?budget_id=budget-1&date=2026-02-15')
    );
    expect(response.status).toBe(200);

    const json = await response.json();

    // Acceptance criterion: per-partner spend reflects 70/30 override.
    expect(json.partnerBreakdown).toBeDefined();
    expect(json.partnerBreakdown.ownerUserId).toBe('user-owner');
    expect(json.partnerBreakdown.partnerUserId).toBe('user-partner');
    expect(json.partnerBreakdown.ownerSpent).toBe(7000); // 70% of $100
    expect(json.partnerBreakdown.partnerSpent).toBe(3000); // 30% of $100

    // bySubcategory should be a plain object after JSON serialisation.
    expect(json.partnerBreakdown.bySubcategory).toEqual({
      'Food & Dining::Groceries': { owner: 7000, partner: 3000 },
    });
  });

  it('falls back to partnership 60/40 default when no transaction override exists', async () => {
    const { createClient } = await import('@/utils/supabase/server');

    const supabaseMock = buildSupabaseMock({
      user_budgets: {
        data: {
          id: 'budget-1',
          partnership_id: 'partnership-1',
          period_type: 'monthly',
          budget_view: 'shared',
          methodology: 'zero-based',
          total_budget: null,
          created_by: 'user-owner',
        },
        error: null,
      },
      income_sources: { data: [], error: null },
      budget_assignments: { data: [], error: null },
      expense_definitions: { data: [], error: null },
      couple_split_settings: {
        data: [
          {
            category_name: 'Food & Dining',
            expense_definition_id: null,
            split_type: 'custom',
            owner_percentage: 60,
          },
        ],
        error: null,
      },
      category_mappings: {
        data: [
          {
            up_category_id: 'groceries',
            new_parent_name: 'Food & Dining',
            new_child_name: 'Groceries',
            icon: '🛒',
            display_order: 1,
          },
        ],
        error: null,
      },
      budget_months: { data: null, error: null },
      budget_layout_presets: { data: null, error: null },
      savings_goals: { data: [], error: null },
      investments: { data: [], error: null },
      investment_contributions: { data: [], error: null },
      transactions: {
        data: [
          {
            id: 'txn-1',
            amount_cents: -10000,
            category_id: 'groceries',
            settled_at: '2026-02-15T10:00:00Z',
            expense_matches: null,
          },
        ],
        error: null,
      },
      // No overrides — should use partnership default.
      transaction_share_overrides: { data: [], error: null },
      partnership_members: { data: { user_id: 'user-partner' }, error: null },
    });

    (createClient as any).mockResolvedValue(supabaseMock);

    const { GET } = await import('@/app/api/budget/summary/route');

    const response = await GET(
      new Request('http://localhost:3000/api/budget/summary?budget_id=budget-1&date=2026-02-15')
    );
    expect(response.status).toBe(200);

    const json = await response.json();
    expect(json.partnerBreakdown.ownerSpent).toBe(6000); // 60% — partnership default
    expect(json.partnerBreakdown.partnerSpent).toBe(4000); // 40%
  });
});
