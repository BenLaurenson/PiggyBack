import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

/**
 * Tests for Issue 30 — Audit Logging for Critical Operations
 *
 * Verifies:
 * 1. auditLog outputs structured JSON to console.log
 * 2. All expected audit actions are defined in AuditAction
 */

describe('audit-logger', () => {
  let consoleSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleSpy.mockRestore();
  });

  describe('auditLog', () => {
    it('should output structured JSON to console.log', async () => {
      const { auditLog } = await import('@/lib/audit-logger');

      auditLog({
        userId: 'user-123',
        action: 'EXPENSE_DELETED',
        details: { expenseId: 'exp-456' },
      });

      expect(consoleSpy).toHaveBeenCalledOnce();

      // Parse the logged output — it should be valid JSON
      const loggedArg = consoleSpy.mock.calls[0][0];
      const parsed = JSON.parse(loggedArg);

      expect(parsed).toMatchObject({
        userId: 'user-123',
        action: 'EXPENSE_DELETED',
        details: { expenseId: 'exp-456' },
      });
      expect(parsed.timestamp).toBeDefined();
      expect(parsed.level).toBe('audit');
    });

    it('should work without optional details', async () => {
      const { auditLog } = await import('@/lib/audit-logger');

      auditLog({
        userId: 'user-789',
        action: 'BUDGET_RESET',
      });

      expect(consoleSpy).toHaveBeenCalledOnce();

      const loggedArg = consoleSpy.mock.calls[0][0];
      const parsed = JSON.parse(loggedArg);

      expect(parsed.userId).toBe('user-789');
      expect(parsed.action).toBe('BUDGET_RESET');
      expect(parsed.details).toBeUndefined();
    });

    it('should include an ISO timestamp', async () => {
      const { auditLog } = await import('@/lib/audit-logger');

      auditLog({
        userId: 'user-1',
        action: 'API_KEY_UPDATED',
      });

      const loggedArg = consoleSpy.mock.calls[0][0];
      const parsed = JSON.parse(loggedArg);

      // Timestamp should be a valid ISO date string
      expect(() => new Date(parsed.timestamp)).not.toThrow();
      expect(new Date(parsed.timestamp).toISOString()).toBe(parsed.timestamp);
    });
  });

  describe('AuditAction', () => {
    it('should define all expected audit actions', async () => {
      const { AuditAction } = await import('@/lib/audit-logger');

      expect(AuditAction.EXPENSE_DELETED).toBe('EXPENSE_DELETED');
      expect(AuditAction.BUDGET_RESET).toBe('BUDGET_RESET');
      expect(AuditAction.PARTNERSHIP_CHANGED).toBe('PARTNERSHIP_CHANGED');
      expect(AuditAction.CATEGORY_OVERRIDE).toBe('CATEGORY_OVERRIDE');
      expect(AuditAction.API_KEY_UPDATED).toBe('API_KEY_UPDATED');
    });

    it('should have at least 5 defined actions', async () => {
      const { AuditAction } = await import('@/lib/audit-logger');

      const actionCount = Object.keys(AuditAction).length;
      expect(actionCount).toBeGreaterThanOrEqual(5);
    });
  });
});
