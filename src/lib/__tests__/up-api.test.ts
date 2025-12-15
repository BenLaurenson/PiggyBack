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

  describe('H18 — SSRF protection via pagination URL validation', () => {
    it('should reject pagination URLs pointing to non-Up Bank domains', async () => {
      const { createUpApiClient } = await import('@/lib/up-api');
      const client = createUpApiClient('test-token');

      const maliciousResponse = {
        data: [{ id: 'item-0', type: 'test' }],
        links: {
          prev: null,
          next: 'https://internal-service.local/admin',
        },
      };

      await expect(client.getAllPages(maliciousResponse)).rejects.toThrow(
        'Pagination URL does not match expected Up Bank API domain'
      );
      // fetch should NOT have been called for the malicious URL
      expect(global.fetch).not.toHaveBeenCalled();
    });

    it('should reject pagination URLs using http instead of https', async () => {
      const { createUpApiClient } = await import('@/lib/up-api');
      const client = createUpApiClient('test-token');

      const httpResponse = {
        data: [{ id: 'item-0', type: 'test' }],
        links: {
          prev: null,
          next: 'http://api.up.com.au/api/v1/transactions?page[after]=cursor',
        },
      };

      await expect(client.getAllPages(httpResponse)).rejects.toThrow(
        'Pagination URL does not match expected Up Bank API domain'
      );
      expect(global.fetch).not.toHaveBeenCalled();
    });

    it('should reject pagination URLs with invalid format', async () => {
      const { createUpApiClient } = await import('@/lib/up-api');
      const client = createUpApiClient('test-token');

      const invalidResponse = {
        data: [{ id: 'item-0', type: 'test' }],
        links: {
          prev: null,
          next: 'not-a-valid-url',
        },
      };

      await expect(client.getAllPages(invalidResponse)).rejects.toThrow(
        'Invalid pagination URL'
      );
      expect(global.fetch).not.toHaveBeenCalled();
    });

    it('should reject pagination URLs with Up Bank subdomain spoofing', async () => {
      const { createUpApiClient } = await import('@/lib/up-api');
      const client = createUpApiClient('test-token');

      const spoofedResponse = {
        data: [{ id: 'item-0', type: 'test' }],
        links: {
          prev: null,
          next: 'https://api.up.com.au.evil.com/api/v1/transactions',
        },
      };

      await expect(client.getAllPages(spoofedResponse)).rejects.toThrow(
        'Pagination URL does not match expected Up Bank API domain'
      );
      expect(global.fetch).not.toHaveBeenCalled();
    });

    it('should accept valid Up Bank API pagination URLs', async () => {
      const { createUpApiClient } = await import('@/lib/up-api');
      const client = createUpApiClient('test-token');

      (global.fetch as any).mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          data: [{ id: 'item-1', type: 'test' }],
          links: { prev: null, next: null },
        }),
      });

      const validResponse = {
        data: [{ id: 'item-0', type: 'test' }],
        links: {
          prev: null,
          next: 'https://api.up.com.au/api/v1/transactions?page[after]=cursor-0',
        },
      };

      const result = await client.getAllPages(validResponse);
      expect(result.length).toBe(2);
      expect(global.fetch).toHaveBeenCalledTimes(1);
    });

    it('should export validateUpApiUrl for use by sync routes', async () => {
      const { validateUpApiUrl } = await import('@/lib/up-api');
      expect(typeof validateUpApiUrl).toBe('function');

      // Valid URL should not throw
      expect(() => validateUpApiUrl('https://api.up.com.au/api/v1/accounts')).not.toThrow();

      // Invalid URL should throw
      expect(() => validateUpApiUrl('https://evil.com/api')).toThrow();
    });
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
