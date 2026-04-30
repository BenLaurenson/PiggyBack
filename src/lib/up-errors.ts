/**
 * Typed error classes for Up Bank API responses.
 *
 * Callers can `instanceof`-check to distinguish:
 *   - 401 (revoked PAT — surface friendly "reconnect Up Bank" UI)
 *   - 429 (rate limited — already auto-retried once with Retry-After honored)
 *   - other 4xx (caller-side problem)
 *   - 5xx (transient — already auto-retried once on 1s backoff)
 */

import type { UpApiErrorPayload, UpErrorObject } from "./up-types";

/**
 * Base class. All Up API errors extend this. Carries the parsed JSON:API
 * error payload from Up so callers can inspect `errors[0].title`,
 * `errors[0].detail`, and `errors[0].source` directly.
 */
export class UpApiError extends Error {
  readonly status: number;
  readonly payload: UpApiErrorPayload | null;
  readonly endpoint: string;

  constructor(message: string, status: number, endpoint: string, payload: UpApiErrorPayload | null) {
    super(message);
    this.name = "UpApiError";
    this.status = status;
    this.endpoint = endpoint;
    this.payload = payload;
  }

  /** Convenience: the first error from the payload, or null. */
  get firstError(): UpErrorObject | null {
    return this.payload?.errors?.[0] ?? null;
  }
}

/**
 * 401 Unauthorized — usually means the user's PAT has been revoked at Up's end.
 * Caller should mark the PAT inactive and prompt re-connect.
 */
export class UpUnauthorizedError extends UpApiError {
  constructor(endpoint: string, payload: UpApiErrorPayload | null) {
    super("Up Bank PAT is invalid or revoked", 401, endpoint, payload);
    this.name = "UpUnauthorizedError";
  }
}

/**
 * 429 Too Many Requests — auto-retried once with the doc-honored Retry-After
 * delay. If we still see this, the cap was exceeded.
 */
export class UpRateLimitedError extends UpApiError {
  readonly retryAfterMs: number | null;

  constructor(endpoint: string, payload: UpApiErrorPayload | null, retryAfterMs: number | null) {
    super("Up Bank rate limit exceeded", 429, endpoint, payload);
    this.name = "UpRateLimitedError";
    this.retryAfterMs = retryAfterMs;
  }
}

/** 4xx errors that aren't 401/429. */
export class UpClientError extends UpApiError {
  constructor(message: string, status: number, endpoint: string, payload: UpApiErrorPayload | null) {
    super(message, status, endpoint, payload);
    this.name = "UpClientError";
  }
}

/** 5xx — already auto-retried once on backoff. Treat as transient. */
export class UpServerError extends UpApiError {
  constructor(message: string, status: number, endpoint: string, payload: UpApiErrorPayload | null) {
    super(message, status, endpoint, payload);
    this.name = "UpServerError";
  }
}

/**
 * Specifically the "limit reached" variant of POST /webhooks (max 10 per PAT).
 * Detected by inspecting the 4xx error title.
 */
export class UpWebhookLimitReachedError extends UpClientError {
  constructor(endpoint: string, payload: UpApiErrorPayload | null) {
    super(
      "You've reached the maximum of 10 Up webhooks. Delete an unused webhook from your Up account before adding another.",
      400,
      endpoint,
      payload
    );
    this.name = "UpWebhookLimitReachedError";
  }
}

/**
 * Parse `Retry-After` header. Up's docs don't currently publish a 429 schema
 * but we honor both delta-seconds (`"30"`) and HTTP-date (`"Wed, 21 Oct 2025 07:28:00 GMT"`)
 * forms per RFC 7231 §7.1.3.
 */
export function parseRetryAfter(headerValue: string | null): number | null {
  if (!headerValue) return null;

  // Delta-seconds form
  const seconds = Number(headerValue);
  if (!Number.isNaN(seconds) && Number.isFinite(seconds) && seconds >= 0) {
    return Math.floor(seconds * 1000);
  }

  // HTTP-date form
  const date = Date.parse(headerValue);
  if (!Number.isNaN(date)) {
    const delta = date - Date.now();
    return delta > 0 ? delta : 0;
  }

  return null;
}

/**
 * Detect the "you've already got 10 webhooks" 4xx variant.
 *
 * Up's actual error payload at that limit:
 *   { errors: [{ title: "Webhook Quota Reached", detail: "..." }] }
 * The title-string match is heuristic; we also accept any payload whose
 * detail mentions "limit" or "quota".
 */
export function isWebhookLimitReached(payload: UpApiErrorPayload | null): boolean {
  if (!payload?.errors?.length) return false;
  const e = payload.errors[0];
  const title = (e.title ?? "").toLowerCase();
  const detail = (e.detail ?? "").toLowerCase();
  return (
    title.includes("quota") ||
    title.includes("limit") ||
    detail.includes("maximum") ||
    detail.includes("limit") ||
    detail.includes("quota")
  );
}
