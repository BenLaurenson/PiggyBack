/**
 * Date/time formatting helpers with consistent timezone handling.
 *
 * Up Bank emits ISO timestamps in UTC. We render them in the user's
 * preferred Australian timezone (default: Australia/Melbourne which
 * automatically observes AEST/AEDT). Users can override this via
 * profiles.timezone (e.g. Australia/Perth for AWST, Australia/Adelaide
 * for ACST/ACDT).
 *
 * All helpers accept a timezone override; passing `undefined` falls back
 * to the default. Pass an IANA TZ name (not a UTC offset string) so DST
 * is handled correctly.
 */

/** Default timezone when the user hasn't picked one. */
export const DEFAULT_TIMEZONE = "Australia/Melbourne";

/** Allowed Australian IANA timezones surfaced in settings UI. */
export const AU_TIMEZONES: ReadonlyArray<{ value: string; label: string }> = [
  { value: "Australia/Melbourne", label: "AEST/AEDT (Melbourne, Sydney, Hobart)" },
  { value: "Australia/Sydney", label: "AEST/AEDT (Sydney)" },
  { value: "Australia/Brisbane", label: "AEST (Brisbane — no DST)" },
  { value: "Australia/Adelaide", label: "ACST/ACDT (Adelaide)" },
  { value: "Australia/Darwin", label: "ACST (Darwin — no DST)" },
  { value: "Australia/Perth", label: "AWST (Perth)" },
  { value: "Australia/Hobart", label: "AEST/AEDT (Hobart)" },
];

const AU_TZ_VALUE_SET = new Set(AU_TIMEZONES.map((t) => t.value));

/**
 * Validate a timezone string. Falls back to `DEFAULT_TIMEZONE` if the value
 * is null/undefined/unrecognised.
 *
 * Accepts any value Intl.DateTimeFormat accepts, but we whitelist AU zones
 * for the UI; the validator allows any string that resolves to a real zone.
 */
export function resolveTimezone(tz: string | null | undefined): string {
  if (!tz) return DEFAULT_TIMEZONE;
  if (AU_TZ_VALUE_SET.has(tz)) return tz;
  // Fallback: try Intl. If the runtime accepts it, use it; otherwise default.
  try {
    new Intl.DateTimeFormat("en-AU", { timeZone: tz });
    return tz;
  } catch {
    return DEFAULT_TIMEZONE;
  }
}

/**
 * Format a UTC ISO timestamp (or Date) as a localised date string.
 *
 * Defaults: AU locale, "1 May 2025" style.
 */
export function formatDate(
  input: string | Date | number | null | undefined,
  options: { timezone?: string | null; format?: "short" | "medium" | "long" } = {}
): string {
  if (input === null || input === undefined || input === "") return "";
  const date = input instanceof Date ? input : new Date(input);
  if (Number.isNaN(date.getTime())) return "";

  const timeZone = resolveTimezone(options.timezone);
  const format = options.format ?? "medium";

  const dateOpts: Intl.DateTimeFormatOptions = (() => {
    switch (format) {
      case "short":
        return { day: "numeric", month: "short", year: "numeric" };
      case "long":
        return { weekday: "long", day: "numeric", month: "long", year: "numeric" };
      case "medium":
      default:
        return { day: "numeric", month: "long", year: "numeric" };
    }
  })();

  return new Intl.DateTimeFormat("en-AU", { ...dateOpts, timeZone }).format(date);
}

/**
 * Format a UTC ISO timestamp as a localised date+time string.
 */
export function formatDateTime(
  input: string | Date | number | null | undefined,
  options: { timezone?: string | null; includeSeconds?: boolean; format?: "short" | "medium" | "long" } = {}
): string {
  if (input === null || input === undefined || input === "") return "";
  const date = input instanceof Date ? input : new Date(input);
  if (Number.isNaN(date.getTime())) return "";

  const timeZone = resolveTimezone(options.timezone);
  const format = options.format ?? "medium";
  const includeSeconds = options.includeSeconds ?? false;

  const baseOpts: Intl.DateTimeFormatOptions = (() => {
    switch (format) {
      case "short":
        return { day: "numeric", month: "short", year: "numeric" };
      case "long":
        return { weekday: "long", day: "numeric", month: "long", year: "numeric" };
      case "medium":
      default:
        return { day: "numeric", month: "long", year: "numeric" };
    }
  })();

  const timeOpts: Intl.DateTimeFormatOptions = {
    hour: "2-digit",
    minute: "2-digit",
    ...(includeSeconds ? { second: "2-digit" } : {}),
    hour12: false,
  };

  return new Intl.DateTimeFormat("en-AU", { ...baseOpts, ...timeOpts, timeZone }).format(date);
}

/**
 * Return only the time portion of a UTC timestamp, in the user's TZ.
 */
export function formatTime(
  input: string | Date | number | null | undefined,
  options: { timezone?: string | null; includeSeconds?: boolean } = {}
): string {
  if (input === null || input === undefined || input === "") return "";
  const date = input instanceof Date ? input : new Date(input);
  if (Number.isNaN(date.getTime())) return "";

  const timeZone = resolveTimezone(options.timezone);
  return new Intl.DateTimeFormat("en-AU", {
    hour: "2-digit",
    minute: "2-digit",
    ...(options.includeSeconds ? { second: "2-digit" } : {}),
    hour12: false,
    timeZone,
  }).format(date);
}
