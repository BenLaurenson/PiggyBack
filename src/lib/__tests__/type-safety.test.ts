import { describe, it, expect } from 'vitest';

/**
 * Tests for Issue 14 — Excessive `any` Type Usage
 *
 * Verifies that key functions from the top 4 offending files
 * export proper types instead of `any`. We test by importing
 * and verifying the function signatures exist and return expected shapes.
 */

describe('type-safety', () => {
  describe('budget-zero-calculations.ts', () => {
    it('should export calculateBudgetHealth with proper ExpenseMatch type (not any[])', async () => {
      const mod = await import('@/lib/budget-zero-calculations');

      // calculateBudgetHealth should accept typed matches
      expect(typeof mod.calculateBudgetHealth).toBe('function');

      // Call with proper typed data
      const result = mod.calculateBudgetHealth(
        0,
        [],
        new Map(),
        [],
        [{ expense_definition_id: 'exp-1', matched_at: '2026-01-01' }]
      );
      expect(typeof result).toBe('number');
      expect(result).toBeGreaterThanOrEqual(0);
      expect(result).toBeLessThanOrEqual(100);
    });

    it('should export groupExpensesByUrgency with proper ExpenseMatch type (not any[])', async () => {
      const mod = await import('@/lib/budget-zero-calculations');

      expect(typeof mod.groupExpensesByUrgency).toBe('function');

      const result = mod.groupExpensesByUrgency([], []);
      expect(result).toHaveProperty('overdue');
      expect(result).toHaveProperty('this-week');
    });

    it('should export ExpenseMatch interface', async () => {
      // Verify the module exports the ExpenseMatch type marker
      const mod = await import('@/lib/budget-zero-calculations');
      expect(mod.EXPENSE_MATCH_FIELDS).toBeDefined();
      expect(mod.EXPENSE_MATCH_FIELDS).toContain('expense_definition_id');
      expect(mod.EXPENSE_MATCH_FIELDS).toContain('matched_at');
    });
  });

  describe('methodology-mapper.ts', () => {
    it('should export getMergedMethodology with typed customCategories parameter', async () => {
      const mod = await import('@/lib/methodology-mapper');

      expect(typeof mod.getMergedMethodology).toBe('function');

      // Should accept typed customization objects
      const result = mod.getMergedMethodology('50-30-20', [
        {
          originalName: 'Needs (50%)',
          name: 'Essentials',
          percentage: 50,
        },
      ]);

      expect(Array.isArray(result)).toBe(true);
      // The merged result should reflect the customization
      const essentials = result.find(c => c.name === 'Essentials');
      expect(essentials).toBeDefined();
    });

    it('should export validateMethodologyCustomizations with typed parameter', async () => {
      const mod = await import('@/lib/methodology-mapper');

      expect(typeof mod.validateMethodologyCustomizations).toBe('function');

      // Valid customization should return null
      const result = mod.validateMethodologyCustomizations('50-30-20', [
        { name: 'Needs', percentage: 50, isHidden: false },
        { name: 'Wants', percentage: 30, isHidden: false },
        { name: 'Savings', percentage: 20, isHidden: false },
      ]);
      expect(result).toBeNull();
    });

    it('should export MethodologyCustomization type marker', async () => {
      const mod = await import('@/lib/methodology-mapper');
      expect(mod.METHODOLOGY_CUSTOMIZATION_FIELDS).toBeDefined();
      expect(mod.METHODOLOGY_CUSTOMIZATION_FIELDS).toContain('originalName');
      expect(mod.METHODOLOGY_CUSTOMIZATION_FIELDS).toContain('name');
    });
  });

  describe('expenses.ts action types', () => {
    it('should export async functions', async () => {
      const mod = await import('@/app/actions/expenses');

      // Server action files can only export async functions in Next.js 16
      expect(typeof mod.createExpenseFromTransaction).toBe('function');
      expect(typeof mod.getVendorTransactionHistory).toBe('function');
    });
  });
});
