/**
 * Tests for unified expense types
 * Verifies the canonical ExpenseDefinition type is a superset of all fields
 * used across the codebase, and that the canonical module exports are importable.
 */
import { describe, it, expect } from 'vitest';

describe('unified expense types', () => {
  describe('ExpenseDefinition', () => {
    it('should be importable from the canonical @/types/expense module', async () => {
      // This will throw if the module doesn't exist
      const mod = await import('@/types/expense');
      // The module should export EXPENSE_DEFINITION_FIELDS and EXPENSE_DATA_FIELDS
      // as runtime constants to verify the type shape
      expect(mod.EXPENSE_DEFINITION_FIELDS).toBeDefined();
      expect(Array.isArray(mod.EXPENSE_DEFINITION_FIELDS)).toBe(true);
    });

    it('should include all fields from expense-matcher.ts definition', async () => {
      const { EXPENSE_DEFINITION_FIELDS } = await import('@/types/expense');
      // Fields used by expense-matcher.ts
      expect(EXPENSE_DEFINITION_FIELDS).toContain('id');
      expect(EXPENSE_DEFINITION_FIELDS).toContain('name');
      expect(EXPENSE_DEFINITION_FIELDS).toContain('expected_amount_cents');
      expect(EXPENSE_DEFINITION_FIELDS).toContain('recurrence_type');
      expect(EXPENSE_DEFINITION_FIELDS).toContain('next_due_date');
      expect(EXPENSE_DEFINITION_FIELDS).toContain('match_pattern');
      expect(EXPENSE_DEFINITION_FIELDS).toContain('linked_up_transaction_id');
      expect(EXPENSE_DEFINITION_FIELDS).toContain('is_active');
    });

    it('should include all fields from budget-zero-calculations.ts definition', async () => {
      const { EXPENSE_DEFINITION_FIELDS } = await import('@/types/expense');
      // Additional fields used by budget-zero-calculations.ts
      expect(EXPENSE_DEFINITION_FIELDS).toContain('partnership_id');
      expect(EXPENSE_DEFINITION_FIELDS).toContain('category_name');
      expect(EXPENSE_DEFINITION_FIELDS).toContain('auto_detected');
      expect(EXPENSE_DEFINITION_FIELDS).toContain('emoji');
      expect(EXPENSE_DEFINITION_FIELDS).toContain('notes');
    });
  });

  describe('ExpenseData', () => {
    it('should be importable from the canonical @/types/expense module', async () => {
      const mod = await import('@/types/expense');
      expect(mod.EXPENSE_DATA_FIELDS).toBeDefined();
      expect(Array.isArray(mod.EXPENSE_DATA_FIELDS)).toBe(true);
    });

    it('should include all fields from expense-projections.ts definition', async () => {
      const { EXPENSE_DATA_FIELDS } = await import('@/types/expense');
      // Fields from expense-projections.ts
      expect(EXPENSE_DATA_FIELDS).toContain('id');
      expect(EXPENSE_DATA_FIELDS).toContain('name');
      expect(EXPENSE_DATA_FIELDS).toContain('category_name');
      expect(EXPENSE_DATA_FIELDS).toContain('goal_id');
      expect(EXPENSE_DATA_FIELDS).toContain('asset_id');
      expect(EXPENSE_DATA_FIELDS).toContain('expected_amount_cents');
      expect(EXPENSE_DATA_FIELDS).toContain('recurrence_type');
      expect(EXPENSE_DATA_FIELDS).toContain('next_due_date');
      expect(EXPENSE_DATA_FIELDS).toContain('emoji');
      expect(EXPENSE_DATA_FIELDS).toContain('is_matched');
      expect(EXPENSE_DATA_FIELDS).toContain('matched_amount');
      expect(EXPENSE_DATA_FIELDS).toContain('matched_date');
      // Split/share properties
      expect(EXPENSE_DATA_FIELDS).toContain('is_shared');
      expect(EXPENSE_DATA_FIELDS).toContain('split_percentage');
      expect(EXPENSE_DATA_FIELDS).toContain('original_amount_cents');
      expect(EXPENSE_DATA_FIELDS).toContain('is_personal');
    });

    it('should include all fields from budget-customization.ts definition', async () => {
      const { EXPENSE_DATA_FIELDS } = await import('@/types/expense');
      // budget-customization.ts uses these same fields
      expect(EXPENSE_DATA_FIELDS).toContain('goal_id');
      expect(EXPENSE_DATA_FIELDS).toContain('asset_id');
      expect(EXPENSE_DATA_FIELDS).toContain('is_matched');
      expect(EXPENSE_DATA_FIELDS).toContain('matched_amount');
      expect(EXPENSE_DATA_FIELDS).toContain('matched_date');
    });
  });
});
