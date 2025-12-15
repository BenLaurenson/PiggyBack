import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Tests for Issue 12: Missing Partnership Verification on Methodology Endpoint
 *
 * The GET endpoint accepts partnership_id without verifying the authenticated
 * user is a member. This test verifies that non-members get 403.
 */

// Mock Supabase
vi.mock('@/utils/supabase/server', () => ({
  createClient: vi.fn(),
}));

describe('methodology route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  describe('Issue 12 — Partnership membership verification on GET', () => {
    it('should return 403 when user is NOT a member of the partnership', async () => {
      const { createClient } = await import('@/utils/supabase/server');

      const mockSupabase = {
        auth: {
          getUser: vi.fn(() => ({
            data: { user: { id: 'user-not-member' } },
          })),
        },
        from: vi.fn((table: string) => {
          if (table === 'partnership_members') {
            return {
              select: vi.fn(() => ({
                eq: vi.fn(() => ({
                  eq: vi.fn(() => ({
                    maybeSingle: vi.fn(() => ({
                      data: null, // NOT a member
                      error: null,
                    })),
                  })),
                })),
              })),
            };
          }
          if (table === 'partnership_budget_methodology') {
            return {
              select: vi.fn(() => ({
                eq: vi.fn(() => ({
                  maybeSingle: vi.fn(() => ({
                    data: { budgeting_methodologies: { name: 'zero-based' } },
                    error: null,
                  })),
                })),
              })),
            };
          }
          return {};
        }),
      };

      (createClient as any).mockResolvedValue(mockSupabase);

      const { GET } = await import('@/app/api/budget/methodology/route');

      const request = new Request(
        'http://localhost:3000/api/budget/methodology?partnership_id=other-partnership'
      );

      const response = await GET(request);

      expect(response.status).toBe(403);
      const json = await response.json();
      expect(json.error).toBeDefined();
    });

    it('should return 200 when user IS a member of the partnership', async () => {
      const { createClient } = await import('@/utils/supabase/server');

      const mockSupabase = {
        auth: {
          getUser: vi.fn(() => ({
            data: { user: { id: 'user-member' } },
          })),
        },
        from: vi.fn((table: string) => {
          if (table === 'partnership_members') {
            return {
              select: vi.fn(() => ({
                eq: vi.fn(() => ({
                  eq: vi.fn(() => ({
                    maybeSingle: vi.fn(() => ({
                      data: { partnership_id: 'my-partnership' },
                      error: null,
                    })),
                  })),
                })),
              })),
            };
          }
          if (table === 'partnership_budget_methodology') {
            return {
              select: vi.fn(() => ({
                eq: vi.fn(() => ({
                  maybeSingle: vi.fn(() => ({
                    data: { budgeting_methodologies: { name: 'zero-based' } },
                    error: null,
                  })),
                })),
              })),
            };
          }
          return {};
        }),
      };

      (createClient as any).mockResolvedValue(mockSupabase);

      const { GET } = await import('@/app/api/budget/methodology/route');

      const request = new Request(
        'http://localhost:3000/api/budget/methodology?partnership_id=my-partnership'
      );

      const response = await GET(request);

      expect(response.status).toBe(200);
    });

    it('should return 401 for unauthenticated users', async () => {
      const { createClient } = await import('@/utils/supabase/server');

      (createClient as any).mockResolvedValue({
        auth: {
          getUser: vi.fn(() => ({
            data: { user: null },
          })),
        },
      });

      const { GET } = await import('@/app/api/budget/methodology/route');

      const request = new Request(
        'http://localhost:3000/api/budget/methodology?partnership_id=p1'
      );

      const response = await GET(request);

      expect(response.status).toBe(401);
    });
  });
});
