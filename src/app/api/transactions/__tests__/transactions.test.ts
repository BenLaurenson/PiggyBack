import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Tests for Issue 24: Missing Input Validation on Complex Query Parameters
 *
 * The transactions endpoint accepts comma-separated account/category IDs
 * without validating UUID format. Could cause errors with malformed input.
 * Also needs to limit number of IDs per request (max 50).
 */

// Mock Supabase
vi.mock('@/utils/supabase/server', () => ({
  createClient: vi.fn(),
}));

// Helper: build a mock supabase client that returns empty results
function buildMockSupabase() {
  const chainable: any = {
    select: vi.fn(() => chainable),
    eq: vi.fn(() => chainable),
    in: vi.fn(() => chainable),
    ilike: vi.fn(() => chainable),
    gte: vi.fn(() => chainable),
    lte: vi.fn(() => chainable),
    lt: vi.fn(() => chainable),
    is: vi.fn(() => chainable),
    or: vi.fn(() => chainable),
    order: vi.fn(() => chainable),
    range: vi.fn(() => ({
      data: [],
      error: null,
      count: 0,
    })),
  };

  return {
    auth: {
      getUser: vi.fn(() => ({
        data: { user: { id: 'user-123' } },
      })),
    },
    from: vi.fn(() => chainable),
  };
}

describe('transactions route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  describe('Issue 24 — Input validation on complex query parameters', () => {
    it('should return 400 for malformed UUID in accountId', async () => {
      const { createClient } = await import('@/utils/supabase/server');
      (createClient as any).mockResolvedValue(buildMockSupabase());

      const { GET } = await import('@/app/api/transactions/route');

      const request = new Request(
        'http://localhost:3000/api/transactions?accountId=not-a-uuid,also-bad'
      );
      // Need to use NextRequest for nextUrl
      const { NextRequest } = await import('next/server');
      const nextRequest = new NextRequest(request);

      const response = await GET(nextRequest);

      expect(response.status).toBe(400);
      const json = await response.json();
      expect(json.error).toMatch(/invalid|uuid|format/i);
    });

    it('should return 400 for malformed UUID in categoryId', async () => {
      const { createClient } = await import('@/utils/supabase/server');
      (createClient as any).mockResolvedValue(buildMockSupabase());

      const { GET } = await import('@/app/api/transactions/route');

      const { NextRequest } = await import('next/server');
      const nextRequest = new NextRequest(
        'http://localhost:3000/api/transactions?categoryId=DROP TABLE,;--hack'
      );

      const response = await GET(nextRequest);

      expect(response.status).toBe(400);
      const json = await response.json();
      expect(json.error).toMatch(/invalid|uuid|format/i);
    });

    it('should return 400 when too many IDs are provided (> 50)', async () => {
      const { createClient } = await import('@/utils/supabase/server');
      (createClient as any).mockResolvedValue(buildMockSupabase());

      const { GET } = await import('@/app/api/transactions/route');

      // Generate 51 valid-looking UUIDs
      const manyIds = Array.from({ length: 51 }, (_, i) =>
        `a0000000-0000-0000-0000-${String(i).padStart(12, '0')}`
      ).join(',');

      const { NextRequest } = await import('next/server');
      const nextRequest = new NextRequest(
        `http://localhost:3000/api/transactions?accountId=${manyIds}`
      );

      const response = await GET(nextRequest);

      expect(response.status).toBe(400);
      const json = await response.json();
      expect(json.error).toMatch(/too many|limit|exceed/i);
    });

    it('should accept valid UUID format in accountId', async () => {
      const { createClient } = await import('@/utils/supabase/server');
      (createClient as any).mockResolvedValue(buildMockSupabase());

      const { GET } = await import('@/app/api/transactions/route');

      const { NextRequest } = await import('next/server');
      const nextRequest = new NextRequest(
        'http://localhost:3000/api/transactions?accountId=a0000000-0000-0000-0000-000000000001,b0000000-0000-0000-0000-000000000002'
      );

      const response = await GET(nextRequest);

      // Should not be 400 — valid UUIDs
      expect(response.status).not.toBe(400);
    });

    it('should accept a single non-UUID accountId value "all"', async () => {
      const { createClient } = await import('@/utils/supabase/server');
      (createClient as any).mockResolvedValue(buildMockSupabase());

      const { GET } = await import('@/app/api/transactions/route');

      const { NextRequest } = await import('next/server');
      const nextRequest = new NextRequest(
        'http://localhost:3000/api/transactions?accountId=all'
      );

      const response = await GET(nextRequest);

      // "all" is a special value, not validated as UUID
      expect(response.status).not.toBe(400);
    });
  });
});
