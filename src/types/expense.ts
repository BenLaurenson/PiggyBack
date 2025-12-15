/**
 * Canonical Expense Type Definitions
 *
 * This is the single source of truth for expense-related types.
 * All files should import from here instead of defining their own.
 *
 * Previously, ExpenseDefinition was defined in:
 *   - src/lib/expense-matcher.ts
 *   - src/lib/budget-zero-calculations.ts
 *
 * Previously, ExpenseData was defined in:
 *   - src/lib/expense-projections.ts
 *   - src/types/budget-customization.ts
 *
 * This unified version is a superset of all fields from those definitions.
 */

/**
 * ExpenseDefinition - the database-level expense configuration.
 * Represents a recurring or one-time expense that the user tracks.
 */
export interface ExpenseDefinition {
  id: string;
  partnership_id: string;
  name: string;
  category_name: string;
  expected_amount_cents: number;
  recurrence_type: 'weekly' | 'fortnightly' | 'monthly' | 'quarterly' | 'yearly' | 'one-time' | string;
  next_due_date: string;
  is_active: boolean;
  auto_detected: boolean;
  emoji: string;
  match_pattern?: string;
  linked_up_transaction_id?: string;
  notes?: string;
}

/**
 * ExpenseData - the view-level expense data used in UI components.
 * Includes matched status and split/share properties for display.
 */
export interface ExpenseData {
  id: string;
  name: string;
  category_name: string;
  expected_amount_cents: number;
  recurrence_type: string;
  next_due_date: string;
  emoji: string;
  goal_id?: string;
  asset_id?: string;
  is_matched?: boolean;
  matched_amount?: number;
  matched_date?: string;
  // Split/share properties (added by viewAdjustedExpenses)
  is_shared?: boolean;
  split_percentage?: number;
  original_amount_cents?: number;
  is_personal?: boolean;
}

/**
 * Runtime field lists for test verification.
 * These ensure the type interfaces contain all expected fields.
 */
export const EXPENSE_DEFINITION_FIELDS = [
  'id',
  'partnership_id',
  'name',
  'category_name',
  'expected_amount_cents',
  'recurrence_type',
  'next_due_date',
  'is_active',
  'auto_detected',
  'emoji',
  'match_pattern',
  'linked_up_transaction_id',
  'notes',
] as const;

export const EXPENSE_DATA_FIELDS = [
  'id',
  'name',
  'category_name',
  'expected_amount_cents',
  'recurrence_type',
  'next_due_date',
  'emoji',
  'goal_id',
  'asset_id',
  'is_matched',
  'matched_amount',
  'matched_date',
  'is_shared',
  'split_percentage',
  'original_amount_cents',
  'is_personal',
] as const;
