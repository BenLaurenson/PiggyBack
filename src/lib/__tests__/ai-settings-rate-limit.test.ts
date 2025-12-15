import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

/**
 * Tests for Issue 33 — AI Settings API Key Update Has No Rate Limit
 *
 * Verifies:
 * 1. The AI settings POST route imports and uses a rate limiter
 * 2. When rate limit is exceeded, the route returns 429
 * 3. The aiSettingsLimiter is exported from rate-limiter.ts with correct config
 */

vi.mock('@/utils/supabase/server', () => ({
  createClient: vi.fn(),
}));

describe('AI settings rate limiting', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllEnvs();
  });

  it('should export aiSettingsLimiter with 5 requests per hour', async () => {
    const { aiSettingsLimiter } = await import('@/lib/rate-limiter');

    expect(aiSettingsLimiter).toBeDefined();

    // Should allow 5 requests
    for (let i = 0; i < 5; i++) {
      expect(aiSettingsLimiter.check('user-1').allowed).toBe(true);
    }

    // 6th request should be blocked
    const result = aiSettingsLimiter.check('user-1');
    expect(result.allowed).toBe(false);
    expect(result.remaining).toBe(0);
  });

  it('should return 429 when rate limit is exceeded', async () => {
    // Stub non-demo mode
    vi.stubEnv('NEXT_PUBLIC_DEMO_MODE', 'false');

    // Setup mock supabase with user
    const mockGetUser = vi.fn().mockResolvedValue({
      data: { user: { id: 'user-rate-limited' } },
    });

    const mockUpdateChain = {
      update: vi.fn().mockReturnValue({
        eq: vi.fn().mockResolvedValue({ error: null }),
      }),
    };

    const mockSupabase = {
      auth: { getUser: mockGetUser },
      from: vi.fn().mockReturnValue(mockUpdateChain),
    };

    const { createClient } = await import('@/utils/supabase/server');
    (createClient as any).mockResolvedValue(mockSupabase);

    const { POST } = await import('@/app/api/ai/settings/route');

    // Make 5 requests (all allowed)
    for (let i = 0; i < 5; i++) {
      const request = new Request('http://localhost:3000/api/ai/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider: 'openai' }),
      });
      await POST(request);
    }

    // 6th request should be rate limited
    const request = new Request('http://localhost:3000/api/ai/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ provider: 'openai' }),
    });

    const response = await POST(request);
    expect(response.status).toBe(429);

    const json = await response.json();
    expect(json.error).toBeDefined();
  });
});
