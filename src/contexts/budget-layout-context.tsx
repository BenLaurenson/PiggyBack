"use client";

import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from "react";
import {
  BudgetLayoutPreset,
  LayoutConfig,
  Section,
  Column,
  createDefaultLayoutConfig,
  validateLayoutConfig,
  exportLayout,
  importLayout,
  generateItemId,
  parseItemId,
} from "@/lib/layout-persistence";

interface CustomColumn {
  id: string;
  name: string;
  formula: string;
  data_type: 'currency' | 'percentage' | 'number' | 'text';
  width: number;
  visible: boolean;
  display_order: number;
}

interface CustomTemplate {
  id: string;
  name: string;
  description?: string;
  layout_config: LayoutConfig;
  created_at: string;
  updated_at: string;
}

interface BudgetLayoutContextValue {
  // State
  activeLayout: BudgetLayoutPreset | null;
  sections: Section[];
  columns: Column[];
  customColumns: CustomColumn[];
  customTemplates: CustomTemplate[];
  hiddenItemIds: string[];
  density: 'compact' | 'comfortable' | 'spacious';
  groupBy: 'none' | 'methodology' | 'sections';
  loading: boolean;
  saving: boolean;
  isDirty: boolean;
  error: string | null;

  // Section operations
  addSection: (name: string, color: string) => void;
  renameSection: (id: string, name: string) => void;
  deleteSection: (id: string) => void;
  reorderSections: (newOrder: Section[]) => void;
  toggleSectionCollapse: (id: string) => void;
  moveItemToSection: (itemId: string, sectionId: string | null, index: number, sourceSectionId?: string | null) => void;
  moveItemsToSection: (itemIds: string[], sectionId: string | null, index: number, sourceSectionId?: string | null) => void;
  applyTemplateSections: (newSections: Section[], allItemIds?: string[], autoHideUnused?: boolean) => void;
  updateSectionPercentage: (id: string, percentage: number | undefined) => void;

  // Item visibility operations
  hideItem: (itemId: string, relatedSubcategoryIds?: string[]) => void;
  showItem: (itemId: string) => void;
  hideItems: (itemIds: string[]) => void;
  showItems: (itemIds: string[]) => void;
  isItemHidden: (itemId: string) => boolean;

  // Column operations
  toggleColumn: (columnId: string) => void;
  reorderColumns: (newOrder: Column[]) => void;
  resizeColumn: (columnId: string, width: number) => void;
  addCustomColumn: (name: string, formula: string, dataType: 'currency' | 'percentage' | 'number' | 'text') => Promise<void>;
  removeCustomColumn: (columnId: string) => Promise<void>;

  // Layout operations
  saveLayout: (name?: string) => Promise<void>;
  loadLayout: (layoutId: string) => Promise<void>;
  resetToDefault: () => Promise<void>;
  setDensity: (density: 'compact' | 'comfortable' | 'spacious') => void;
  setGroupBy: (groupBy: 'none' | 'methodology' | 'sections') => void;
  exportLayoutJSON: () => string;
  importLayoutJSON: (json: string) => boolean;

  // Custom template operations
  loadCustomTemplates: () => Promise<void>;
  saveAsTemplate: (name: string, description?: string) => Promise<void>;
  deleteCustomTemplate: (templateId: string) => Promise<void>;
  applyCustomTemplate: (templateId: string, allItemIds?: string[]) => Promise<void>;

  // Helpers
  getSectionItems: (sectionId: string) => string[];
  getUnsectionedItems: (allItemIds: string[]) => string[];
}

const BudgetLayoutContext = createContext<BudgetLayoutContextValue | undefined>(undefined);

interface BudgetLayoutProviderProps {
  children: ReactNode;
  partnershipId: string;
  userId: string;
  budgetId?: string;
  initialLayoutConfig?: LayoutConfig | null;
  budgetView?: 'individual' | 'shared';
  onLayoutSaved?: () => void;
}

export function BudgetLayoutProvider({
  children,
  partnershipId,
  userId,
  budgetId,
  initialLayoutConfig,
  budgetView = 'shared',
  onLayoutSaved,
}: BudgetLayoutProviderProps) {
  const [activeLayout, setActiveLayout] = useState<BudgetLayoutPreset | null>(null);
  // Initialize with server-provided layout if available
  const [sections, setSections] = useState<Section[]>(initialLayoutConfig?.sections || []);
  const [columns, setColumns] = useState<Column[]>(
    initialLayoutConfig?.columns?.length ? initialLayoutConfig.columns : createDefaultLayoutConfig().columns
  );
  const [customColumns, setCustomColumns] = useState<CustomColumn[]>([]);
  const [customTemplates, setCustomTemplates] = useState<CustomTemplate[]>([]);
  const [hiddenItemIds, setHiddenItemIds] = useState<string[]>(initialLayoutConfig?.hiddenItemIds || []);
  const [density, setDensityState] = useState<'compact' | 'comfortable' | 'spacious'>(initialLayoutConfig?.density || 'comfortable');
  const [groupBy, setGroupByState] = useState<'none' | 'methodology' | 'sections'>(initialLayoutConfig?.groupBy || 'none');
  // If initial layout provided, not loading
  const [loading, setLoading] = useState(!initialLayoutConfig);
  const [saving, setSaving] = useState(false);
  const [isDirty, setIsDirty] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Load active layout on mount (skip if we have initial layout)
  useEffect(() => {
    // Only load if we don't have initial layout already
    if (!initialLayoutConfig) {
      loadActiveLayout();
    }
    loadCustomColumns();
    loadCustomTemplatesFromAPI();
  }, [partnershipId, userId, initialLayoutConfig]);

  // Reload layout when budgetView changes
  useEffect(() => {
    // Skip on initial mount (handled above)
    if (initialLayoutConfig) return;
    loadActiveLayout();
  }, [budgetView]);

  const loadActiveLayout = async () => {
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
        throw new Error('Failed to load layout');
      }

      const data = await response.json();

      if (data.layout) {
        setActiveLayout(data.layout);
        setSections(data.layout.layout_config.sections || []);
        setColumns(data.layout.layout_config.columns || []);
        setHiddenItemIds(data.layout.layout_config.hiddenItemIds || []);
        setDensityState(data.layout.layout_config.density || 'comfortable');
        setGroupByState(data.layout.layout_config.groupBy || 'none');
      } else {
        // No layout exists, use defaults
        const defaultConfig = createDefaultLayoutConfig();
        setSections(defaultConfig.sections);
        setColumns(defaultConfig.columns);
        setHiddenItemIds(defaultConfig.hiddenItemIds);
        setDensityState(defaultConfig.density);
        setGroupByState(defaultConfig.groupBy);
      }

    } catch (err: any) {
      console.error('Failed to load layout:', err);
      setError(err.message);

      // Fall back to defaults on error
      const defaultConfig = createDefaultLayoutConfig();
      setSections(defaultConfig.sections);
      setColumns(defaultConfig.columns);
      setHiddenItemIds(defaultConfig.hiddenItemIds);
      setDensityState(defaultConfig.density);
      setGroupByState(defaultConfig.groupBy);

    } finally {
      setLoading(false);
    }
  };

  const loadCustomColumns = async () => {
    try {
      const params = new URLSearchParams({
        partnership_id: partnershipId,
        user_id: userId,
      });

      const response = await fetch(`/api/budget/columns?${params}`);

      if (response.ok) {
        const data = await response.json();
        setCustomColumns(data.columns || []);
      }
    } catch (err) {
      console.error('Failed to load custom columns:', err);
    }
  };

  const loadCustomTemplatesFromAPI = async () => {
    try {
      const params = new URLSearchParams({
        partnership_id: partnershipId,
        user_id: userId,
      });

      const response = await fetch(`/api/budget/templates?${params}`);

      if (response.ok) {
        const data = await response.json();
        setCustomTemplates(data.templates || []);
      }
    } catch (err) {
      console.error('Failed to load custom templates:', err);
    }
  };

  // Section operations
  const addSection = useCallback((name: string, color: string) => {
    const newSection: Section = {
      id: crypto.randomUUID(),
      name,
      itemIds: [],
      collapsed: false,
      color,
      displayOrder: sections.length,
    };

    setSections(prev => [...prev, newSection]);
    setIsDirty(true);
  }, [sections.length]);

  const renameSection = useCallback((id: string, name: string) => {
    setSections(prev =>
      prev.map(section =>
        section.id === id ? { ...section, name } : section
      )
    );
    setIsDirty(true);
  }, []);

  const updateSectionPercentage = useCallback((id: string, percentage: number | undefined) => {
    setSections(prev =>
      prev.map(section =>
        section.id === id ? { ...section, percentage } : section
      )
    );
    setIsDirty(true);
  }, []);

  const deleteSection = useCallback((id: string) => {
    setSections(prev => prev.filter(section => section.id !== id));
    setIsDirty(true);
  }, []);

  const reorderSections = useCallback((newOrder: Section[]) => {
    setSections(newOrder.map((section, index) => ({
      ...section,
      displayOrder: index,
    })));
    setIsDirty(true);
  }, []);

  const toggleSectionCollapse = useCallback((id: string) => {
    setSections(prev =>
      prev.map(section =>
        section.id === id ? { ...section, collapsed: !section.collapsed } : section
      )
    );
    setIsDirty(true);
  }, []);

  const moveItemToSection = useCallback((itemId: string, sectionId: string | null, index: number, sourceSectionId?: string | null) => {
    setSections(prev => {
      // Find original position if moving within the same section
      let originalIndex = -1;
      if (sourceSectionId === sectionId && sectionId) {
        const sourceSection = prev.find(s => s.id === sectionId);
        if (sourceSection) {
          originalIndex = sourceSection.itemIds.indexOf(itemId);
        }
      }

      // Remove item from all sections
      const updated = prev.map(section => ({
        ...section,
        itemIds: section.itemIds.filter(id => id !== itemId),
      }));

      // Add to target section
      if (sectionId) {
        const result = updated.map(section => {
          if (section.id === sectionId) {
            const newItemIds = [...section.itemIds];
            // Adjust index if we're moving within the same section and the item was before the target position
            let adjustedIndex = index;
            if (sourceSectionId === sectionId && originalIndex !== -1 && originalIndex < index) {
              // Item was removed from before target position, so target shifts down by 1
              adjustedIndex = Math.max(0, index);
            }
            newItemIds.splice(adjustedIndex, 0, itemId);
            return { ...section, itemIds: newItemIds };
          }
          return section;
        });
        return result;
      }

      return updated;
    });
    setIsDirty(true);
  }, []);

  // Move multiple items to a section (used for moving parent categories with their subcategories)
  const moveItemsToSection = useCallback((itemIds: string[], sectionId: string | null, index: number, sourceSectionId?: string | null) => {
    if (itemIds.length === 0) return;

    setSections(prev => {
      // Create a set for fast lookup
      const itemIdSet = new Set(itemIds);

      // Remove all items from all sections
      const updated = prev.map(section => ({
        ...section,
        itemIds: section.itemIds.filter(id => !itemIdSet.has(id)),
      }));

      // Add all items to target section at the specified index
      if (sectionId) {
        const result = updated.map(section => {
          if (section.id === sectionId) {
            const newItemIds = [...section.itemIds];
            // Insert all items at the index position, maintaining their order
            newItemIds.splice(index, 0, ...itemIds);
            return { ...section, itemIds: newItemIds };
          }
          return section;
        });
        return result;
      }

      // If no target section (moving to unsectioned), items just get removed from sections
      return updated;
    });
    setIsDirty(true);
  }, []);

  // Apply template sections (replaces all existing sections, optionally hides unused items)
  const applyTemplateSections = useCallback((
    newSections: Section[],
    allItemIds?: string[],
    autoHideUnused: boolean = true
  ) => {
    // Apply the new sections
    setSections(newSections);

    // Auto-hide items not in the template sections
    if (autoHideUnused && allItemIds && allItemIds.length > 0) {
      const templateItemIds = new Set(newSections.flatMap(s => s.itemIds));
      const itemsToHide = allItemIds.filter(id => !templateItemIds.has(id));

      setHiddenItemIds(itemsToHide);
    }

    setIsDirty(true);
  }, []);

  // Item visibility operations
  const hideItem = useCallback((itemId: string, relatedSubcategoryIds?: string[]) => {
    setHiddenItemIds(prev => {
      const newHidden = new Set(prev);
      newHidden.add(itemId);
      // If hiding a parent category, also hide related subcategories that haven't been moved elsewhere
      if (relatedSubcategoryIds && relatedSubcategoryIds.length > 0) {
        relatedSubcategoryIds.forEach(subId => newHidden.add(subId));
      }
      return Array.from(newHidden);
    });
    setIsDirty(true);
  }, []);

  const showItem = useCallback((itemId: string) => {
    setHiddenItemIds(prev => prev.filter(id => id !== itemId));
    setIsDirty(true);
  }, []);

  const hideItems = useCallback((itemIds: string[]) => {
    setHiddenItemIds(prev => {
      const newHidden = new Set(prev);
      itemIds.forEach(id => newHidden.add(id));
      return Array.from(newHidden);
    });
    setIsDirty(true);
  }, []);

  const showItems = useCallback((itemIds: string[]) => {
    setHiddenItemIds(prev => {
      const hiddenSet = new Set(prev);
      itemIds.forEach(id => hiddenSet.delete(id));
      return Array.from(hiddenSet);
    });
    setIsDirty(true);
  }, []);

  const isItemHidden = useCallback((itemId: string) => {
    return hiddenItemIds.includes(itemId);
  }, [hiddenItemIds]);

  // Column operations
  const toggleColumn = useCallback((columnId: string) => {
    setColumns(prev =>
      prev.map(col =>
        col.id === columnId ? { ...col, visible: !col.visible } : col
      )
    );
    setIsDirty(true);
  }, []);

  const reorderColumns = useCallback((newOrder: Column[]) => {
    setColumns(newOrder.map((col, index) => ({
      ...col,
      displayOrder: index,
    })));
    setIsDirty(true);
  }, []);

  const resizeColumn = useCallback((columnId: string, width: number) => {
    setColumns(prev =>
      prev.map(col =>
        col.id === columnId ? { ...col, width } : col
      )
    );
    setIsDirty(true);
  }, []);

  const addCustomColumn = useCallback(async (
    name: string,
    formula: string,
    dataType: 'currency' | 'percentage' | 'number' | 'text'
  ) => {
    try {
      const response = await fetch('/api/budget/columns', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          partnership_id: partnershipId,
          user_id: userId,
          name,
          formula,
          data_type: dataType,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to create column');
      }

      const data = await response.json();

      // Add to custom columns state
      setCustomColumns(prev => [...prev, data.column]);

      // Add to columns config
      const newColumn: Column = {
        id: data.column.id,
        name: data.column.name,
        visible: true,
        width: data.column.width,
        displayOrder: columns.length,
        formula: data.column.formula,
        isCustom: true,
      };

      setColumns(prev => [...prev, newColumn]);
      setIsDirty(true);

    } catch (err: any) {
      console.error('Failed to add custom column:', err);
      throw err;
    }
  }, [partnershipId, userId, columns.length]);

  const removeCustomColumn = useCallback(async (columnId: string) => {
    try {
      const response = await fetch(`/api/budget/columns/${columnId}`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        throw new Error('Failed to delete column');
      }

      // Remove from both states
      setCustomColumns(prev => prev.filter(col => col.id !== columnId));
      setColumns(prev => prev.filter(col => col.id !== columnId));
      setIsDirty(true);

    } catch (err: any) {
      console.error('Failed to remove custom column:', err);
      throw err;
    }
  }, []);

  // Layout operations
  const saveLayout = useCallback(async (name?: string) => {
    setSaving(true);
    setError(null);

    try {
      const layoutConfig: LayoutConfig = {
        sections,
        columns,
        density,
        groupBy,
        hiddenItemIds,
      };

      // Validate before saving
      const validation = validateLayoutConfig(layoutConfig);
      if (!validation.valid) {
        throw new Error(validation.error);
      }

      const response = await fetch('/api/budget/layout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          partnership_id: partnershipId,
          user_id: userId,
          name: name || activeLayout?.name || (budgetView === 'individual' ? 'My Budget Layout' : 'Our Budget Layout'),
          layout_config: layoutConfig,
          is_active: true,
          budget_view: budgetView,
          budget_id: budgetId,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to save layout');
      }

      const data = await response.json();
      setActiveLayout(data.layout);
      setIsDirty(false);
      onLayoutSaved?.();

    } catch (err: any) {
      console.error('Failed to save layout:', err);
      setError(err.message);
      throw err;

    } finally {
      setSaving(false);
    }
  }, [sections, columns, density, groupBy, hiddenItemIds, partnershipId, userId, budgetId, activeLayout, onLayoutSaved]);

  const loadLayout = useCallback(async (layoutId: string) => {
    setLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams({
        partnership_id: partnershipId,
        user_id: userId,
        layout_id: layoutId,
      });

      const response = await fetch(`/api/budget/layout?${params}`);

      if (!response.ok) {
        throw new Error('Failed to load layout');
      }

      const data = await response.json();

      setActiveLayout(data.layout);
      setSections(data.layout.layout_config.sections || []);
      setColumns(data.layout.layout_config.columns || []);
      setHiddenItemIds(data.layout.layout_config.hiddenItemIds || []);
      setDensityState(data.layout.layout_config.density || 'comfortable');
      setGroupByState(data.layout.layout_config.groupBy || 'none');
      setIsDirty(false);

    } catch (err: any) {
      console.error('Failed to load layout:', err);
      setError(err.message);
      throw err;

    } finally {
      setLoading(false);
    }
  }, [partnershipId, userId]);

  const resetToDefault = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      if (activeLayout) {
        // Delete active layout
        await fetch(`/api/budget/layout?layout_id=${activeLayout.id}`, {
          method: 'DELETE',
        });
      }

      // Reset to defaults
      const defaultConfig = createDefaultLayoutConfig();
      setSections(defaultConfig.sections);
      setColumns(defaultConfig.columns);
      setHiddenItemIds(defaultConfig.hiddenItemIds);
      setDensityState(defaultConfig.density);
      setGroupByState(defaultConfig.groupBy);
      setActiveLayout(null);
      setIsDirty(false);

    } catch (err: any) {
      console.error('Failed to reset layout:', err);
      setError(err.message);
      throw err;

    } finally {
      setLoading(false);
    }
  }, [activeLayout]);

  const setDensity = useCallback((newDensity: 'compact' | 'comfortable' | 'spacious') => {
    setDensityState(newDensity);
    setIsDirty(true);
  }, []);

  const setGroupBy = useCallback((newGroupBy: 'none' | 'methodology' | 'sections') => {
    setGroupByState(newGroupBy);
    setIsDirty(true);
  }, []);

  const exportLayoutJSON = useCallback(() => {
    if (!activeLayout) {
      const tempLayout: BudgetLayoutPreset = {
        id: 'temp',
        user_id: userId,
        partnership_id: partnershipId,
        name: 'Exported Layout',
        is_active: false,
        is_template: false,
        layout_config: { sections, columns, density, groupBy, hiddenItemIds },
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      return exportLayout(tempLayout);
    }
    return exportLayout(activeLayout);
  }, [activeLayout, sections, columns, density, groupBy, hiddenItemIds, userId, partnershipId]);

  const importLayoutJSON = useCallback((json: string) => {
    const result = importLayout(json);

    if (!result.valid) {
      setError(result.error || 'Invalid layout file');
      return false;
    }

    if (result.layout) {
      const config = result.layout.layout_config!;
      setSections(config.sections || []);
      setColumns(config.columns || []);
      setHiddenItemIds(config.hiddenItemIds || []);
      setDensityState(config.density || 'comfortable');
      setGroupByState(config.groupBy || 'none');
      setIsDirty(true);
    }

    return true;
  }, []);

  // Custom template operations
  const loadCustomTemplates = useCallback(async () => {
    await loadCustomTemplatesFromAPI();
  }, [partnershipId, userId]);

  const saveAsTemplate = useCallback(async (name: string, description?: string) => {
    setSaving(true);
    setError(null);

    try {
      const layoutConfig: LayoutConfig = {
        sections,
        columns,
        density,
        groupBy,
        hiddenItemIds,
      };

      const response = await fetch('/api/budget/templates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          partnership_id: partnershipId,
          user_id: userId,
          name,
          description,
          layout_config: layoutConfig,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to save template');
      }

      // Reload templates list
      await loadCustomTemplatesFromAPI();

    } catch (err: any) {
      console.error('Failed to save template:', err);
      setError(err.message);
      throw err;

    } finally {
      setSaving(false);
    }
  }, [sections, columns, density, groupBy, hiddenItemIds, partnershipId, userId]);

  const deleteCustomTemplate = useCallback(async (templateId: string) => {
    try {
      const response = await fetch(`/api/budget/templates?template_id=${templateId}`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to delete template');
      }

      // Remove from local state
      setCustomTemplates(prev => prev.filter(t => t.id !== templateId));

    } catch (err: any) {
      console.error('Failed to delete template:', err);
      setError(err.message);
      throw err;
    }
  }, []);

  const applyCustomTemplate = useCallback(async (templateId: string, allItemIds?: string[]) => {
    const template = customTemplates.find(t => t.id === templateId);
    if (!template) {
      setError('Template not found');
      return;
    }

    const config = template.layout_config;

    // Apply sections with auto-hide if allItemIds provided
    if (config.sections && config.sections.length > 0) {
      applyTemplateSections(config.sections, allItemIds, true);
    } else {
      setSections(config.sections || []);
    }

    // Apply other config
    if (config.columns) setColumns(config.columns);
    if (config.density) setDensityState(config.density);
    if (config.groupBy) setGroupByState(config.groupBy);

    setIsDirty(true);

  }, [customTemplates, applyTemplateSections]);

  // Helpers
  const getSectionItems = useCallback((sectionId: string) => {
    const section = sections.find(s => s.id === sectionId);
    return section?.itemIds || [];
  }, [sections]);

  const getUnsectionedItems = useCallback((allItemIds: string[]) => {
    const sectionedItemIds = new Set(
      sections.flatMap(section => section.itemIds)
    );
    return allItemIds.filter(id => !sectionedItemIds.has(id));
  }, [sections]);

  const value: BudgetLayoutContextValue = {
    activeLayout,
    sections,
    columns,
    customColumns,
    customTemplates,
    hiddenItemIds,
    density,
    groupBy,
    loading,
    saving,
    isDirty,
    error,

    addSection,
    renameSection,
    deleteSection,
    reorderSections,
    toggleSectionCollapse,
    moveItemToSection,
    moveItemsToSection,
    applyTemplateSections,
    updateSectionPercentage,

    hideItem,
    showItem,
    hideItems,
    showItems,
    isItemHidden,

    toggleColumn,
    reorderColumns,
    resizeColumn,
    addCustomColumn,
    removeCustomColumn,

    saveLayout,
    loadLayout,
    resetToDefault,
    setDensity,
    setGroupBy,
    exportLayoutJSON,
    importLayoutJSON,

    loadCustomTemplates,
    saveAsTemplate,
    deleteCustomTemplate,
    applyCustomTemplate,

    getSectionItems,
    getUnsectionedItems,
  };

  return (
    <BudgetLayoutContext.Provider value={value}>
      {children}
    </BudgetLayoutContext.Provider>
  );
}

export function useBudgetLayout() {
  const context = useContext(BudgetLayoutContext);
  if (!context) {
    throw new Error('useBudgetLayout must be used within BudgetLayoutProvider');
  }
  return context;
}
