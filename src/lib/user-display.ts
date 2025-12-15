/**
 * Resolves the best display name for a user from available sources.
 *
 * Priority:
 *  1. Profile display_name (user-set in settings)
 *  2. Auth metadata full_name (first word only)
 *  3. Inferred first name from email prefix
 *  4. Fallback "there"
 */
export function getDisplayName(
  profileName: string | null | undefined,
  fullName: string | null | undefined,
  email: string | null | undefined
): string {
  // 1. Profile display name (user-set nickname in settings)
  if (profileName?.trim()) return profileName.trim();

  // 2. Auth metadata full_name (from OAuth or signup)
  if (fullName?.trim()) return fullName.trim().split(" ")[0];

  // 3. Infer first name from email prefix
  if (email) {
    const prefix = email.split("@")[0];
    // Try to split on common separators: jane.doe, jane_doe, jane-doe
    const parts = prefix.split(/[._-]/);
    if (parts.length > 1 && parts[0].length >= 2) {
      return parts[0].charAt(0).toUpperCase() + parts[0].slice(1).toLowerCase();
    }
    // Try camelCase: benLaurenson -> Ben
    const camelMatch = prefix.match(/^([a-z]+)[A-Z]/);
    if (camelMatch && camelMatch[1].length >= 2) {
      return camelMatch[1].charAt(0).toUpperCase() + camelMatch[1].slice(1).toLowerCase();
    }
    // Capitalize the full prefix as last resort
    return prefix.charAt(0).toUpperCase() + prefix.slice(1);
  }

  return "there";
}

/**
 * Formats a last-synced timestamp into a human-readable relative string.
 */
export function formatLastSynced(dateStr: string | null): string {
  if (!dateStr) return "Never";
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return "Just now";
  if (diffMins < 60) return `${diffMins} min ago`;
  if (diffHours < 24) return `${diffHours} hour${diffHours > 1 ? "s" : ""} ago`;
  if (diffDays < 7) return `${diffDays} day${diffDays > 1 ? "s" : ""} ago`;
  return date.toLocaleDateString();
}
