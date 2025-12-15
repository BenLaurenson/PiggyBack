/**
 * Budget Row Type System
 *
 * Canonical type definitions for all budget table rows (categories, subcategories, goals, assets).
 * Uses discriminated unions for type-safe handling of different row types.
 *
 * This replaces the 11+ scattered BudgetItem definitions throughout the codebase.
 */

import type { CategoryShareConfig } from "./shared-budget-calculations";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Shared Interfaces
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * Suggested savings breakdown for goals with deadlines
 */
export interface SuggestedSavingsBreakdown {
  weekly: number;
  fortnightly: number;
  monthly: number;
  hasDeadline: boolean;
  daysRemaining: number | null;
}

/**
 * Expected expense data for categories with recurring expenses
 */
export interface ExpenseData {
  id: string;
  name: string;
  category_name: string;
  goal_id?: string;
  asset_id?: string;
  expected_amount_cents: number;
  recurrence_type: string;
  next_due_date: string;
  emoji: string;
  is_matched?: boolean;
  matched_amount?: number;
  matched_date?: string;
}

/**
 * Share configuration for household budgets
 */
export interface BudgetRowShareConfig {
  isShared: boolean;
  sharePercentage: number; // 0-100, user's share
}

/**
 * Split configuration for expenses
 */
export interface BudgetRowSplitConfig {
  type: 'equal' | 'custom' | 'individual-owner' | 'individual-partner';
  ownerPercentage: number; // 0-100
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Base Budget Row
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * Common properties shared by all budget row types
 */
interface BaseBudgetRow {
  id: string;
  name: string;
  icon: string;
  assigned: number; // cents
  spent: number; // cents
  displayOrder: number;

  // Sharing/splitting (for household budgets)
  shareConfig?: BudgetRowShareConfig;
  splitConfig?: BudgetRowSplitConfig;

  // Visibility
  isHidden?: boolean;
  isTemporarilyVisible?: boolean; // Hidden but has transactions this period
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Discriminated Union Variants
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * Category budget row (e.g., "Food & Dining", "Transportation")
 */
export interface CategoryBudgetRow extends BaseBudgetRow {
  type: 'category';
  color?: string;

  // Methodology customization
  isCustomized?: boolean; // Has custom percentage target
  targetPercentage?: number; // Custom percentage of income
  underlyingCategories?: string[]; // For methodology categories (e.g., "Needs" includes multiple categories)

  // Expected expenses
  expectedExpenses?: ExpenseData[];
  matchedExpenseCount?: number;
  totalExpectedAmount?: number;
  isExpenseDefault?: boolean; // Auto-filled from recurring expenses
}

/**
 * Subcategory budget row (e.g., "Groceries" under "Food & Dining")
 */
export interface SubcategoryBudgetRow extends BaseBudgetRow {
  type: 'subcategory';
  parentCategory: string; // Name of parent category
  expenseBudgetedCents?: number; // Amount budgeted from recurring expenses
  isExpenseDefault?: boolean; // Auto-filled from recurring expenses
}

/**
 * Goal budget row (e.g., "Emergency Fund", "Vacation")
 */
export interface GoalBudgetRow extends BaseBudgetRow {
  type: 'goal';
  color: string;
  target: number; // Target amount in cents
  currentAmount: number; // Current saved amount in cents
  deadline?: string; // ISO date string
  suggestedSavings?: SuggestedSavingsBreakdown;
}

/**
 * Asset budget row (e.g., "VAS ETF", "Bitcoin")
 */
export interface AssetBudgetRow extends BaseBudgetRow {
  type: 'asset';
  assetType: string; // 'stock', 'etf', 'crypto', etc.
  currentValue: number; // Current market value in cents
  purchaseValue?: number; // Original purchase value in cents
  tickerSymbol?: string; // e.g., "VAS.AX", "BTC"
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Discriminated Union
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * A row in the budget table (category, subcategory, goal, or asset)
 *
 * Use type guards to narrow to specific variant:
 * ```typescript
 * if (isCategoryRow(row)) {
 *   // TypeScript knows row is CategoryBudgetRow
 *   console.log(row.expectedExpenses);
 * }
 * ```
 */
export type BudgetRow =
  | CategoryBudgetRow
  | SubcategoryBudgetRow
  | GoalBudgetRow
  | AssetBudgetRow;

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Type Guards
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * Type guard to check if a row is a category
 */
export function isCategoryRow(row: BudgetRow): row is CategoryBudgetRow {
  return row.type === 'category';
}

/**
 * Type guard to check if a row is a subcategory
 */
export function isSubcategoryRow(row: BudgetRow): row is SubcategoryBudgetRow {
  return row.type === 'subcategory';
}

/**
 * Type guard to check if a row is a goal
 */
export function isGoalRow(row: BudgetRow): row is GoalBudgetRow {
  return row.type === 'goal';
}

/**
 * Type guard to check if a row is an asset
 */
export function isAssetRow(row: BudgetRow): row is AssetBudgetRow {
  return row.type === 'asset';
}

