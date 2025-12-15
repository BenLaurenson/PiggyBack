import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

describe('up-api', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe('Issue 8 — MAX_PAGES safety limit', () => {
    it('should export MAX_PAGES constant as 100', async () => {
      const { MAX_PAGES } = await import('@/lib/up-api');
      expect(MAX_PAGES).toBe(100);
    });

    it('should return all data when pages are within limit', async () => {
      const { createUpApiClient } = await import('@/lib/up-api');
      const client = createUpApiClient('test-token');

      // Mock fetch to return 3 pages then stop
      let fetchCallCount = 0;
      (global.fetch as any).mockImplementation(() => {
        fetchCallCount++;
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({
            data: [{ id: `item-${fetchCallCount}`, type: 'test' }],
            links: {
              prev: null,
              next: fetchCallCount < 3
                ? `https://api.up.com.au/api/v1/transactions?page[after]=cursor-${fetchCallCount}`
                : null,
            },
          }),
        });
      });

      const initialResponse = {
        data: [{ id: 'item-0', type: 'test' }],
        links: {
          prev: null,
          next: 'https://api.up.com.au/api/v1/transactions?page[after]=cursor-0',
        },
      };

      const result = await client.getAllPages(initialResponse);

      // Initial + 3 pages = 4 items
      expect(result.length).toBe(4);
      expect(fetchCallCount).toBe(3);
    });

    it('should stop paginating after MAX_PAGES even if more pages exist', async () => {
      const { createUpApiClient, MAX_PAGES } = await import('@/lib/up-api');
      const client = createUpApiClient('test-token');

      // Mock fetch to always return "next" link (infinite pages)
      let fetchCallCount = 0;
      (global.fetch as any).mockImplementation(() => {
        fetchCallCount++;
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({
            data: [{ id: `item-${fetchCallCount}`, type: 'test' }],
            links: {
              prev: null,
              next: `https://api.up.com.au/api/v1/transactions?page[after]=cursor-${fetchCallCount}`,
            },
          }),
        });
      });

      const initialResponse = {
        data: [{ id: 'item-0', type: 'test' }],
        links: {
          prev: null,
          next: 'https://api.up.com.au/api/v1/transactions?page[after]=cursor-0',
        },
      };

      const result = await client.getAllPages(initialResponse);

      // Should have initial data + MAX_PAGES pages of data
      expect(result.length).toBe(1 + MAX_PAGES);
      // fetch should have been called exactly MAX_PAGES times
      expect(fetchCallCount).toBe(MAX_PAGES);
    }, 30000); // 30s timeout for safety
  });

  describe('Issue 34 — 204 No Content handling', () => {
    it('should not throw when response is 204 No Content (addTags)', async () => {
      const { createUpApiClient } = await import('@/lib/up-api');
      const client = createUpApiClient('test-token');

      // Mock fetch to return 204 No Content (as UP Bank does for tag operations)
      (global.fetch as any).mockResolvedValue({
        ok: true,
        status: 204,
        json: () => { throw new Error('Cannot call .json() on 204 No Content'); },
      });

      // addTags should NOT throw when getting 204
      await expect(client.addTags('txn-123', ['tag1', 'tag2'])).resolves.not.toThrow();
    });

    it('should not throw when response is 204 No Content (removeTags)', async () => {
      const { createUpApiClient } = await import('@/lib/up-api');
      const client = createUpApiClient('test-token');

      // Mock fetch to return 204 No Content
      (global.fetch as any).mockResolvedValue({
        ok: true,
        status: 204,
        json: () => { throw new Error('Cannot call .json() on 204 No Content'); },
      });

      // removeTags should NOT throw when getting 204
      await expect(client.removeTags('txn-123', ['tag1'])).resolves.not.toThrow();
    });

    it('should still parse JSON for non-204 responses', async () => {
      const { createUpApiClient } = await import('@/lib/up-api');
      const client = createUpApiClient('test-token');

      const pingResponse = { meta: { id: 'test', statusEmoji: '⚡️' } };
      (global.fetch as any).mockResolvedValue({
        ok: true,
        status: 200,
        json: () => Promise.resolve(pingResponse),
      });

      const result = await client.ping();
      expect(result).toEqual(pingResponse);
    });
  });
});
