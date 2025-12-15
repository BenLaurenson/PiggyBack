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

    it('should automatically clean up expired entries during check()', async () => {
      const { RateLimiter } = await import('@/lib/rate-limiter');
      const limiter = new RateLimiter({ maxRequests: 5, windowMs: 60_000 });

      // Create entries for 100 different keys
      for (let i = 0; i < 100; i++) {
        limiter.check(`user-${i}`);
      }

      // Advance past the window and past the cleanup interval (5 minutes)
      vi.advanceTimersByTime(5 * 60 * 1000 + 1);

      // Trigger cleanup via a new check()
      limiter.check('trigger-cleanup');

      // The limiter should have cleaned up all 100 expired entries
      // We can verify by checking that old keys get fresh windows
      const result = limiter.check('user-0');
      expect(result.allowed).toBe(true);
      expect(result.remaining).toBe(4); // Fresh window: 5 max - 1 used = 4
    });
  });

  describe('utility functions', () => {
    it('getClientIp should extract IP from x-forwarded-for header', async () => {
      const { getClientIp } = await import('@/lib/rate-limiter');
      const request = new Request('http://localhost', {
        headers: { 'x-forwarded-for': '1.2.3.4, 5.6.7.8' },
      });
      expect(getClientIp(request)).toBe('1.2.3.4');
    });

    it('getClientIp should extract IP from x-real-ip header', async () => {
      const { getClientIp } = await import('@/lib/rate-limiter');
      const request = new Request('http://localhost', {
        headers: { 'x-real-ip': '10.0.0.1' },
      });
      expect(getClientIp(request)).toBe('10.0.0.1');
    });

    it('getClientIp should prefer x-forwarded-for over x-real-ip', async () => {
      const { getClientIp } = await import('@/lib/rate-limiter');
      const request = new Request('http://localhost', {
        headers: {
          'x-forwarded-for': '1.2.3.4',
          'x-real-ip': '10.0.0.1',
        },
      });
      expect(getClientIp(request)).toBe('1.2.3.4');
    });

    it('getClientIp should return "unknown" when no IP headers present', async () => {
      const { getClientIp } = await import('@/lib/rate-limiter');
      const request = new Request('http://localhost');
      expect(getClientIp(request)).toBe('unknown');
    });

    it('rateLimitKey should combine userId and IP', async () => {
      const { rateLimitKey } = await import('@/lib/rate-limiter');
      expect(rateLimitKey('user-123', '1.2.3.4')).toBe('user-123:1.2.3.4');
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
