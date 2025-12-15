/**
 * TypeScript types for Advanced Budget Layout System
 */

export interface BudgetItemWithLayout {
  id: string;
  type: 'category' | 'subcategory' | 'goal' | 'asset';
  name: string;
  icon: string;
  assigned: number;
  spent: number;

  // For subcategories
  parentCategory?: string;

  // For goals
  target?: number;
  currentAmount?: number;

  // For assets
  currentValue?: number;

  // For methodology categories
  underlyingCategories?: string[];
  percentage?: number;

  // Expected expenses
  expectedExpenses?: any[];
  matchedExpenseCount?: number;

  // Customization
  isCustomized?: boolean;

  // Display
  displayOrder: number;
  sectionId?: string;  // Which section this item belongs to
}

