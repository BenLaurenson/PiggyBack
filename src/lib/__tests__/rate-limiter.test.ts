import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

/**
 * Tests for Issue 19: Rate Limiting on AI Endpoints
 *
 * Verifies the in-memory rate limiter blocks after exceeding limits
 * and resets after the window expires.
 */

describe('rate-limiter', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.resetModules();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('RateLimiter class', () => {
    it('should allow requests within the limit', async () => {
      const { RateLimiter } = await import('@/lib/rate-limiter');
      const limiter = new RateLimiter({ maxRequests: 10, windowMs: 60_000 });

      for (let i = 0; i < 10; i++) {
        expect(limiter.check('user-1')).toEqual({ allowed: true, remaining: 10 - i - 1 });
      }
    });

    it('should block requests after exceeding the limit', async () => {
      const { RateLimiter } = await import('@/lib/rate-limiter');
      const limiter = new RateLimiter({ maxRequests: 3, windowMs: 60_000 });

      // Use up all 3 requests
      limiter.check('user-1');
      limiter.check('user-1');
      limiter.check('user-1');

      // 4th request should be blocked
      const result = limiter.check('user-1');
      expect(result.allowed).toBe(false);
      expect(result.remaining).toBe(0);
      expect(result.retryAfterMs).toBeDefined();
      expect(result.retryAfterMs!).toBeGreaterThan(0);
    });

    it('should reset after the window expires', async () => {
      const { RateLimiter } = await import('@/lib/rate-limiter');
      const limiter = new RateLimiter({ maxRequests: 2, windowMs: 60_000 });

      // Use up both requests
      limiter.check('user-1');
      limiter.check('user-1');
      expect(limiter.check('user-1').allowed).toBe(false);

      // Advance time past the window
      vi.advanceTimersByTime(60_001);

      // Should be allowed again
      const result = limiter.check('user-1');
      expect(result.allowed).toBe(true);
      expect(result.remaining).toBe(1);
    });

    it('should track different users independently', async () => {
      const { RateLimiter } = await import('@/lib/rate-limiter');
      const limiter = new RateLimiter({ maxRequests: 1, windowMs: 60_000 });

      // User 1 uses their one request
      expect(limiter.check('user-1').allowed).toBe(true);
      expect(limiter.check('user-1').allowed).toBe(false);

      // User 2 should still be allowed
      expect(limiter.check('user-2').allowed).toBe(true);
      expect(limiter.check('user-2').allowed).toBe(false);
    });

    it('should return retryAfterMs with the time until window reset', async () => {
      const { RateLimiter } = await import('@/lib/rate-limiter');
      const limiter = new RateLimiter({ maxRequests: 1, windowMs: 60_000 });

      limiter.check('user-1');

      // Advance 30 seconds
      vi.advanceTimersByTime(30_000);

      const result = limiter.check('user-1');
      expect(result.allowed).toBe(false);
      // Should have roughly 30 seconds remaining
      expect(result.retryAfterMs).toBeLessThanOrEqual(30_000);
      expect(result.retryAfterMs).toBeGreaterThan(29_000);
    });
  });

  describe('pre-configured limiters', () => {
    it('should export chatLimiter with 10 req/min', async () => {
      const { chatLimiter } = await import('@/lib/rate-limiter');
      expect(chatLimiter).toBeDefined();

      // Should allow 10 requests
      for (let i = 0; i < 10; i++) {
        expect(chatLimiter.check('user-1').allowed).toBe(true);
      }
      // 11th should be blocked
      expect(chatLimiter.check('user-1').allowed).toBe(false);
    });

    it('should export autoDetectLimiter with 5 req/hour', async () => {
      const { autoDetectLimiter } = await import('@/lib/rate-limiter');
      expect(autoDetectLimiter).toBeDefined();

      // Should allow 5 requests
      for (let i = 0; i < 5; i++) {
        expect(autoDetectLimiter.check('user-1').allowed).toBe(true);
      }
      // 6th should be blocked
      expect(autoDetectLimiter.check('user-1').allowed).toBe(false);
    });
  });
});
