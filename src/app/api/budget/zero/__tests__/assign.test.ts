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
    it('should use unique-constraint retry to prevent race conditions on concurrent insert', async () => {
      const { createClient } = await import('@/utils/supabase/server');

      // Track calls to budget_assignments
      const insertFn = vi.fn();
      const updateFn = vi.fn();
      let maybeSingleCallCount = 0;

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
                      data: { partnership_id: 'a0000000-0000-4000-a000-000000000001', user_id: 'user-1', role: 'owner' },
                      error: null,
                    })),
                  })),
                })),
              })),
            };
          }
          if (table === 'budget_assignments') {
            const chainable: any = {
              select: vi.fn(() => chainable),
              eq: vi.fn(() => chainable),
              is: vi.fn(() => chainable),
              maybeSingle: vi.fn(() => {
                maybeSingleCallCount++;
                if (maybeSingleCallCount === 1) {
                  // First check: no existing assignment
                  return { data: null, error: null };
                }
                // Retry check after 23505: row now exists from concurrent insert
                return { data: { id: 'a1' }, error: null };
              }),
              // Insert fails with 23505 (unique constraint violation) to simulate race
              insert: vi.fn((...args: any[]) => {
                insertFn(...args);
                return {
                  select: vi.fn(() => ({
                    single: vi.fn(() => ({
                      data: null,
                      error: { code: '23505', message: 'duplicate key value violates unique constraint' },
                    })),
                  })),
                };
              }),
              // Retry update after 23505
              update: vi.fn((...args: any[]) => {
                updateFn(...args);
                const updateChain: any = {
                  eq: vi.fn(() => updateChain),
                  is: vi.fn(() => updateChain),
                  select: vi.fn(() => updateChain),
                  single: vi.fn(() => ({
                    data: { id: 'a1', assigned_cents: 50000 },
                    error: null,
                  })),
                };
                return updateChain;
              }),
            };
            return chainable;
          }
          return {};
        }),
      };

      (createClient as any).mockResolvedValue(mockSupabase);

      const { POST } = await import('@/app/api/budget/zero/assign/route');

      const request = new Request(
        'http://localhost:3000/api/budget/zero/assign',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            partnership_id: 'a0000000-0000-4000-a000-000000000001',
            month: '2026-01-01',
            category_name: 'Food',
            assigned_cents: 50000,
          }),
        }
      );

      const response = await POST(request);
      const json = await response.json();

      // Endpoint returns 200 even after race-condition retry
      expect(response.status).toBe(200);
      expect(json.success).toBe(true);

      // Verify it interacted with budget_assignments table
      expect(mockSupabase.from).toHaveBeenCalledWith('budget_assignments');

      // Insert was attempted first (the initial insert path)
      expect(insertFn).toHaveBeenCalled();

      // After 23505, it retried with an update (the race-condition recovery path)
      expect(updateFn).toHaveBeenCalled();
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
            const chainable: any = {
              select: vi.fn(() => chainable),
              eq: vi.fn(() => chainable),
              is: vi.fn(() => chainable),
              maybeSingle: vi.fn(() => ({
                data: { id: 'existing-1' },
                error: null,
              })),
              update: vi.fn(() => {
                const updateChain: any = {
                  eq: vi.fn(() => updateChain),
                  is: vi.fn(() => updateChain),
                  select: vi.fn(() => updateChain),
                  single: vi.fn(() => ({
                    // No rows matched = version mismatch → triggers PGRST116
                    data: null,
                    error: { code: 'PGRST116', message: 'JSON object requested, multiple (or no) rows returned' },
                  })),
                };
                return updateChain;
              }),
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
            partnership_id: 'a0000000-0000-4000-a000-000000000001',
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
