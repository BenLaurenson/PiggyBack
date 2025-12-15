"use client";

import { useState, useEffect, useCallback } from "react";
import { LayoutConfig, createDefaultLayoutConfig } from "@/lib/layout-persistence";

interface UseBudgetLayoutSettingsOptions {
  partnershipId: string;
  userId?: string;
  budgetId?: string;
  initialLayout?: LayoutConfig | null;
  budgetView?: 'individual' | 'shared';
}

interface UseBudgetLayoutSettingsResult {
  layout: LayoutConfig | null;
  loading: boolean;
  error: string | null;
  refresh: () => void;
}

/**
 * Hook to load budget layout settings for display purposes.
 * Used by the main budget table to apply user's layout preferences.
 */
export function useBudgetLayoutSettings({
  partnershipId,
  userId,
  budgetId,
  initialLayout,
  budgetView = 'shared',
}: UseBudgetLayoutSettingsOptions): UseBudgetLayoutSettingsResult {
  // Use initialLayout if provided (from server), otherwise null
  const [layout, setLayout] = useState<LayoutConfig | null>(initialLayout || null);
  // If we have an initial layout, we're not "loading"
  const [loading, setLoading] = useState(!initialLayout);
  const [error, setError] = useState<string | null>(null);

  // Track which view the initialLayout was for
  const [initialLayoutView] = useState(budgetView);

  const loadLayout = useCallback(async () => {
    if (!partnershipId || !userId) {
      // Only use default if no initial layout was provided
      if (!initialLayout) {
        setLayout(createDefaultLayoutConfig());
      }
      setLoading(false);
      return;
    }

    // If we have an initialLayout and we're on the same view it was loaded for, use it
    if (initialLayout && budgetView === initialLayoutView) {
      setLayout(initialLayout);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams({
        partnership_id: partnershipId,
        user_id: userId,
        budget_view: budgetView,
      });
      if (budgetId) params.set("budget_id", budgetId);

      const response = await fetch(`/api/budget/layout?${params}`);

      if (!response.ok) {
        // Log the actual error for debugging
        const errorData = await response.json().catch(() => ({}));
        console.error("Layout API error:", response.status, errorData);
        // Don't throw - just use default layout
        setLayout(createDefaultLayoutConfig());
        return;
      }

      const data = await response.json();

      if (data.layout?.layout_config) {
        setLayout(data.layout.layout_config);
      } else {
        // No layout saved for this view - use the initial layout as fallback
        // (it has NWS sections from server-side generation) rather than bare default
        setLayout(initialLayout || createDefaultLayoutConfig());
      }
    } catch (err: any) {
      console.error("Failed to load layout settings:", err);
      setError(err.message);
      setLayout(createDefaultLayoutConfig());
    } finally {
      setLoading(false);
    }
  }, [partnershipId, userId, budgetId, initialLayout, budgetView, initialLayoutView]);

  // Force-refresh from API, bypassing the initialLayout short-circuit
  const forceRefresh = useCallback(async () => {
    if (!partnershipId || !userId) return;

    try {
      const params = new URLSearchParams({
        partnership_id: partnershipId,
        user_id: userId,
        budget_view: budgetView,
      });
      if (budgetId) params.set("budget_id", budgetId);

      const response = await fetch(`/api/budget/layout?${params}`);
      if (!response.ok) return;

      const data = await response.json();
      if (data.layout?.layout_config) {
        setLayout(data.layout.layout_config);
      }
    } catch (err) {
      console.error("Failed to refresh layout:", err);
    }
  }, [partnershipId, userId, budgetId, budgetView]);

  useEffect(() => {
    // Skip initial fetch if we already have an initialLayout from server
    if (initialLayout && !userId) {
      return;
    }
    loadLayout();
  }, [loadLayout, initialLayout, userId]);

  return {
    layout,
    loading,
    error,
    refresh: forceRefresh,
  };
}
