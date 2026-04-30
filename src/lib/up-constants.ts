/**
 * Up Bank integration constants — every magic number in one place.
 *
 * Each value carries either a `// docs:` reference (Up-mandated) or a
 * `// product decision:` reference (PiggyBack-side defensive choice).
 *
 * Verify against context7 (`/websites/developer_up_au`) before editing
 * any value tagged "docs".
 */

/** docs: https://developer.up.com.au/#api-host */
export const UP_API_BASE_URL = "https://api.up.com.au/api/v1";
export const UP_API_HOSTNAME = "api.up.com.au";

/**
 * docs: typical upper limit on `page[size]` is 100.
 * Used as the request-size for accounts and transactions.
 */
export const PAGE_SIZE_DEFAULT = 100;

/**
 * docs: GET /categories is NOT paginated — the entire tree returns in one call.
 */
export const PAGE_SIZE_CATEGORIES = null;

/**
 * product decision: hard ceiling on cursor-walked pagination, retained at 100
 * for back-compat with existing tests. With page size 100 this allows up to
 * 10k items in a single getAllPages call — fine for the small lists we use it
 * for (accounts ≤ ~50, tags ≤ ~10k, webhooks ≤ 10).
 *
 * Transaction sync does NOT rely on this cap — it uses time-window chunking
 * (see SYNC_WINDOW_DAYS) so a user with 5+ years of history doesn't get truncated.
 */
export const MAX_PAGES = 100;

/**
 * product decision: transaction sync walks one window at a time
 * (filter[since]…filter[until]). 30-day windows keep memory bounded
 * and let the sync resume on timeout without re-fetching settled history.
 */
export const SYNC_WINDOW_DAYS = 30;

/**
 * product decision: webhook events older or further-future than this are
 * rejected as replay attempts. Up's docs don't mandate a window; this is
 * defensive — Up's clock and ours need to agree to within a few minutes.
 */
export const REPLAY_WINDOW_MS = 5 * 60_000;

/** docs: POST /webhooks rejects URLs longer than 300 chars. */
export const WEBHOOK_URL_MAX_CHARS = 300;

/** docs: POST /webhooks rejects descriptions longer than 64 chars. */
export const WEBHOOK_DESCRIPTION_MAX_CHARS = 64;

/** docs: limit of 10 webhooks at any given time, per PAT. */
export const WEBHOOK_PER_PAT_LIMIT = 10;

/**
 * product decision: bounded retry on transient failures.
 * One retry is enough for transient blips; more would mask real problems.
 */
export const RETRY_BACKOFF_MS = 1000;

/**
 * product decision: cap on Retry-After honored. Up doesn't currently publish
 * 429s but if it did, we don't want a malicious response to make us sleep forever.
 */
export const RETRY_AFTER_MAX_MS = 30_000;

/** docs: signed payload is the entire raw request body (SHA-256 HMAC). */
export const WEBHOOK_SIGNATURE_HEADER = "X-Up-Authenticity-Signature";

/** Hex regex for SHA-256 (64 chars). */
export const WEBHOOK_SIGNATURE_HEX_REGEX = /^[0-9a-f]{64}$/i;
