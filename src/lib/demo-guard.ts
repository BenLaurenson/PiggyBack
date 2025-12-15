/**
 * Demo mode utilities.
 * When NEXT_PUBLIC_DEMO_MODE is "true", the app runs in read-only demo mode
 * with sample data and no authentication required.
 */

export function isDemoMode(): boolean {
  return process.env.NEXT_PUBLIC_DEMO_MODE === "true";
}

/**
 * Returns a JSON response indicating the action was blocked in demo mode.
 * Use in API route mutation handlers (POST/PUT/DELETE/PATCH).
 */
export function demoModeResponse() {
  return Response.json(
    { error: "Demo mode — changes are not saved.", demo: true },
    { status: 403 }
  );
}

/**
 * Guard for server actions. Returns an error object if demo mode is active.
 * Usage: const blocked = demoActionGuard(); if (blocked) return blocked;
 */
export function demoActionGuard(): { error: string; demo: true; success: false } | null {
  if (isDemoMode()) {
    return { error: "Demo mode — changes are not saved.", demo: true, success: false };
  }
  return null;
}

/**
 * Frozen date for demo mode. The seed data covers Feb 2025 → Jan 2026,
 * so freezing at Jan 28 2026 keeps all 12 months of data visible.
 */
const DEMO_FROZEN_DATE = '2026-01-28T12:00:00';

/**
 * Returns the current date, or a frozen date in demo mode so seed data
 * never goes stale.
 */
export function getCurrentDate(): Date {
  if (isDemoMode()) {
    return new Date(DEMO_FROZEN_DATE);
  }
  return new Date();
}
