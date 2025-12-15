/**
 * Simple in-memory rate limiter using a sliding window approach.
 *
 * Tracks per-user request counts with automatic window reset.
 * Designed for serverless environments where in-memory state is
 * acceptable (resets on cold start, which is fine for rate limiting).
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

export class RateLimiter {
  private entries: Map<string, RateLimitEntry> = new Map();
  private maxRequests: number;
  private windowMs: number;

  constructor(config: RateLimitConfig) {
    this.maxRequests = config.maxRequests;
    this.windowMs = config.windowMs;
  }

  /**
   * Check if a request from the given user ID is allowed.
   * If allowed, increments the counter and returns the result.
   */
  check(userId: string): RateLimitResult {
    const now = Date.now();
    const entry = this.entries.get(userId);

    // If no entry or window has expired, start a new window
    if (!entry || now >= entry.resetAt) {
      this.entries.set(userId, {
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
   * Call periodically in long-running processes.
   */
  cleanup(): void {
    const now = Date.now();
    for (const [userId, entry] of this.entries) {
      if (now >= entry.resetAt) {
        this.entries.delete(userId);
      }
    }
  }
}

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
