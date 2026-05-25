const FRANKFURTER_BASE = 'https://api.frankfurter.app';

// In-process cache of (currency, date) → AUD rate. Scoped to a single Node
// process — in serverless/edge runtimes (Vercel Functions) this does NOT
// persist across invocations. It's purely a within-request optimisation so
// that processing many transactions in one sync run doesn't refetch the same
// (USD, 2026-05-23) rate fifty times. Don't rely on it for cross-request
// caching; use a real cache (Vercel Runtime Cache, Redis) if that's needed.
const cache = new Map<string, number>();

/** Test-only: clear the in-process rate cache. */
export function __clearFxCache(): void {
  cache.clear();
}

function isoDate(d: Date): string {
  // YYYY-MM-DD in UTC. Frankfurter accepts this and returns the closest weekday rate.
  return d.toISOString().slice(0, 10);
}

/**
 * Returns AUD per 1 unit of `currency` on (or closest weekday to) `at`.
 * Throws on network failure or non-200. Caller decides how to handle —
 * the ingestion pipeline treats failure as `fx_status = 'missing'`.
 */
export async function fetchAudRateForCurrency(
  currency: string,
  at: Date,
): Promise<number> {
  if (currency === 'AUD') return 1;

  const key = `${currency}|${isoDate(at)}`;
  const cached = cache.get(key);
  if (cached !== undefined) return cached;

  const url = `${FRANKFURTER_BASE}/${isoDate(at)}?from=${encodeURIComponent(currency)}&to=AUD`;
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Frankfurter fetch failed (${res.status} ${res.statusText}) for ${url}`);
  }
  const body = (await res.json()) as { rates?: { AUD?: number } };
  const rate = body?.rates?.AUD;
  if (typeof rate !== 'number' || !Number.isFinite(rate) || rate <= 0) {
    throw new Error(`Frankfurter returned invalid AUD rate for ${currency} at ${isoDate(at)}`);
  }
  cache.set(key, rate);
  return rate;
}

/**
 * Convert native-currency cents to AUD cents using `audPerUnit` (AUD per 1 unit
 * of the native currency). Rounds half-away-from-zero so −0.5 → −1, 0.5 → 1.
 */
export function convertToAudCents(amountCents: number, audPerUnit: number): number {
  if (!Number.isInteger(amountCents)) {
    throw new Error(`convertToAudCents: amountCents must be an integer, got ${amountCents}`);
  }
  if (!Number.isFinite(audPerUnit) || audPerUnit <= 0) {
    throw new Error(`convertToAudCents: audPerUnit must be a positive finite number`);
  }
  const sign = Math.sign(amountCents);
  const magnitude = Math.abs(amountCents) * audPerUnit;
  return sign * Math.round(magnitude);
}
