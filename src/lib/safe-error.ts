/**
 * Returns a generic error message for the client while logging the real error server-side.
 * Prevents leaking database schema details, constraint names, and internal errors to users.
 */
export function safeErrorMessage(
  error: unknown,
  fallback: string = "An unexpected error occurred"
): string {
  console.error(`[SafeError] ${fallback}:`, error);
  return fallback;
}

/**
 * Escapes LIKE/ILIKE wildcard characters (% and _) in user input.
 * Use before wrapping with %...% for fuzzy search.
 */
export function escapeLikePattern(input: string): string {
  return input.replace(/[%_\\]/g, "\\$&");
}
