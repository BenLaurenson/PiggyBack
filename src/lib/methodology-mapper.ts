/**
 * Budgeting Methodology Mapper
 * Maps UP Bank categories to different budgeting framework categories
 */

export type Methodology =
  | 'zero-based'
  | '50-30-20'
  | 'envelope'
  | 'pay-yourself-first'
  | '80-20';

export interface MethodologyCategory {
  name: string;
  percentage?: number;
  priority?: number;
  upBankCategories: string[];
  color?: string;
}

export const METHODOLOGY_MAPPINGS: Record<Methodology, MethodologyCategory[]> = {
  'zero-based': [
    // Uses existing 10 categories as-is
    { name: 'Food & Dining', upBankCategories: ['Food & Dining'] },
    { name: 'Housing & Utilities', upBankCategories: ['Housing & Utilities'] },
    { name: 'Transportation', upBankCategories: ['Transportation'] },
    { name: 'Entertainment & Leisure', upBankCategories: ['Entertainment & Leisure'] },
    { name: 'Personal Care & Health', upBankCategories: ['Personal Care & Health'] },
    { name: 'Technology & Communication', upBankCategories: ['Technology & Communication'] },
    { name: 'Family & Education', upBankCategories: ['Family & Education'] },
    { name: 'Financial & Admin', upBankCategories: ['Financial & Admin'] },
    { name: 'Pets', upBankCategories: ['Pets'] },
    { name: 'Gifts & Charity', upBankCategories: ['Gifts & Charity'] },
    { name: 'Miscellaneous', upBankCategories: ['Miscellaneous'] },
  ],

  '50-30-20': [
    {
      name: 'Needs (50%)',
      percentage: 50,
      upBankCategories: [
        'Food & Dining',
        'Housing & Utilities',
        'Transportation',
        'Technology & Communication'
      ],
      color: 'var(--pastel-coral)'
    },
    {
      name: 'Wants (30%)',
      percentage: 30,
      upBankCategories: [
        'Entertainment & Leisure',
        'Personal Care & Health',
        'Gifts & Charity',
        'Pets',
        'Miscellaneous'
      ],
      color: 'var(--pastel-yellow)'
    },
    {
      name: 'Savings (20%)',
      percentage: 20,
      upBankCategories: [
        'Financial & Admin',
        'Family & Education'
      ],
      color: 'var(--pastel-mint)'
    }
  ],

  'envelope': [
    // Same as zero-based but with strict limits
    { name: 'Food & Dining', upBankCategories: ['Food & Dining'] },
    { name: 'Housing & Utilities', upBankCategories: ['Housing & Utilities'] },
    { name: 'Transportation', upBankCategories: ['Transportation'] },
    { name: 'Entertainment & Leisure', upBankCategories: ['Entertainment & Leisure'] },
    { name: 'Personal Care & Health', upBankCategories: ['Personal Care & Health'] },
    { name: 'Technology & Communication', upBankCategories: ['Technology & Communication'] },
    { name: 'Family & Education', upBankCategories: ['Family & Education'] },
    { name: 'Financial & Admin', upBankCategories: ['Financial & Admin'] },
    { name: 'Pets', upBankCategories: ['Pets'] },
    { name: 'Gifts & Charity', upBankCategories: ['Gifts & Charity'] },
    { name: 'Miscellaneous', upBankCategories: ['Miscellaneous'] },
  ],

  'pay-yourself-first': [
    {
      name: 'Savings & Investments',
      priority: 1,
      percentage: 20,
      upBankCategories: ['Financial & Admin'],
      color: 'var(--pastel-mint)'
    },
    {
      name: 'Fixed Expenses',
      priority: 2,
      upBankCategories: [
        'Housing & Utilities',
        'Transportation',
        'Technology & Communication'
      ],
      color: 'var(--pastel-blue)'
    },
    {
      name: 'Variable Expenses',
      priority: 3,
      upBankCategories: [
        'Food & Dining',
        'Entertainment & Leisure',
        'Personal Care & Health',
        'Family & Education',
        'Gifts & Charity',
        'Pets',
        'Miscellaneous'
      ],
      color: 'var(--pastel-yellow)'
    }
  ],

  '80-20': [
    {
      name: 'Savings',
      percentage: 20,
      upBankCategories: ['Financial & Admin'],
      color: 'var(--pastel-mint)'
    },
    {
      name: 'Everything Else',
      percentage: 80,
      upBankCategories: [
        'Food & Dining',
        'Housing & Utilities',
        'Transportation',
        'Entertainment & Leisure',
        'Personal Care & Health',
        'Technology & Communication',
        'Family & Education',
        'Gifts & Charity',
        'Pets',
        'Miscellaneous'
      ],
      color: 'var(--pastel-blue)'
    }
  ]
};

/**
 * Represents a user customization of a methodology category.
 * Replaces the `any` type previously used in getMergedMethodology and validateMethodologyCustomizations.
 */
export interface MethodologyCustomization {
  originalName?: string;
  name: string;
  percentage?: number;
  underlyingCategories?: string[];
  color?: string;
  displayOrder?: number;
  isHidden?: boolean;
}

/**
 * Runtime field list for test verification.
 */
export const METHODOLOGY_CUSTOMIZATION_FIELDS = [
  'originalName',
  'name',
  'percentage',
  'underlyingCategories',
  'color',
  'displayOrder',
  'isHidden',
] as const;

/**
 * Merge preset methodology with user customizations
 * @param methodology - Preset methodology name
 * @param customCategories - User customizations from database
 * @returns Merged category array with customizations applied
 */
export function getMergedMethodology(
  methodology: Methodology,
  customCategories: MethodologyCustomization[] | null
): MethodologyCategory[] {
  const preset = METHODOLOGY_MAPPINGS[methodology];

  if (!customCategories || customCategories.length === 0) {
    return preset;  // No customizations
  }

  // Map preset with customizations
  const merged = preset.map(presetCat => {
    // Find matching customization by originalName
    const custom = customCategories.find(
      (c) => c.originalName === presetCat.name
    );

    if (!custom) return presetCat;  // No customization for this category

    // Merge customization with preset
    return {
      ...presetCat,
      name: custom.name || presetCat.name,
      percentage: custom.percentage ?? presetCat.percentage,
      upBankCategories: custom.underlyingCategories || presetCat.upBankCategories,
      color: custom.color || presetCat.color,
      displayOrder: custom.displayOrder ?? preset.indexOf(presetCat),
      isHidden: custom.isHidden || false,
      isCustomized: true,  // Flag for UI indicators
    };
  });

  // Sort by display order
  merged.sort((a, b) => {
    const aOrder = 'displayOrder' in a ? (a as { displayOrder?: number }).displayOrder ?? 0 : 0;
    const bOrder = 'displayOrder' in b ? (b as { displayOrder?: number }).displayOrder ?? 0 : 0;
    return aOrder - bOrder;
  });

  // Filter hidden categories
  return merged.filter((c) => !('isHidden' in c && (c as { isHidden?: boolean }).isHidden));
}

/**
 * Check if customizations are valid for a methodology
 * @param methodology - Methodology name
 * @param customCategories - Customizations to validate
 * @returns Error message if invalid, null if valid
 */
export function validateMethodologyCustomizations(
  methodology: Methodology,
  customCategories: MethodologyCustomization[]
): string | null {
  if (!customCategories || customCategories.length === 0) {
    return null;  // Empty is valid
  }

  // For percentage-based methodologies, ensure percentages sum to 100
  const percentageMethodologies: Methodology[] = ['50-30-20', 'pay-yourself-first', '80-20'];

  if (percentageMethodologies.includes(methodology)) {
    const total = customCategories
      .filter(c => !c.isHidden && c.percentage !== undefined)
      .reduce((sum, c) => sum + (c.percentage || 0), 0);

    if (Math.abs(total - 100) > 0.01) {  // Allow 0.01% rounding error
      return `Percentages must sum to 100% (currently ${total.toFixed(1)}%)`;
    }
  }

  // Ensure category names are unique
  const names = customCategories.map(c => c.name);
  const uniqueNames = new Set(names);
  if (names.length !== uniqueNames.size) {
    return 'Category names must be unique';
  }

  return null;
}
