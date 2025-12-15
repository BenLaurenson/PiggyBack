/**
 * Lightweight audit logger for critical operations.
 *
 * Outputs structured JSON to console.log. A future migration can
 * add an audit_logs table and persist these entries to the database.
 */

/**
 * Predefined audit actions for critical operations.
 */
export const AuditAction = {
  EXPENSE_DELETED: 'EXPENSE_DELETED',
  BUDGET_RESET: 'BUDGET_RESET',
  PARTNERSHIP_CHANGED: 'PARTNERSHIP_CHANGED',
  CATEGORY_OVERRIDE: 'CATEGORY_OVERRIDE',
  API_KEY_UPDATED: 'API_KEY_UPDATED',
  PASSWORD_CHANGED: 'PASSWORD_CHANGED',
  ACCOUNT_DELETED: 'ACCOUNT_DELETED',
  PARTNER_ADDED: 'PARTNER_ADDED',
  PARTNER_REMOVED: 'PARTNER_REMOVED',
  FINANCIAL_DATA_EXPORTED: 'FINANCIAL_DATA_EXPORTED',
  OTHER_SESSIONS_REVOKED: 'OTHER_SESSIONS_REVOKED',
} as const;

interface AuditLogParams {
  userId: string;
  action: string;
  details?: Record<string, unknown>;
}

/**
 * Log a critical operation in structured JSON format.
 *
 * @param params.userId - The ID of the user performing the action
 * @param params.action - The action being performed (use AuditAction constants)
 * @param params.details - Optional additional context about the action
 */
export function auditLog(params: AuditLogParams): void {
  const entry = {
    level: 'audit' as const,
    timestamp: new Date().toISOString(),
    userId: params.userId,
    action: params.action,
    ...(params.details !== undefined ? { details: params.details } : {}),
  };

  console.log(JSON.stringify(entry));
}
