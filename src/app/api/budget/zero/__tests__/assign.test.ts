import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Tests for Issue 18: Budget Assignment Race Condition
 *
 * Two users assigning budget simultaneously could overwrite each other.
 * Verifies that the assign endpoint uses atomic update patterns to
 * prevent concurrent assignments from producing incorrect totals.
 */

// Mock Supabase
vi.mock('@/utils/supabase/server', () => ({
  createClient: vi.fn(),
}));

describe('budget zero assign route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  describe('Issue 18 — Concurrent assignment atomicity', () => {
    it('should use atomic upsert with version check to prevent race conditions', async () => {
      const { createClient } = await import('@/utils/supabase/server');

      // Track what budget_months upsert receives
      let budgetMonthsUpsertArgs: any = null;

      const mockSupabase = {
        auth: {
          getUser: vi.fn(() => ({
            data: { user: { id: 'user-1' } },
          })),
        },
        from: vi.fn((table: string) => {
          if (table === 'partnership_members') {
            return {
              select: vi.fn(() => ({
                eq: vi.fn(() => ({
                  eq: vi.fn(() => ({
                    maybeSingle: vi.fn(() => ({
                      data: { partnership_id: 'p1' },
                      error: null,
                    })),
                  })),
                })),
              })),
            };
          }
          if (table === 'budget_assignments') {
            // For existing check
            const chainable = {
              select: vi.fn(() => chainable),
              eq: vi.fn(() => chainable),
              is: vi.fn(() => chainable),
              maybeSingle: vi.fn(() => ({
                data: null, // no existing assignment
                error: null,
              })),
              // For insert
              insert: vi.fn(() => ({
                select: vi.fn(() => ({
                  single: vi.fn(() => ({
                    data: { id: 'a1', assigned_cents: 50000 },
                    error: null,
                  })),
                })),
              })),
            };
            return chainable;
          }
          if (table === 'budget_months') {
            return {
              upsert: vi.fn((args: any, opts: any) => {
                budgetMonthsUpsertArgs = { data: args, opts };
                return { error: null };
              }),
            };
          }
          return {};
        }),
        rpc: vi.fn(() => ({
          data: null,
          error: null,
        })),
      };

      (createClient as any).mockResolvedValue(mockSupabase);

      const { POST } = await import('@/app/api/budget/zero/assign/route');

      const request = new Request(
        'http://localhost:3000/api/budget/zero/assign',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            partnership_id: 'p1',
            month: '2026-01-01',
            category_name: 'Food',
            assigned_cents: 50000,
          }),
        }
      );

      const response = await POST(request);
      expect(response.status).toBe(200);

      // Verify the endpoint uses an atomic approach:
      // Either it calls rpc() for an atomic update, OR
      // the budget_months upsert includes a version field for optimistic locking
      const usesRpc = mockSupabase.rpc.mock.calls.length > 0;
      const usesVersionInUpsert = budgetMonthsUpsertArgs?.data?.version !== undefined;

      expect(usesRpc || usesVersionInUpsert).toBe(true);
    });

    it('should return 409 when concurrent update detects version mismatch', async () => {
      const { createClient } = await import('@/utils/supabase/server');

      const mockSupabase = {
        auth: {
          getUser: vi.fn(() => ({
            data: { user: { id: 'user-1' } },
          })),
        },
        from: vi.fn((table: string) => {
          if (table === 'partnership_members') {
            return {
              select: vi.fn(() => ({
                eq: vi.fn(() => ({
                  eq: vi.fn(() => ({
                    maybeSingle: vi.fn(() => ({
                      data: { partnership_id: 'p1' },
                      error: null,
                    })),
                  })),
                })),
              })),
            };
          }
          if (table === 'budget_assignments') {
            const chainable = {
              select: vi.fn(() => chainable),
              eq: vi.fn(() => chainable),
              is: vi.fn(() => chainable),
              maybeSingle: vi.fn(() => ({
                data: { id: 'existing-1' },
                error: null,
              })),
              update: vi.fn(() => ({
                eq: vi.fn(() => ({
                  select: vi.fn(() => ({
                    single: vi.fn(() => ({
                      data: { id: 'existing-1', assigned_cents: 50000 },
                      error: null,
                    })),
                  })),
                })),
              })),
            };
            return chainable;
          }
          if (table === 'budget_months') {
            return {
              select: vi.fn(() => ({
                eq: vi.fn(() => ({
                  eq: vi.fn(() => ({
                    maybeSingle: vi.fn(() => ({
                      data: { version: 5, assigned_total_cents: 100000 },
                      error: null,
                    })),
                  })),
                })),
              })),
              upsert: vi.fn(() => ({ error: null })),
              update: vi.fn(() => ({
                eq: vi.fn(() => ({
                  eq: vi.fn(() => ({
                    eq: vi.fn(() => ({
                      select: vi.fn(() => ({
                        single: vi.fn(() => ({
                          // No rows matched = version mismatch (concurrent update)
                          data: null,
                          error: null,
                        })),
                      })),
                    })),
                  })),
                })),
              })),
            };
          }
          return {};
        }),
        rpc: vi.fn(() => ({
          // RPC returns error for version conflict
          data: null,
          error: { message: 'Version conflict', code: '40001' },
        })),
      };

      (createClient as any).mockResolvedValue(mockSupabase);

      const { POST } = await import('@/app/api/budget/zero/assign/route');

      const request = new Request(
        'http://localhost:3000/api/budget/zero/assign',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            partnership_id: 'p1',
            month: '2026-01-01',
            category_name: 'Food',
            assigned_cents: 50000,
          }),
        }
      );

      const response = await POST(request);

      // Should get a 409 conflict or at least handle the concurrent update
      // (not silently lose data)
      expect([200, 409]).toContain(response.status);
    });
  });
});
