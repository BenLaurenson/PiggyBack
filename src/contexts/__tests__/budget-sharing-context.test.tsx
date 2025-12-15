/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { BudgetSharingProvider, useBudgetSharing } from '../budget-sharing-context';

// Mock fetch
global.fetch = vi.fn();

const mockPartnershipId = 'test-partnership-123';

const mockCategoryShares = [
  { category_name: 'Groceries', is_shared: true, share_percentage: 50 },
  { category_name: 'Rent', is_shared: true, share_percentage: 60 },
];

const mockSplitSettings = [
  { expense_definition_id: 'expense-1', split_type: 'equal', owner_percentage: 50 },
  { category_name: 'Utilities', split_type: 'custom', owner_percentage: 70 },
  { split_type: 'equal', owner_percentage: 50 }, // default
];

const mockTransactionOverrides = [
  { transaction_id: 'txn-1', is_shared: true, share_percentage: 75 },
  { transaction_id: 'txn-2', is_shared: false, share_percentage: 100 },
];

function createWrapper(
  partnershipId = mockPartnershipId,
  initialCategoryShares = mockCategoryShares,
  initialSplitSettings = mockSplitSettings,
  initialTransactionOverrides = mockTransactionOverrides
) {
  return ({ children }: { children: React.ReactNode }) => (
    <BudgetSharingProvider
      partnershipId={partnershipId}
      initialCategoryShares={initialCategoryShares}
      initialSplitSettings={initialSplitSettings}
      initialTransactionOverrides={initialTransactionOverrides}
    >
      {children}
    </BudgetSharingProvider>
  );
}

describe('BudgetSharingProvider', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('initialization', () => {
    it('should initialize category shares from props', () => {
      const { result } = renderHook(() => useBudgetSharing(), {
        wrapper: createWrapper(),
      });

      expect(result.current.categoryShares.size).toBe(2);
      expect(result.current.categoryShares.get('Groceries')).toEqual({
        isShared: true,
        sharePercentage: 50,
      });
      expect(result.current.categoryShares.get('Rent')).toEqual({
        isShared: true,
        sharePercentage: 60,
      });
    });

    it('should initialize expense splits from props', () => {
      const { result } = renderHook(() => useBudgetSharing(), {
        wrapper: createWrapper(),
      });

      expect(result.current.expenseSplits.size).toBe(3);
      expect(result.current.expenseSplits.get('expense:expense-1')).toEqual({
        splitType: 'equal',
        ownerPercentage: 50,
      });
      expect(result.current.expenseSplits.get('category:Utilities')).toEqual({
        splitType: 'custom',
        ownerPercentage: 70,
      });
      expect(result.current.expenseSplits.get('default')).toEqual({
        splitType: 'equal',
        ownerPercentage: 50,
      });
    });

    it('should initialize transaction overrides from props', () => {
      const { result } = renderHook(() => useBudgetSharing(), {
        wrapper: createWrapper(),
      });

      expect(result.current.transactionOverrides.size).toBe(2);
      expect(result.current.transactionOverrides.get('txn-1')).toEqual({
        isShared: true,
        sharePercentage: 75,
      });
      expect(result.current.transactionOverrides.get('txn-2')).toEqual({
        isShared: false,
        sharePercentage: 100,
      });
    });

    it('should not fetch data if initial props provided', () => {
      renderHook(() => useBudgetSharing(), {
        wrapper: createWrapper(),
      });

      // Should not fetch since initial data was provided
      expect(fetch).not.toHaveBeenCalled();
    });

    it('should fetch category shares if not provided', async () => {
      (fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ shares: mockCategoryShares }),
      });

      renderHook(() => useBudgetSharing(), {
        wrapper: createWrapper(mockPartnershipId, [], mockSplitSettings, mockTransactionOverrides),
      });

      await waitFor(() => {
        expect(fetch).toHaveBeenCalledWith(
          expect.stringContaining('/api/budget/shares/categories')
        );
      });
    });
  });

  describe('buildShareConfig', () => {
    it('should build ShareConfig from Maps', () => {
      const { result } = renderHook(() => useBudgetSharing(), {
        wrapper: createWrapper(),
      });

      const config = result.current.buildShareConfig();

      expect(config.categoryShares.size).toBe(2);
      expect(config.categoryShares.get('Groceries')).toEqual({
        categoryName: 'Groceries',
        isShared: true,
        sharePercentage: 50,
      });

      expect(config.transactionOverrides.size).toBe(2);
      expect(config.transactionOverrides.get('txn-1')).toEqual({
        transactionId: 'txn-1',
        isShared: true,
        sharePercentage: 75,
      });
    });
  });

  describe('setCategoryShare', () => {
    it('should optimistically update category share', async () => {
      (fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ share: { category_name: 'Transport', is_shared: true, share_percentage: 40 } }),
      });

      const { result } = renderHook(() => useBudgetSharing(), {
        wrapper: createWrapper(),
      });

      await act(async () => {
        await result.current.setCategoryShare('Transport', true, 40);
      });

      expect(result.current.categoryShares.get('Transport')).toEqual({
        isShared: true,
        sharePercentage: 40,
      });
    });

    it('should rollback on error', async () => {
      (fetch as any).mockResolvedValueOnce({
        ok: false,
        json: async () => ({ error: 'Failed to save' }),
      });

      const { result } = renderHook(() => useBudgetSharing(), {
        wrapper: createWrapper(),
      });

      const initialSize = result.current.categoryShares.size;

      await expect(async () => {
        await act(async () => {
          await result.current.setCategoryShare('Transport', true, 40);
        });
      }).rejects.toThrow();

      // Should rollback - size should be the same
      expect(result.current.categoryShares.size).toBe(initialSize);
      expect(result.current.categoryShares.has('Transport')).toBe(false);
    });
  });

  describe('removeCategoryShare', () => {
    it('should optimistically remove category share', async () => {
      (fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true }),
      });

      const { result } = renderHook(() => useBudgetSharing(), {
        wrapper: createWrapper(),
      });

      expect(result.current.categoryShares.has('Groceries')).toBe(true);

      await act(async () => {
        await result.current.removeCategoryShare('Groceries');
      });

      expect(result.current.categoryShares.has('Groceries')).toBe(false);
    });

    it('should rollback on error', async () => {
      (fetch as any).mockResolvedValueOnce({
        ok: false,
        json: async () => ({ error: 'Failed to delete' }),
      });

      const { result } = renderHook(() => useBudgetSharing(), {
        wrapper: createWrapper(),
      });

      await expect(async () => {
        await act(async () => {
          await result.current.removeCategoryShare('Groceries');
        });
      }).rejects.toThrow();

      // Should rollback - Groceries should still exist
      expect(result.current.categoryShares.has('Groceries')).toBe(true);
    });
  });

  describe('setExpenseSplit', () => {
    it('should optimistically update expense split', async () => {
      (fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true }),
      });

      const { result } = renderHook(() => useBudgetSharing(), {
        wrapper: createWrapper(),
      });

      await act(async () => {
        await result.current.setExpenseSplit('expense:new-expense', 'custom', 60);
      });

      expect(result.current.expenseSplits.get('expense:new-expense')).toEqual({
        splitType: 'custom',
        ownerPercentage: 60,
      });
    });

    it('should parse key correctly for category splits', async () => {
      (fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true }),
      });

      const { result } = renderHook(() => useBudgetSharing(), {
        wrapper: createWrapper(),
      });

      await act(async () => {
        await result.current.setExpenseSplit('category:Food', 'equal', 50);
      });

      expect(fetch).toHaveBeenCalledWith(
        '/api/budget/splits',
        expect.objectContaining({
          method: 'POST',
          body: expect.stringContaining('"category_name":"Food"'),
        })
      );
    });
  });

  describe('setTransactionOverride', () => {
    it('should optimistically update transaction override', async () => {
      (fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ override: { transaction_id: 'txn-3', is_shared: true, share_percentage: 80 } }),
      });

      const { result } = renderHook(() => useBudgetSharing(), {
        wrapper: createWrapper(),
      });

      await act(async () => {
        await result.current.setTransactionOverride('txn-3', true, 80);
      });

      expect(result.current.transactionOverrides.get('txn-3')).toEqual({
        isShared: true,
        sharePercentage: 80,
      });
    });

    it('should rollback on error', async () => {
      (fetch as any).mockResolvedValueOnce({
        ok: false,
        json: async () => ({ error: 'Failed to save' }),
      });

      const { result } = renderHook(() => useBudgetSharing(), {
        wrapper: createWrapper(),
      });

      const initialSize = result.current.transactionOverrides.size;

      await expect(async () => {
        await act(async () => {
          await result.current.setTransactionOverride('txn-3', true, 80);
        });
      }).rejects.toThrow();

      // Should rollback
      expect(result.current.transactionOverrides.size).toBe(initialSize);
      expect(result.current.transactionOverrides.has('txn-3')).toBe(false);
    });
  });

  describe('removeTransactionOverride', () => {
    it('should optimistically remove transaction override', async () => {
      (fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true }),
      });

      const { result } = renderHook(() => useBudgetSharing(), {
        wrapper: createWrapper(),
      });

      expect(result.current.transactionOverrides.has('txn-1')).toBe(true);

      await act(async () => {
        await result.current.removeTransactionOverride('txn-1');
      });

      expect(result.current.transactionOverrides.has('txn-1')).toBe(false);
    });
  });

  describe('refresh', () => {
    it('should reload all data', async () => {
      (fetch as any)
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ shares: mockCategoryShares }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ settings: mockSplitSettings }),
        });

      const { result } = renderHook(() => useBudgetSharing(), {
        wrapper: createWrapper(),
      });

      await act(async () => {
        await result.current.refresh();
      });

      // Should have called both APIs
      expect(fetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/budget/shares/categories')
      );
      expect(fetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/budget/splits')
      );
    });
  });

  describe('error handling', () => {
    it('should set error state on fetch failure', async () => {
      (fetch as any).mockResolvedValueOnce({
        ok: false,
        json: async () => ({ error: 'Server error' }),
      });

      const { result } = renderHook(() => useBudgetSharing(), {
        wrapper: createWrapper(mockPartnershipId, [], mockSplitSettings, mockTransactionOverrides),
      });

      await waitFor(() => {
        expect(result.current.error).toBe('Failed to load category shares');
      });
    });
  });

  describe('hook usage', () => {
    it('should throw error when used outside provider', () => {
      // Suppress console.error for this test
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      expect(() => {
        renderHook(() => useBudgetSharing());
      }).toThrow('useBudgetSharing must be used within BudgetSharingProvider');

      consoleSpy.mockRestore();
    });
  });
});
