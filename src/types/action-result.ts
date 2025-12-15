/**
 * Unified Action Result Type
 *
 * Standardized return type for server actions.
 * Previously, actions returned a mix of:
 *   - { error: string }
 *   - { success: boolean; error?: string }
 *   - { data: T; error?: string }
 *
 * This unified type provides a consistent discriminated union:
 *   - Success: { success: true; data?: T }
 *   - Failure: { success: false; error: string }
 */

/**
 * Unified result type for server actions.
 * Use `success` field for type discrimination.
 */
export type ActionResult<T = void> =
  | { success: true; data?: T; error?: undefined }
  | { success: false; data?: undefined; error: string };

/**
 * Create a success result with optional data.
 */
export function ok<T = void>(data?: T): ActionResult<T> {
  return { success: true, data };
}

/**
 * Create a failure result with an error message.
 */
export function fail<T = void>(error: string): ActionResult<T> {
  return { success: false, error };
}
