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

  describe('Phase1 #51-5 — Pagination uses cursor (keyset), not OFFSET, when cursor passed', () => {
    function buildSpyableSupabase() {
      const ltSpy = vi.fn();
      const isSpy = vi.fn();
      const limitSpy = vi.fn(() => ({ data: [], error: null, count: 0 }));
      const rangeSpy = vi.fn(() => ({ data: [], error: null, count: 0 }));

      const chainable: any = {
        select: vi.fn(() => chainable),
        eq: vi.fn(() => chainable),
        in: vi.fn(() => chainable),
        ilike: vi.fn(() => chainable),
        gte: vi.fn(() => chainable),
        lte: vi.fn(() => chainable),
        lt: (...args: unknown[]) => {
          ltSpy(...args);
          return chainable;
        },
        is: (...args: unknown[]) => {
          isSpy(...args);
          return chainable;
        },
        or: vi.fn(() => chainable),
        order: vi.fn(() => chainable),
        limit: limitSpy,
        range: rangeSpy,
      };

      return {
        client: {
          auth: {
            getUser: vi.fn(() => ({ data: { user: { id: 'user-123' } } })),
          },
          from: vi.fn(() => chainable),
        },
        ltSpy,
        isSpy,
        limitSpy,
        rangeSpy,
      };
    }

    it('returns 400 for an invalid cursor (not an ISO timestamp)', async () => {
      const { createClient } = await import('@/utils/supabase/server');
      const { client } = buildSpyableSupabase();
      (createClient as any).mockResolvedValue(client);

      const { GET } = await import('@/app/api/transactions/route');
      const { NextRequest } = await import('next/server');
      const response = await GET(
        new NextRequest('http://localhost:3000/api/transactions?cursor=not-a-date')
      );

      expect(response.status).toBe(400);
      const json = await response.json();
      expect(json.error).toMatch(/cursor/i);
    });

    it('uses keyset (lt + limit) when cursor is supplied, not range/offset', async () => {
      const { createClient } = await import('@/utils/supabase/server');
      const { client, ltSpy, limitSpy, rangeSpy } = buildSpyableSupabase();
      (createClient as any).mockResolvedValue(client);

      const { GET } = await import('@/app/api/transactions/route');
      const { NextRequest } = await import('next/server');
      const cursor = '2026-01-15T00:00:00.000Z';
      const response = await GET(
        new NextRequest(`http://localhost:3000/api/transactions?cursor=${cursor}&limit=25`)
      );

      // Should NOT 400.
      expect(response.status).toBe(200);

      // The route must have called .lt('created_at', <cursor>) — that's the
      // keyset filter. And limit() must have been called instead of range().
      const ltCalls = ltSpy.mock.calls;
      expect(ltCalls.some(([col, val]) => col === 'created_at' && val === cursor)).toBe(true);
      expect(limitSpy).toHaveBeenCalledWith(25);
      // range() is for the OFFSET path on the main query — must NOT be called.
      // (It IS called for the summary batch loop, but only the main-query
      // chainable's range matters here. Since both share the chainable, we
      // accept that range is called for the summary; what matters is that
      // limit() was called for the main query.)
      // Sanity: at least one limit call exists.
      expect(limitSpy.mock.calls.length).toBeGreaterThanOrEqual(1);
      // (rangeSpy presence comes from the summary loop with batch size 1000;
      // we just verify it isn't being called with limit-25 ranges for the
      // main page query.)
      const mainQueryRangeCall = rangeSpy.mock.calls.find(
        ([from, to]) => from === 0 && to === 24
      );
      expect(mainQueryRangeCall).toBeUndefined();
    });

    it('always filters out soft-deleted rows (deleted_at IS NULL)', async () => {
      const { createClient } = await import('@/utils/supabase/server');
      const { client, isSpy } = buildSpyableSupabase();
      (createClient as any).mockResolvedValue(client);

      const { GET } = await import('@/app/api/transactions/route');
      const { NextRequest } = await import('next/server');
      const response = await GET(
        new NextRequest('http://localhost:3000/api/transactions')
      );

      expect(response.status).toBe(200);
      // is('deleted_at', null) must be in the chain — this guarantees
      // TRANSACTION_DELETED rows never appear in the activity list.
      const calls = isSpy.mock.calls;
      expect(calls.some(([col, val]) => col === 'deleted_at' && val === null)).toBe(true);
    });
  });
});
