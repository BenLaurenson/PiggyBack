/**
 * Layout Persistence Helpers
 * Functions for CRUD operations on budget layouts
 */

export interface BudgetLayoutPreset {
  id: string;
  user_id: string;
  partnership_id: string;
  name: string;
  description?: string;
  is_active: boolean;
  is_template: boolean;
  layout_config: LayoutConfig;
  created_at: string;
  updated_at: string;
}

export interface LayoutConfig {
  sections: Section[];
  columns: Column[];
  density: 'compact' | 'comfortable' | 'spacious';
  groupBy: 'none' | 'methodology' | 'sections';
  hiddenItemIds: string[];  // Items that are hidden from the budget view
}

export interface Section {
  id: string;
  name: string;
  itemIds: string[];  // Format: "cat-Name" | "goal-uuid" | "asset-uuid"
  collapsed: boolean;
  color: string;
  displayOrder: number;
  percentage?: number;  // Optional percentage target for income-based budgeting (e.g., 50 for 50%)
}

export interface Column {
  id: string;
  name: string;
  visible: boolean;
  width: number;
  displayOrder: number;
  locked?: boolean;
  formula?: string;
  isCustom?: boolean;
}

/**
 * Export layout as JSON
 */
export function exportLayout(layout: BudgetLayoutPreset): string {
  const exportData = {
    version: '1.0',
    name: layout.name,
    description: layout.description,
    layout_config: layout.layout_config,
    exported_at: new Date().toISOString(),
  };

  return JSON.stringify(exportData, null, 2);
}

/**
 * Import layout from JSON
 */
export function importLayout(json: string): {
  valid: boolean;
  layout?: Partial<BudgetLayoutPreset>;
  error?: string;
} {
  try {
    const data = JSON.parse(json);

    // Validate structure
    if (!data.layout_config) {
      return { valid: false, error: 'Invalid layout file: missing layout_config' };
    }

    if (!Array.isArray(data.layout_config.sections) || !Array.isArray(data.layout_config.columns)) {
      return { valid: false, error: 'Invalid layout file: sections and columns must be arrays' };
    }

    return {
      valid: true,
      layout: {
        name: data.name || 'Imported Layout',
        description: data.description,
        layout_config: data.layout_config,
      }
    };

  } catch (error: any) {
    return { valid: false, error: `Parse error: ${error.message}` };
  }
}

/**
 * Create default layout config
 */
export function createDefaultLayoutConfig(): LayoutConfig {
  return {
    sections: [],
    columns: [
      {
        id: 'item',
        name: 'Item',
        visible: true,
        width: 300,
        displayOrder: 0,
        locked: true,
      },
      {
        id: 'assigned',
        name: 'Assigned',
        visible: true,
        width: 120,
        displayOrder: 1,
      },
      {
        id: 'spent',
        name: 'Spent',
        visible: true,
        width: 120,
        displayOrder: 2,
      },
      {
        id: 'progress',
        name: 'Progress',
        visible: true,
        width: 150,
        displayOrder: 3,
      },
    ],
    density: 'comfortable',
    groupBy: 'none',
    hiddenItemIds: [],
  };
}

/**
 * Generate unique item ID for sections
 */
export function generateItemId(
  type: 'category' | 'subcategory' | 'goal' | 'asset',
  identifier: string,
  parentCategory?: string
): string {
  if (type === 'subcategory' && parentCategory) {
    return `subcategory-${parentCategory}::${identifier}`;
  }
  return `${type}-${identifier}`;
}

/**
 * Parse item ID to get type and identifier
 */
export function parseItemId(itemId: string): {
  type: 'category' | 'subcategory' | 'goal' | 'asset';
  identifier: string;
  parentCategory?: string;
} | null {
  const parts = itemId.split('-');
  if (parts.length < 2) return null;

  const type = parts[0] as 'category' | 'subcategory' | 'goal' | 'asset';
  const identifier = parts.slice(1).join('-');

  if (!['category', 'subcategory', 'goal', 'asset'].includes(type)) return null;

  // Handle subcategory with parent
  if (type === 'subcategory' && identifier.includes('::')) {
    const [parentCategory, subcatName] = identifier.split('::');
    return { type, identifier: subcatName, parentCategory };
  }

  return { type, identifier };
}

/**
 * Validate layout config structure
 */
export function validateLayoutConfig(config: any): {
  valid: boolean;
  error?: string;
} {
  if (!config || typeof config !== 'object') {
    return { valid: false, error: 'Layout config must be an object' };
  }

  if (!Array.isArray(config.sections)) {
    return { valid: false, error: 'Sections must be an array' };
  }

  if (!Array.isArray(config.columns)) {
    return { valid: false, error: 'Columns must be an array' };
  }

  // Check at least one column is visible
  const visibleColumns = config.columns.filter((c: Column) => c.visible);
  if (visibleColumns.length === 0) {
    return { valid: false, error: 'At least one column must be visible' };
  }

  // Check "item" column exists and is locked
  const itemColumn = config.columns.find((c: Column) => c.id === 'item');
  if (!itemColumn) {
    return { valid: false, error: 'Item column is required' };
  }
  if (!itemColumn.locked) {
    return { valid: false, error: 'Item column must be locked' };
  }

  // Check density is valid
  if (!['compact', 'comfortable', 'spacious'].includes(config.density)) {
    return { valid: false, error: 'Invalid density value' };
  }

  // Check groupBy is valid
  if (!['none', 'methodology', 'sections'].includes(config.groupBy)) {
    return { valid: false, error: 'Invalid groupBy value' };
  }

  return { valid: true };
}

/**
 * Get density spacing values
 */
export function getDensitySpacing(density: 'compact' | 'comfortable' | 'spacious') {
  switch (density) {
    case 'compact':
      return {
        rowPadding: 'py-2 px-3',
        rowGap: 'space-y-1',
        fontSize: 'text-sm',
      };
    case 'comfortable':
      return {
        rowPadding: 'py-3 px-4',
        rowGap: 'space-y-2',
        fontSize: 'text-base',
      };
    case 'spacious':
      return {
        rowPadding: 'py-4 px-6',
        rowGap: 'space-y-4',
        fontSize: 'text-lg',
      };
  }
}
