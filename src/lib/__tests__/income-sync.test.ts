/**
 * Issue 35 — Income Tag Sync Does Not Paginate
 * Tests that syncIncomeTagsFromUpBank follows pagination when there are more than 100 results.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Track calls to getAllPages
const mockGetAllPages = vi.fn();
const mockGetTransactions = vi.fn();

vi.mock('@/lib/up-api', () => ({
  createUpApiClient: vi.fn(() => ({
    getTransactions: mockGetTransactions,
    getAllPages: mockGetAllPages,
  })),
}));

vi.mock('@/lib/token-encryption', () => ({
  getPlaintextToken: vi.fn(() => 'test-token'),
}));

vi.mock('@/utils/supabase/server', () => ({
  createClient: vi.fn(() => ({
    auth: {
      getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'user-1' } } }),
    },
    from: vi.fn().mockImplementation((table: string) => {
      if (table === 'up_api_configs') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              maybeSingle: vi.fn().mockResolvedValue({
                data: { encrypted_token: 'encrypted-token' },
                error: null,
              }),
            }),
          }),
        };
      }
      if (table === 'transactions') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              maybeSingle: vi.fn().mockResolvedValue({
                data: { id: 'local-txn-1', account_id: 'acc-1', accounts: { user_id: 'user-1' } },
                error: null,
              }),
            }),
          }),
          update: vi.fn().mockReturnValue({
            eq: vi.fn().mockResolvedValue({ error: null }),
          }),
        };
      }
      if (table === 'tags') {
        return {
          upsert: vi.fn().mockResolvedValue({ error: null }),
        };
      }
      if (table === 'transaction_tags') {
        return {
          upsert: vi.fn().mockResolvedValue({ error: null }),
        };
      }
      return { select: vi.fn() };
    }),
  })),
}));

vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
}));

vi.mock('@/lib/income-pattern-analysis', () => ({
  analyzeIncomePattern: vi.fn(),
}));

vi.mock('@/lib/demo-guard', () => ({
  demoActionGuard: vi.fn(() => null),
}));

describe('income-sync', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('syncIncomeTagsFromUpBank', () => {
    it('should call getAllPages to follow pagination', async () => {
      // Setup: getTransactions returns a paginated response with a next link
      const firstPageResponse = {
        data: [
          { id: 'up-txn-1', attributes: { description: 'Salary' } },
          { id: 'up-txn-2', attributes: { description: 'Salary' } },
        ],
        links: {
          prev: null,
          next: 'https://api.up.com.au/api/v1/transactions?page[after]=cursor-1',
        },
      };

      mockGetTransactions.mockResolvedValue(firstPageResponse);

      // getAllPages should return ALL transactions across all pages
      const allTransactions = [
        { id: 'up-txn-1', attributes: { description: 'Salary' } },
        { id: 'up-txn-2', attributes: { description: 'Salary' } },
        { id: 'up-txn-3', attributes: { description: 'Salary' } },
      ];
      mockGetAllPages.mockResolvedValue(allTransactions);

      const { syncIncomeTagsFromUpBank } = await import('@/app/actions/income');
      const result = await syncIncomeTagsFromUpBank();

      // getAllPages MUST be called with the initial response
      expect(mockGetAllPages).toHaveBeenCalledTimes(1);
      expect(mockGetAllPages).toHaveBeenCalledWith(firstPageResponse);

      // Should process all 3 transactions (not just the first page's 2)
      expect(result.synced).toBe(3);
    });

    it('should handle when there is only one page (no next link)', async () => {
      const singlePageResponse = {
        data: [
          { id: 'up-txn-1', attributes: { description: 'Salary' } },
        ],
        links: {
          prev: null,
          next: null,
        },
      };

      mockGetTransactions.mockResolvedValue(singlePageResponse);

      // Even with one page, getAllPages should be called (it will return same data)
      mockGetAllPages.mockResolvedValue([
        { id: 'up-txn-1', attributes: { description: 'Salary' } },
      ]);

      const { syncIncomeTagsFromUpBank } = await import('@/app/actions/income');
      const result = await syncIncomeTagsFromUpBank();

      expect(mockGetAllPages).toHaveBeenCalledTimes(1);
      expect(result.synced).toBe(1);
    });
  });
});
