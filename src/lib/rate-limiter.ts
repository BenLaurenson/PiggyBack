/**
 * Simple in-memory rate limiter using a sliding window approach.
 *
 * Tracks per-key request counts with automatic window reset.
 *
 * LIMITATION: This uses an in-memory Map that resets on serverless cold starts.
 * This means rate limits are NOT durable across function invocations — an attacker
 * who waits for (or triggers) a cold start can bypass rate limits entirely.
 * For production hardening, replace with a Redis/Upstash-backed implementation
 * (e.g. @upstash/ratelimit) that persists state across invocations.
 */

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

interface RateLimitConfig {
  /** Maximum number of requests allowed per window */
  maxRequests: number;
  /** Window duration in milliseconds */
  windowMs: number;
}

interface RateLimitResult {
  /** Whether the request is allowed */
  allowed: boolean;
  /** Number of remaining requests in the current window */
  remaining: number;
  /** Milliseconds until the rate limit resets (only set when blocked) */
  retryAfterMs?: number;
}

/** Interval between automatic cleanup sweeps (5 minutes) */
const CLEANUP_INTERVAL_MS = 5 * 60 * 1000;

export class RateLimiter {
  private entries: Map<string, RateLimitEntry> = new Map();
  private maxRequests: number;
  private windowMs: number;
  private lastCleanup: number = Date.now();

  constructor(config: RateLimitConfig) {
    this.maxRequests = config.maxRequests;
    this.windowMs = config.windowMs;
  }

  /**
   * Check if a request for the given key is allowed.
   * If allowed, increments the counter and returns the result.
   *
   * Periodically cleans up expired entries to prevent memory leaks.
   */
  check(key: string): RateLimitResult {
    const now = Date.now();

    // Periodically clean up expired entries to prevent unbounded memory growth
    if (now - this.lastCleanup > CLEANUP_INTERVAL_MS) {
      this.cleanup();
      this.lastCleanup = now;
    }

    const entry = this.entries.get(key);

    // If no entry or window has expired, start a new window
    if (!entry || now >= entry.resetAt) {
      this.entries.set(key, {
        count: 1,
        resetAt: now + this.windowMs,
      });
      return {
        allowed: true,
        remaining: this.maxRequests - 1,
      };
    }

    // Window is still active
    if (entry.count < this.maxRequests) {
      entry.count++;
      return {
        allowed: true,
        remaining: this.maxRequests - entry.count,
      };
    }

    // Rate limit exceeded
    return {
      allowed: false,
      remaining: 0,
      retryAfterMs: entry.resetAt - now,
    };
  }

  /**
   * Clean up expired entries to prevent memory leaks.
   * Called automatically during check() every CLEANUP_INTERVAL_MS.
   */
  cleanup(): void {
    const now = Date.now();
    for (const [key, entry] of this.entries) {
      if (now >= entry.resetAt) {
        this.entries.delete(key);
      }
    }
  }
}

/**
 * Extract the client IP address from a Request object.
 * Checks x-forwarded-for (first IP in chain) and x-real-ip headers.
 * Returns "unknown" if no IP can be determined.
 */
export function getClientIp(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) {
    // x-forwarded-for may contain multiple IPs; the first is the client
    return forwarded.split(",")[0].trim();
  }
  return request.headers.get("x-real-ip") || "unknown";
}

/**
 * Build a composite rate limit key from user ID and IP address.
 * This provides defense-in-depth: rate limiting by both identity and origin.
 */
export function rateLimitKey(userId: string, ip: string): string {
  return `${userId}:${ip}`;
}

// General API rate limiter for state-changing endpoints without specific limiters
export const generalApiLimiter = new RateLimiter({
  maxRequests: 30,
  windowMs: 60 * 1000, // 30 req/min
});

// Pre-configured limiters for specific endpoints
// Chat endpoint: 10 requests per minute
export const chatLimiter = new RateLimiter({
  maxRequests: 10,
  windowMs: 60_000, // 1 minute
});

// Auto-detect endpoint: 5 requests per hour
export const autoDetectLimiter = new RateLimiter({
  maxRequests: 5,
  windowMs: 3_600_000, // 1 hour
});

// AI settings endpoint: 5 updates per hour per user
export const aiSettingsLimiter = new RateLimiter({
  maxRequests: 5,
  windowMs: 3_600_000, // 1 hour
});

// Sync endpoint: 2 syncs per 5 minutes
export const syncLimiter = new RateLimiter({
  maxRequests: 2,
  windowMs: 5 * 60_000, // 5 minutes
});

// Batch operations (rematch-all, backfill-all, recalculate-periods): 3 per minute
export const batchOperationLimiter = new RateLimiter({
  maxRequests: 3,
  windowMs: 60_000, // 1 minute
});

// Export endpoint: 5 per minute
export const exportLimiter = new RateLimiter({
  maxRequests: 5,
  windowMs: 60_000, // 1 minute
});

// General read limiter for expensive GET endpoints (budget summary, AI context, transactions)
export const generalReadLimiter = new RateLimiter({
  maxRequests: 60,
  windowMs: 60_000, // 60 req/min
});

// Webhook endpoint: IP-based, 120 per minute (Up Bank may send bursts)
export const webhookLimiter = new RateLimiter({
  maxRequests: 120,
  windowMs: 60_000, // 1 minute
});
