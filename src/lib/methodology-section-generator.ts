/**
 * Methodology Section Generator
 * Generates pre-configured sections based on budgeting methodology templates
 */

import { Section, generateItemId } from './layout-persistence';
import { CategoryMapping } from '@/contexts/category-context';

export type SectionTemplate = '50-30-20' | 'pay-yourself-first' | '80-20';

interface SubcategoryRef {
  parent: string;
  child: string;
}

interface TemplateSectionConfig {
  name: string;
  color: string;
  percentage?: number;
  subcategories: SubcategoryRef[];
}

export interface TemplateConfig {
  id: SectionTemplate;
  name: string;
  description: string;
  icon: string;
  sections: TemplateSectionConfig[];
}

// Template colors (hex values for Section system)
const TEMPLATE_COLORS = {
  coral: '#F87171',
  yellow: '#FBBF24',
  mint: '#34D399',
  blue: '#60A5FA',
};

/**
 * Built-in template configurations with explicit subcategory lists
 */
export const BUILT_IN_TEMPLATES: TemplateConfig[] = [
  {
    id: '50-30-20',
    name: '50-30-20',
    description: 'Needs, Wants, Savings',
    icon: '📊',
    sections: [
      {
        name: 'Needs',
        color: TEMPLATE_COLORS.coral,
        percentage: 50,
        subcategories: [
          // Food & Dining
          { parent: 'Food & Dining', child: 'Groceries' },
          // Housing & Utilities
          { parent: 'Housing & Utilities', child: 'Rent & Mortgage' },
          { parent: 'Housing & Utilities', child: 'Utilities' },
          { parent: 'Housing & Utilities', child: 'Internet' },
          { parent: 'Housing & Utilities', child: 'Rates & Insurance' },
          { parent: 'Housing & Utilities', child: 'Maintenance & Improvements' },
          // Transportation
          { parent: 'Transportation', child: 'Fuel' },
          { parent: 'Transportation', child: 'Public Transport' },
          { parent: 'Transportation', child: 'Parking' },
          { parent: 'Transportation', child: 'Tolls' },
          { parent: 'Transportation', child: 'Car Insurance, Rego & Maintenance' },
          { parent: 'Transportation', child: 'Vehicle Repayments' },
          // Technology & Communication
          { parent: 'Technology & Communication', child: 'Mobile Phone' },
          { parent: 'Technology & Communication', child: 'Technology' },
          // Personal Care & Health
          { parent: 'Personal Care & Health', child: 'Health & Medical' },
          // Family & Education
          { parent: 'Family & Education', child: 'Children & Family' },
          { parent: 'Family & Education', child: 'Education & Student Loans' },
          // Pets
          { parent: 'Pets', child: 'Pets' },
          // Financial & Admin (spending-related)
          { parent: 'Financial & Admin', child: 'External Transfers' },
        ],
      },
      {
        name: 'Wants',
        color: TEMPLATE_COLORS.yellow,
        percentage: 30,
        subcategories: [
          // Food & Dining
          { parent: 'Food & Dining', child: 'Restaurants & Cafes' },
          { parent: 'Food & Dining', child: 'Takeaway' },
          { parent: 'Food & Dining', child: 'Booze' },
          // Housing & Utilities
          { parent: 'Housing & Utilities', child: 'Homeware & Appliances' },
          // Transportation
          { parent: 'Transportation', child: 'Taxis & Share Cars' },
          { parent: 'Transportation', child: 'Cycling' },
          // Entertainment & Leisure
          { parent: 'Entertainment & Leisure', child: 'TV, Music & Streaming' },
          { parent: 'Entertainment & Leisure', child: 'Events & Gigs' },
          { parent: 'Entertainment & Leisure', child: 'Hobbies' },
          { parent: 'Entertainment & Leisure', child: 'Holidays & Travel' },
          { parent: 'Entertainment & Leisure', child: 'Pubs & Bars' },
          { parent: 'Entertainment & Leisure', child: 'Lottery & Gambling' },
          { parent: 'Entertainment & Leisure', child: 'Adult' },
          { parent: 'Entertainment & Leisure', child: 'Tobacco & Vaping' },
          { parent: 'Entertainment & Leisure', child: 'News, Magazines & Books' },
          { parent: 'Entertainment & Leisure', child: 'Apps, Games & Software' },
          // Personal Care & Health
          { parent: 'Personal Care & Health', child: 'Fitness & Wellbeing' },
          { parent: 'Personal Care & Health', child: 'Hair & Beauty' },
          { parent: 'Personal Care & Health', child: 'Clothing & Accessories' },
          // Gifts & Charity
          { parent: 'Gifts & Charity', child: 'Gifts & Charity' },
        ],
      },
      {
        name: 'Savings',
        color: TEMPLATE_COLORS.mint,
        percentage: 20,
        subcategories: [
          { parent: 'Financial & Admin', child: 'Investments' },
          { parent: 'Financial & Admin', child: 'Life Admin' },
          { parent: 'Financial & Admin', child: 'Round Up Savings' },
        ],
      },
    ],
  },
  {
    id: 'pay-yourself-first',
    name: 'Pay Yourself First',
    description: 'Savings, Fixed, Variable',
    icon: '💰',
    sections: [
      {
        name: 'Savings & Investments',
        color: TEMPLATE_COLORS.mint,
        subcategories: [
          { parent: 'Financial & Admin', child: 'Investments' },
          { parent: 'Financial & Admin', child: 'Life Admin' },
          { parent: 'Financial & Admin', child: 'Round Up Savings' },
        ],
      },
      {
        name: 'Fixed Expenses',
        color: TEMPLATE_COLORS.blue,
        subcategories: [
          { parent: 'Housing & Utilities', child: 'Rent & Mortgage' },
          { parent: 'Housing & Utilities', child: 'Utilities' },
          { parent: 'Housing & Utilities', child: 'Internet' },
          { parent: 'Technology & Communication', child: 'Mobile Phone' },
          { parent: 'Housing & Utilities', child: 'Rates & Insurance' },
          { parent: 'Financial & Admin', child: 'External Transfers' },
        ],
      },
      {
        name: 'Variable Expenses',
        color: TEMPLATE_COLORS.yellow,
        subcategories: [
          { parent: 'Food & Dining', child: 'Groceries' },
          { parent: 'Food & Dining', child: 'Restaurants & Cafes' },
          { parent: 'Transportation', child: 'Fuel' },
          { parent: 'Entertainment & Leisure', child: 'TV, Music & Streaming' },
          { parent: 'Personal Care & Health', child: 'Clothing & Accessories' },
        ],
      },
    ],
  },
  {
    id: '80-20',
    name: '80-20',
    description: 'Savings, Everything Else',
    icon: '📈',
    sections: [
      {
        name: 'Savings',
        color: TEMPLATE_COLORS.mint,
        percentage: 20,
        subcategories: [
          { parent: 'Financial & Admin', child: 'Investments' },
          { parent: 'Financial & Admin', child: 'Round Up Savings' },
        ],
      },
      {
        name: 'Spending',
        color: TEMPLATE_COLORS.blue,
        percentage: 80,
        subcategories: [
          { parent: 'Food & Dining', child: 'Groceries' },
          { parent: 'Housing & Utilities', child: 'Rent & Mortgage' },
          { parent: 'Housing & Utilities', child: 'Utilities' },
          { parent: 'Food & Dining', child: 'Restaurants & Cafes' },
          { parent: 'Entertainment & Leisure', child: 'TV, Music & Streaming' },
          { parent: 'Transportation', child: 'Fuel' },
          { parent: 'Financial & Admin', child: 'External Transfers' },
        ],
      },
    ],
  },
];

/**
 * Get template config by ID
 */
export function getTemplateConfig(templateId: SectionTemplate): TemplateConfig | undefined {
  return BUILT_IN_TEMPLATES.find(t => t.id === templateId);
}

/**
 * Check if a subcategory exists in the user's category mappings
 */
function subcategoryExists(
  categoryMappings: CategoryMapping[],
  parent: string,
  child: string
): boolean {
  return categoryMappings.some(
    m => m.newParentName === parent && m.newChildName === child
  );
}

/**
 * Generate sections from a template, using the user's category mappings
 * to validate that subcategories exist
 */
export function generateSectionsFromTemplate(
  templateId: SectionTemplate,
  categoryMappings: CategoryMapping[]
): Section[] {
  const template = getTemplateConfig(templateId);
  if (!template) {
    console.warn(`Unknown template: ${templateId}`);
    return [];
  }

  return template.sections.map((sectionConfig, index) => {
    // Filter to only subcategories that exist in user's mappings
    const validItemIds = sectionConfig.subcategories
      .filter(sub => subcategoryExists(categoryMappings, sub.parent, sub.child))
      .map(sub => generateItemId('subcategory', sub.child, sub.parent));

    return {
      id: crypto.randomUUID(),
      name: sectionConfig.name,
      itemIds: validItemIds,
      collapsed: false,
      color: sectionConfig.color,
      displayOrder: index,
      percentage: sectionConfig.percentage,
    };
  });
}

/**
 * Get all available built-in templates with their metadata
 */
export function getAvailableTemplates(): Pick<TemplateConfig, 'id' | 'name' | 'description' | 'icon'>[] {
  return BUILT_IN_TEMPLATES.map(({ id, name, description, icon }) => ({
    id,
    name,
    description,
    icon,
  }));
}

/**
 * Essential subcategories shown by default in the 50-30-20 template.
 * All other subcategories are hidden but will auto-show if they have spending.
 */
const ESSENTIAL_SUBCATEGORIES: SubcategoryRef[] = [
  // Needs essentials
  { parent: 'Food & Dining', child: 'Groceries' },
  { parent: 'Housing & Utilities', child: 'Rent & Mortgage' },
  { parent: 'Housing & Utilities', child: 'Utilities' },
  { parent: 'Housing & Utilities', child: 'Internet' },
  { parent: 'Housing & Utilities', child: 'Rates & Insurance' },
  { parent: 'Transportation', child: 'Fuel' },
  { parent: 'Transportation', child: 'Public Transport' },
  { parent: 'Technology & Communication', child: 'Mobile Phone' },
  { parent: 'Personal Care & Health', child: 'Health & Medical' },
  // Wants essentials
  { parent: 'Food & Dining', child: 'Restaurants & Cafes' },
  { parent: 'Food & Dining', child: 'Takeaway' },
  { parent: 'Entertainment & Leisure', child: 'TV, Music & Streaming' },
  { parent: 'Entertainment & Leisure', child: 'Hobbies' },
  { parent: 'Personal Care & Health', child: 'Clothing & Accessories' },
  // Savings essentials
  { parent: 'Financial & Admin', child: 'Investments' },
  { parent: 'Financial & Admin', child: 'Life Admin' },
];

/**
 * Subcategories that represent income or non-spending flows.
 * These are always hidden in the budget since the transaction query only
 * fetches spending (negative amounts without transfer_account_id).
 */
export const ALWAYS_HIDDEN_SUBCATEGORIES: SubcategoryRef[] = [
  { parent: 'Financial & Admin', child: 'Internal Transfers' },
  { parent: 'Financial & Admin', child: 'Salary & Income' },
  { parent: 'Financial & Admin', child: 'Interest Earned' },
  { parent: 'Financial & Admin', child: 'Round Up Savings' },
];

/**
 * Get the item IDs of non-essential subcategories that should be hidden by default.
 * Also always hides income/non-spending categories that will never show data in the budget.
 * Only returns IDs for subcategories that exist in the user's category mappings.
 */
export function getDefaultHiddenItemIds(
  categoryMappings: CategoryMapping[]
): string[] {
  const template = getTemplateConfig('50-30-20');
  if (!template) return [];

  // Collect all subcategories from the template
  const allTemplateSubs = template.sections.flatMap(s => s.subcategories);

  // Find non-essential ones (not in the essential list)
  const essentialSet = new Set(
    ESSENTIAL_SUBCATEGORIES.map(s => `${s.parent}::${s.child}`)
  );

  const nonEssentialIds = allTemplateSubs
    .filter(sub => !essentialSet.has(`${sub.parent}::${sub.child}`))
    .filter(sub => subcategoryExists(categoryMappings, sub.parent, sub.child))
    .map(sub => generateItemId('subcategory', sub.child, sub.parent));

  // Always hide income/non-spending categories
  const alwaysHiddenIds = ALWAYS_HIDDEN_SUBCATEGORIES
    .filter(sub => subcategoryExists(categoryMappings, sub.parent, sub.child))
    .map(sub => generateItemId('subcategory', sub.child, sub.parent));

  return [...nonEssentialIds, ...alwaysHiddenIds];
}

/**
 * Get item IDs for income/non-spending subcategories that should always be hidden.
 * Used to augment existing saved layouts that predate these categories being added.
 */
export function getAlwaysHiddenItemIds(
  categoryMappings: CategoryMapping[]
): string[] {
  return ALWAYS_HIDDEN_SUBCATEGORIES
    .filter(sub => subcategoryExists(categoryMappings, sub.parent, sub.child))
    .map(sub => generateItemId('subcategory', sub.child, sub.parent));
}
