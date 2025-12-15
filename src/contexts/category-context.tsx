"use client";

import { createContext, useContext, useMemo, ReactNode } from "react";

export interface CategoryMapping {
  upCategoryId: string;
  newParentName: string;
  newChildName: string;
  icon: string;
  displayOrder: number;
}

interface CategoryContextValue {
  mappings: Map<string, CategoryMapping>;
  getMappedCategory: (upCategoryId: string | null) => CategoryMapping | null;
  getModernDisplayName: (upCategoryId: string | null, upParentId: string | null) => string;
  getIcon: (upCategoryId: string | null) => string;
  getUpIdsForModernParent: (modernParentName: string) => string[];
  getChildrenForParent: (modernParentName: string) => CategoryMapping[];
}

const CategoryContext = createContext<CategoryContextValue | null>(null);

interface CategoryProviderProps {
  mappings: CategoryMapping[];
  children: ReactNode;
}

export function CategoryProvider({ mappings, children }: CategoryProviderProps) {
  const value = useMemo<CategoryContextValue>(() => {
    // Create fast lookup map
    const mappingMap = new Map(
      mappings.map(m => [m.upCategoryId, m])
    );

    return {
      mappings: mappingMap,

      getMappedCategory: (upCategoryId: string | null) => {
        if (!upCategoryId) return null;
        return mappingMap.get(upCategoryId) || null;
      },

      getModernDisplayName: (upCategoryId: string | null, upParentId: string | null) => {
        if (!upCategoryId) return "";

        const mapping = mappingMap.get(upCategoryId);
        if (mapping) {
          return `${mapping.newParentName} › ${mapping.newChildName}`;
        }

        // Fallback to original UP Bank name (shouldn't happen with complete mapping)
        return "";
      },

      getIcon: (upCategoryId: string | null) => {
        if (!upCategoryId) return "💸";

        const mapping = mappingMap.get(upCategoryId);
        return mapping?.icon || "💸";
      },

      getUpIdsForModernParent: (modernParentName: string) => {
        return Array.from(mappingMap.values())
          .filter(m => m.newParentName === modernParentName)
          .map(m => m.upCategoryId);
      },

      getChildrenForParent: (modernParentName: string) => {
        return Array.from(mappingMap.values())
          .filter(m => m.newParentName === modernParentName)
          .sort((a, b) => a.displayOrder - b.displayOrder);
      },
    };
  }, [mappings]);

  return (
    <CategoryContext.Provider value={value}>
      {children}
    </CategoryContext.Provider>
  );
}

export function useCategoryMapping() {
  const context = useContext(CategoryContext);
  if (!context) {
    throw new Error("useCategoryMapping must be used within CategoryProvider");
  }
  return context;
}

// Helper to get grouped modern categories for dropdowns
export function useModernCategories() {
  const { mappings } = useCategoryMapping();

  return useMemo(() => {
    const grouped = new Map<string, CategoryMapping[]>();

    mappings.forEach((mapping) => {
      const parent = mapping.newParentName;
      if (!grouped.has(parent)) {
        grouped.set(parent, []);
      }
      grouped.get(parent)!.push(mapping);
    });

    // Sort by display order
    grouped.forEach((children) => {
      children.sort((a, b) => a.displayOrder - b.displayOrder);
    });

    return Array.from(grouped.entries())
      .sort(([, a], [, b]) => a[0].displayOrder - b[0].displayOrder);
  }, [mappings]);
}
