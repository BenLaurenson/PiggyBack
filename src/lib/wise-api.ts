/**
 * Wise Business API client (Phase 1A subset).
 *
 * Documentation: https://docs.wise.com/api-reference
 * Verified endpoints (from live API calls): documentation/wise-api/endpoints.md
 *                                            documentation/wise-api/TASK6-BRIEF.md
 *
 * Phase 1B adds webhook register/delete methods + RSA signature verification.
 *
 * IMPORTANT: Wise's `referenceNumber` is NOT globally unique. It can repeat for
 * refund pairs (DEBIT + CREDIT, same balance) and across FX legs (different
 * balances, opposite directions). The ingestion layer (`processWiseTransaction`)
 * is responsible for composing the per-leg idempotency key — do NOT treat
 * `referenceNumber` as a primary key in this client. We surface it raw.
 */

export type WiseEnvironment = 'live' | 'sandbox';

const BASE_URLS: Record<WiseEnvironment, string> = {
  live: 'https://api.wise.com',
  sandbox: 'https://api.sandbox.transferwise.tech',
};

/** Safety limit for cursor pagination. Phase 1A pulls all history via
 *  date-window chunking (statement endpoint does NOT return nextCursor),
 *  but the limit is here as a defensive guard for future cursor paths. */
export const MAX_PAGES = 500;

/** Money shape used across profile/balance/statement responses. */
export interface WiseMoney {
  value: number;
  currency: string;
}

/** Subset of profile fields we use. type is uppercase: "PERSONAL" | "BUSINESS". */
export interface WiseProfile {
  id: number;
  type: 'PERSONAL' | 'BUSINESS';
}

/** Subset of balance fields we use. */
export interface WiseBalance {
  id: number;
  currency: string;
  amount: WiseMoney;
  name?: string;
}

/** FX leg detail when a transaction crosses currencies. */
export interface WiseExchangeDetails {
  fromAmount: WiseMoney;
  toAmount: WiseMoney;
  rate: number;
}

/** Subset of statement transaction fields we use. The full shape has
 *  additional metadata; we expose the keys ingestion needs. */
export interface WiseStatementTransaction {
  referenceNumber: string;
  /** ISO 8601 timestamp with millisecond precision and trailing Z. */
  date: string;
  /** Native currency amount. Sign indicates direction (negative = debit). */
  amount: WiseMoney;
  totalFees?: WiseMoney;
  details: {
    type: string; // observed: CONVERSION | TRANSFER | CARD | DEBIT | CREDIT (and possibly others)
    description?: string;
    category?: string;
  };
  exchangeDetails?: WiseExchangeDetails;
  runningBalance: WiseMoney;
}

export class WiseApiError extends Error {
  name = 'WiseApiError';
  constructor(public readonly status: number, message: string, public readonly body?: string) {
    super(message);
  }
}

export interface WiseApiClient {
  readonly baseUrl: string;
  ping(): Promise<unknown>;
  getProfiles(): Promise<WiseProfile[]>;
  getBalances(profileId: number): Promise<WiseBalance[]>;
  /**
   * Fetches one date-window of statement data. The Wise statement endpoint
   * does NOT support cursor pagination — `nextCursor` in the return value is
   * always null on this path. The sync worker chunks history by date windows
   * (max 469 days per Wise's limit) rather than paging cursors.
   */
  getStatementPage(args: {
    profileId: number;
    balanceId: number;
    currency: string;
    intervalStart: string; // ISO 8601 with milliseconds and Z, e.g. 2026-01-01T00:00:00.000Z
    intervalEnd: string;
  }): Promise<{ entries: WiseStatementTransaction[]; nextCursor: string | null }>;
}

export function createWiseApiClient(token: string, env: WiseEnvironment): WiseApiClient {
  const baseUrl = BASE_URLS[env];

  async function call<T>(path: string, init?: RequestInit): Promise<T> {
    const res = await fetch(`${baseUrl}${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/json',
        'Content-Type': 'application/json',
        ...(init?.headers ?? {}),
      },
    });
    if (!res.ok) {
      const body = await res.text().catch(() => undefined);
      throw new WiseApiError(res.status, `Wise API ${res.status} ${res.statusText} on ${path}`, body);
    }
    return res.json() as Promise<T>;
  }

  return {
    baseUrl,
    ping() {
      return call('/v1/me');
    },
    getProfiles() {
      return call<WiseProfile[]>('/v2/profiles');
    },
    getBalances(profileId: number) {
      return call<WiseBalance[]>(`/v4/profiles/${profileId}/balances?types=STANDARD`);
    },
    async getStatementPage({ profileId, balanceId, currency, intervalStart, intervalEnd }) {
      const params = new URLSearchParams({
        currency,
        intervalStart,
        intervalEnd,
        type: 'FLAT',
      });
      const body = await call<{
        transactions?: WiseStatementTransaction[];
      }>(`/v1/profiles/${profileId}/balance-statements/${balanceId}/statement.json?${params.toString()}`);
      return {
        entries: body.transactions ?? [],
        nextCursor: null, // statement endpoint does not paginate via cursor
      };
    },
  };
}
