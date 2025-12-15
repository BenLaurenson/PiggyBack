"use client";

import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from "react";
import {
  CategoryShareConfig,
  TransactionOverride,
  ShareConfig,
} from "@/lib/shared-budget-calculations";

/**
 * Split configuration for expenses
 */
export interface SplitConfig {
  splitType: 'equal' | 'custom' | 'individual-owner' | 'individual-partner';
  ownerPercentage: number; // 0-100
}

/**
 * Category share configuration (internal state representation)
 */
interface CategoryShareState {
  isShared: boolean;
  sharePercentage: number; // 0-100, user's share
}

/**
 * Transaction override configuration (internal state representation)
 */
interface TransactionOverrideState {
  isShared: boolean;
  sharePercentage: number; // 0-100, user's share
}

/**
 * Context value provided to consumers
 */
interface BudgetSharingContextValue {
  // State
  categoryShares: Map<string, CategoryShareState>;
  expenseSplits: Map<string, SplitConfig>;
  transactionOverrides: Map<string, TransactionOverrideState>;
  loading: boolean;
  saving: boolean;
  error: string | null;

  // CRUD operations for category shares
  setCategoryShare(category: string, isShared: boolean, sharePercentage: number): Promise<void>;
  removeCategoryShare(category: string): Promise<void>;

  // CRUD operations for expense splits
  setExpenseSplit(key: string, splitType: string, ownerPercentage: number): Promise<void>;
  removeExpenseSplit(id: string): Promise<void>;

  // CRUD operations for transaction overrides
  setTransactionOverride(txnId: string, isShared: boolean, sharePercentage: number): Promise<void>;
  removeTransactionOverride(txnId: string): Promise<void>;

  // Helper
  buildShareConfig(): ShareConfig;
  refresh(): Promise<void>;
}

const BudgetSharingContext = createContext<BudgetSharingContextValue | undefined>(undefined);

/**
 * Props for BudgetSharingProvider
 */
interface BudgetSharingProviderProps {
  children: ReactNode;
  partnershipId: string;

  // SSR-friendly initialization - skip fetch if provided
  initialCategoryShares?: Array<{
    category_name: string;
    is_shared: boolean;
    share_percentage: number;
  }>;
  initialSplitSettings?: Array<{
    expense_definition_id?: string;
    category_name?: string;
    split_type: string;
    owner_percentage?: number;
  }>;
  initialTransactionOverrides?: Array<{
    transaction_id: string;
    is_shared: boolean;
    share_percentage: number;
  }>;
}

/**
 * BudgetSharingProvider - Manages share/split state for household budgets
 *
 * Features:
 * - SSR-friendly initialization from server props
 * - Optimistic updates with rollback on error
 * - Separate state management for category shares, expense splits, and transaction overrides
 * - Helper to build ShareConfig for use in calculations
 *
 * @example
 * ```tsx
 * <BudgetSharingProvider
 *   partnershipId={partnershipId}
 *   initialCategoryShares={categoryShares}
 * >
 *   <BudgetTable />
 * </BudgetSharingProvider>
 * ```
 */
export function BudgetSharingProvider({
  children,
  partnershipId,
  initialCategoryShares = [],
  initialSplitSettings = [],
  initialTransactionOverrides = [],
}: BudgetSharingProviderProps) {

  // Initialize category shares from server data to prevent flash
  const [categoryShares, setCategoryShares] = useState<Map<string, CategoryShareState>>(() => {
    const map = new Map<string, CategoryShareState>();
    initialCategoryShares.forEach(s => {
      map.set(s.category_name, {
        isShared: s.is_shared,
        sharePercentage: s.share_percentage,
      });
    });
    return map;
  });

  // Initialize expense splits from server data
  const [expenseSplits, setExpenseSplits] = useState<Map<string, SplitConfig>>(() => {
    const map = new Map<string, SplitConfig>();
    initialSplitSettings.forEach(s => {
      // Determine key based on what's provided
      let key: string;
      if (s.expense_definition_id) {
        key = `expense:${s.expense_definition_id}`;
      } else if (s.category_name) {
        key = `category:${s.category_name}`;
      } else {
        key = 'default';
      }

      map.set(key, {
        splitType: s.split_type as SplitConfig['splitType'],
        ownerPercentage: s.owner_percentage ?? 50,
      });
    });
    return map;
  });

  // Initialize transaction overrides from server data
  const [transactionOverrides, setTransactionOverrides] = useState<Map<string, TransactionOverrideState>>(() => {
    const map = new Map<string, TransactionOverrideState>();
    initialTransactionOverrides.forEach(o => {
      map.set(o.transaction_id, {
        isShared: o.is_shared,
        sharePercentage: o.share_percentage,
      });
    });
    return map;
  });

  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Track if we've initialized from server (don't fetch if we have initial data)
  const [hasInitializedCategoryShares] = useState(initialCategoryShares.length > 0);
  const [hasInitializedSplits] = useState(initialSplitSettings.length > 0);
  const [hasInitializedOverrides] = useState(initialTransactionOverrides.length > 0);

  /**
   * Load category shares from API
   */
  const loadCategoryShares = useCallback(async () => {
    if (!partnershipId) return;

    setLoading(true);
    setError(null);

    try {
      const response = await fetch(`/api/budget/shares/categories?partnership_id=${partnershipId}`);

      if (!response.ok) {
        throw new Error('Failed to load category shares');
      }

      const data = await response.json();
      const sharesMap = new Map<string, CategoryShareState>();

      data.shares?.forEach((s: { category_name: string; is_shared: boolean; share_percentage: number }) => {
        sharesMap.set(s.category_name, {
          isShared: s.is_shared,
          sharePercentage: s.share_percentage,
        });
      });

      setCategoryShares(sharesMap);
    } catch (err: any) {
      console.error('Failed to load category shares:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [partnershipId]);

  /**
   * Load expense splits from API
   */
  const loadExpenseSplits = useCallback(async () => {
    if (!partnershipId) return;

    setLoading(true);
    setError(null);

    try {
      const response = await fetch(`/api/budget/splits?partnership_id=${partnershipId}`);

      if (!response.ok) {
        throw new Error('Failed to load expense splits');
      }

      const data = await response.json();
      const splitsMap = new Map<string, SplitConfig>();

      data.settings?.forEach((s: {
        expense_definition_id?: string;
        category_name?: string;
        split_type: string;
        owner_percentage?: number;
      }) => {
        let key: string;
        if (s.expense_definition_id) {
          key = `expense:${s.expense_definition_id}`;
        } else if (s.category_name) {
          key = `category:${s.category_name}`;
        } else {
          key = 'default';
        }

        splitsMap.set(key, {
          splitType: s.split_type as SplitConfig['splitType'],
          ownerPercentage: s.owner_percentage ?? 50,
        });
      });

      setExpenseSplits(splitsMap);
    } catch (err: any) {
      console.error('Failed to load expense splits:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [partnershipId]);

  /**
   * Load transaction overrides from API
   *
   * Note: The transaction overrides API is designed to fetch individual overrides,
   * not all overrides at once. For now, we skip bulk loading and rely on
   * server-provided initial data. Individual overrides can be queried on-demand.
   */
  const loadTransactionOverrides = useCallback(async () => {
    // Transaction overrides are loaded individually, not in bulk
    // Skip this step - rely on initialTransactionOverrides from server
  }, []);

  /**
   * Load category shares on mount (skip if initialized from props)
   */
  useEffect(() => {
    if (!hasInitializedCategoryShares) {
      loadCategoryShares();
    }
  }, [hasInitializedCategoryShares, loadCategoryShares]);

  /**
   * Load expense splits on mount (skip if initialized from props)
   */
  useEffect(() => {
    if (!hasInitializedSplits) {
      loadExpenseSplits();
    }
  }, [hasInitializedSplits, loadExpenseSplits]);

  /**
   * Load transaction overrides on mount (skip if initialized from props)
   */
  useEffect(() => {
    if (!hasInitializedOverrides) {
      loadTransactionOverrides();
    }
  }, [hasInitializedOverrides, loadTransactionOverrides]);

  /**
   * Set category share configuration (optimistic update with rollback)
   *
   * @param category - Category name
   * @param isShared - Whether category is shared
   * @param sharePercentage - User's share percentage (0-100)
   */
  const setCategoryShareFn = useCallback(async (
    category: string,
    isShared: boolean,
    sharePercentage: number
  ) => {
    // Optimistic update
    const previousShares = new Map(categoryShares);
    const newShares = new Map(categoryShares);
    newShares.set(category, { isShared, sharePercentage });
    setCategoryShares(newShares);

    setSaving(true);
    setError(null);

    try {
      const response = await fetch('/api/budget/shares/categories', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          partnership_id: partnershipId,
          category_name: category,
          is_shared: isShared,
          share_percentage: sharePercentage,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to save category share');
      }

    } catch (err: any) {
      console.error('Failed to save category share:', err);
      setError(err.message);
      // Rollback on error
      setCategoryShares(previousShares);
      throw err;
    } finally {
      setSaving(false);
    }
  }, [categoryShares, partnershipId]);

  /**
   * Remove category share configuration (revert to default)
   *
   * @param category - Category name
   */
  const removeCategoryShareFn = useCallback(async (category: string) => {
    // Optimistic update
    const previousShares = new Map(categoryShares);
    const newShares = new Map(categoryShares);
    newShares.delete(category);
    setCategoryShares(newShares);

    setSaving(true);
    setError(null);

    try {
      const response = await fetch(
        `/api/budget/shares/categories?partnership_id=${partnershipId}&category_name=${encodeURIComponent(category)}`,
        { method: 'DELETE' }
      );

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to remove category share');
      }

    } catch (err: any) {
      console.error('Failed to remove category share:', err);
      setError(err.message);
      // Rollback on error
      setCategoryShares(previousShares);
      throw err;
    } finally {
      setSaving(false);
    }
  }, [categoryShares, partnershipId]);

  /**
   * Set expense split configuration (optimistic update with rollback)
   *
   * @param key - Split key (e.g., 'expense:123', 'category:Food', 'default')
   * @param splitType - Split type
   * @param ownerPercentage - Owner's percentage (0-100)
   */
  const setExpenseSplitFn = useCallback(async (
    key: string,
    splitType: string,
    ownerPercentage: number
  ) => {
    // Optimistic update
    const previousSplits = new Map(expenseSplits);
    const newSplits = new Map(expenseSplits);
    newSplits.set(key, {
      splitType: splitType as SplitConfig['splitType'],
      ownerPercentage,
    });
    setExpenseSplits(newSplits);

    setSaving(true);
    setError(null);

    try {
      // Parse key to determine what kind of split this is
      let expense_definition_id: string | undefined;
      let category_name: string | undefined;

      if (key.startsWith('expense:')) {
        expense_definition_id = key.substring('expense:'.length);
      } else if (key.startsWith('category:')) {
        category_name = key.substring('category:'.length);
      }
      // 'default' key means no expense_definition_id or category_name

      const response = await fetch('/api/budget/splits', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          partnership_id: partnershipId,
          expense_definition_id,
          category_name,
          split_type: splitType,
          owner_percentage: ownerPercentage,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to save expense split');
      }

    } catch (err: any) {
      console.error('Failed to save expense split:', err);
      setError(err.message);
      // Rollback on error
      setExpenseSplits(previousSplits);
      throw err;
    } finally {
      setSaving(false);
    }
  }, [expenseSplits, partnershipId]);

  /**
   * Remove expense split configuration (revert to default)
   *
   * @param id - Split setting ID from database
   */
  const removeExpenseSplitFn = useCallback(async (id: string) => {
    // Note: We can't do optimistic delete without knowing which key corresponds to this ID
    // The caller should handle local state update if needed
    setSaving(true);
    setError(null);

    try {
      const response = await fetch(`/api/budget/splits?id=${id}`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to remove expense split');
      }

      // Refresh splits to get accurate state
      await loadExpenseSplits();
    } catch (err: any) {
      console.error('Failed to remove expense split:', err);
      setError(err.message);
      throw err;
    } finally {
      setSaving(false);
    }
  }, [loadExpenseSplits]);

  /**
   * Set transaction override configuration (optimistic update with rollback)
   *
   * @param txnId - Transaction ID
   * @param isShared - Whether transaction is shared
   * @param sharePercentage - User's share percentage (0-100)
   */
  const setTransactionOverrideFn = useCallback(async (
    txnId: string,
    isShared: boolean,
    sharePercentage: number
  ) => {
    // Optimistic update
    const previousOverrides = new Map(transactionOverrides);
    const newOverrides = new Map(transactionOverrides);
    newOverrides.set(txnId, { isShared, sharePercentage });
    setTransactionOverrides(newOverrides);

    setSaving(true);
    setError(null);

    try {
      const response = await fetch('/api/budget/transaction-overrides', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          partnership_id: partnershipId,
          transaction_id: txnId,
          is_shared: isShared,
          share_percentage: sharePercentage,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to save transaction override');
      }

    } catch (err: any) {
      console.error('Failed to save transaction override:', err);
      setError(err.message);
      // Rollback on error
      setTransactionOverrides(previousOverrides);
      throw err;
    } finally {
      setSaving(false);
    }
  }, [transactionOverrides, partnershipId]);

  /**
   * Remove transaction override configuration (revert to category default)
   *
   * @param txnId - Transaction ID
   */
  const removeTransactionOverrideFn = useCallback(async (txnId: string) => {
    // Optimistic update
    const previousOverrides = new Map(transactionOverrides);
    const newOverrides = new Map(transactionOverrides);
    newOverrides.delete(txnId);
    setTransactionOverrides(newOverrides);

    setSaving(true);
    setError(null);

    try {
      const response = await fetch(
        `/api/budget/transaction-overrides?partnership_id=${partnershipId}&transaction_id=${txnId}`,
        { method: 'DELETE' }
      );

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to remove transaction override');
      }

    } catch (err: any) {
      console.error('Failed to remove transaction override:', err);
      setError(err.message);
      // Rollback on error
      setTransactionOverrides(previousOverrides);
      throw err;
    } finally {
      setSaving(false);
    }
  }, [transactionOverrides, partnershipId]);

  /**
   * Build ShareConfig for use in shared-budget-calculations
   *
   * @returns ShareConfig object with Maps for category shares and transaction overrides
   */
  const buildShareConfigFn = useCallback((): ShareConfig => {
    const categorySharesMap = new Map<string, CategoryShareConfig>();
    categoryShares.forEach((config, categoryName) => {
      categorySharesMap.set(categoryName, {
        categoryName,
        isShared: config.isShared,
        sharePercentage: config.sharePercentage,
      });
    });

    const transactionOverridesMap = new Map<string, TransactionOverride>();
    transactionOverrides.forEach((config, txnId) => {
      transactionOverridesMap.set(txnId, {
        transactionId: txnId,
        isShared: config.isShared,
        sharePercentage: config.sharePercentage,
      });
    });

    return {
      categoryShares: categorySharesMap,
      transactionOverrides: transactionOverridesMap,
    };
  }, [categoryShares, transactionOverrides]);

  /**
   * Refresh all sharing/splitting data from API
   */
  const refresh = useCallback(async () => {
    await Promise.all([
      loadCategoryShares(),
      loadExpenseSplits(),
      loadTransactionOverrides(),
    ]);
  }, [loadCategoryShares, loadExpenseSplits, loadTransactionOverrides]);

  const value: BudgetSharingContextValue = {
    categoryShares,
    expenseSplits,
    transactionOverrides,
    loading,
    saving,
    error,

    setCategoryShare: setCategoryShareFn,
    removeCategoryShare: removeCategoryShareFn,
    setExpenseSplit: setExpenseSplitFn,
    removeExpenseSplit: removeExpenseSplitFn,
    setTransactionOverride: setTransactionOverrideFn,
    removeTransactionOverride: removeTransactionOverrideFn,

    buildShareConfig: buildShareConfigFn,
    refresh,
  };

  return (
    <BudgetSharingContext.Provider value={value}>
      {children}
    </BudgetSharingContext.Provider>
  );
}

/**
 * Hook to access BudgetSharingContext
 *
 * @throws Error if used outside BudgetSharingProvider
 *
 * @example
 * ```tsx
 * function MyComponent() {
 *   const { categoryShares, setCategoryShare } = useBudgetSharing();
 *
 *   const handleToggle = async () => {
 *     await setCategoryShare('Food', true, 50);
 *   };
 *
 *   return <button onClick={handleToggle}>Toggle</button>;
 * }
 * ```
 */
export function useBudgetSharing() {
  const context = useContext(BudgetSharingContext);
  if (!context) {
    throw new Error('useBudgetSharing must be used within BudgetSharingProvider');
  }
  return context;
}
