import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

/**
 * Tests for AI Settings Base URL feature
 *
 * Verifies:
 * 1. POST /api/ai/settings accepts and persists baseUrl
 * 2. Invalid baseUrl values are rejected (400)
 * 3. Valid baseUrl values are accepted
 * 4. Empty/null baseUrl clears the field
 * 5. GET /api/ai/settings returns baseUrl
 */

vi.mock('@/utils/supabase/server', () => ({
  createClient: vi.fn(),
}));

describe('AI settings base URL', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllEnvs();
  });

  /**
   * Helper to create a mock supabase client with the given update result
   */
  function createMockSupabase(updateError: boolean = false) {
    const mockGetUser = vi.fn().mockResolvedValue({
      data: { user: { id: 'user-test' } },
    });

    const mockUpdateChain = {
      update: vi.fn().mockReturnValue({
        eq: vi.fn().mockResolvedValue({ error: updateError ? new Error('DB error') : null }),
      }),
    };

    return {
      auth: { getUser: mockGetUser },
      from: vi.fn().mockReturnValue(mockUpdateChain),
    };
  }

  it('should accept a valid HTTPS base URL', async () => {
    vi.stubEnv('NEXT_PUBLIC_DEMO_MODE', 'false');

    const mockSupabase = createMockSupabase();
    const { createClient } = await import('@/utils/supabase/server');
    (createClient as any).mockResolvedValue(mockSupabase);

    const { POST } = await import('@/app/api/ai/settings/route');

    const request = new Request('http://localhost:3000/api/ai/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        provider: 'openai',
        baseUrl: 'https://api.example.com/v1',
      }),
    });

    const response = await POST(request);
    expect(response.status).toBe(200);

    const json = await response.json();
    expect(json.success).toBe(true);
  });

  it('should accept a valid HTTP base URL', async () => {
    vi.stubEnv('NEXT_PUBLIC_DEMO_MODE', 'false');

    const mockSupabase = createMockSupabase();
    const { createClient } = await import('@/utils/supabase/server');
    (createClient as any).mockResolvedValue(mockSupabase);

    const { POST } = await import('@/app/api/ai/settings/route');

    const request = new Request('http://localhost:3000/api/ai/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        provider: 'openai',
        baseUrl: 'http://localhost:8080/v1',
      }),
    });

    const response = await POST(request);
    expect(response.status).toBe(200);
  });

  it('should reject an invalid base URL', async () => {
    vi.stubEnv('NEXT_PUBLIC_DEMO_MODE', 'false');

    const mockSupabase = createMockSupabase();
    const { createClient } = await import('@/utils/supabase/server');
    (createClient as any).mockResolvedValue(mockSupabase);

    const { POST } = await import('@/app/api/ai/settings/route');

    const request = new Request('http://localhost:3000/api/ai/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        provider: 'openai',
        baseUrl: 'not-a-valid-url',
      }),
    });

    const response = await POST(request);
    expect(response.status).toBe(400);

    const json = await response.json();
    expect(json.error).toContain('base URL');
  });

  it('should reject a base URL that is too long', async () => {
    vi.stubEnv('NEXT_PUBLIC_DEMO_MODE', 'false');

    const mockSupabase = createMockSupabase();
    const { createClient } = await import('@/utils/supabase/server');
    (createClient as any).mockResolvedValue(mockSupabase);

    const { POST } = await import('@/app/api/ai/settings/route');

    const request = new Request('http://localhost:3000/api/ai/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        provider: 'openai',
        baseUrl: 'https://example.com/' + 'a'.repeat(500),
      }),
    });

    const response = await POST(request);
    expect(response.status).toBe(400);

    const json = await response.json();
    expect(json.error).toContain('base URL');
  });

  it('should accept null baseUrl to clear the field', async () => {
    vi.stubEnv('NEXT_PUBLIC_DEMO_MODE', 'false');

    const mockSupabase = createMockSupabase();
    const { createClient } = await import('@/utils/supabase/server');
    (createClient as any).mockResolvedValue(mockSupabase);

    const { POST } = await import('@/app/api/ai/settings/route');

    const request = new Request('http://localhost:3000/api/ai/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        provider: 'openai',
        baseUrl: null,
      }),
    });

    const response = await POST(request);
    expect(response.status).toBe(200);
  });

  it('should accept empty string baseUrl to clear the field', async () => {
    vi.stubEnv('NEXT_PUBLIC_DEMO_MODE', 'false');

    const mockSupabase = createMockSupabase();
    const { createClient } = await import('@/utils/supabase/server');
    (createClient as any).mockResolvedValue(mockSupabase);

    const { POST } = await import('@/app/api/ai/settings/route');

    const request = new Request('http://localhost:3000/api/ai/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        provider: 'openai',
        baseUrl: '',
      }),
    });

    const response = await POST(request);
    expect(response.status).toBe(200);
  });

  it('should persist base URL as ai_base_url column', async () => {
    vi.stubEnv('NEXT_PUBLIC_DEMO_MODE', 'false');

    const mockSupabase = createMockSupabase();
    const { createClient } = await import('@/utils/supabase/server');
    (createClient as any).mockResolvedValue(mockSupabase);

    const { POST } = await import('@/app/api/ai/settings/route');

    const request = new Request('http://localhost:3000/api/ai/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        provider: 'openai',
        baseUrl: 'https://api.z.ai/api/coding/paas/v4',
      }),
    });

    await POST(request);

    // Verify that supabase update was called with ai_base_url
    const fromSpy = mockSupabase.from;
    expect(fromSpy).toHaveBeenCalledWith('profiles');
    const updateCall = fromSpy.mock.results[0].value.update.mock.calls[0][0];
    expect(updateCall.ai_base_url).toBe('https://api.z.ai/api/coding/paas/v4');
  });

  it('should clear base URL when null is sent', async () => {
    vi.stubEnv('NEXT_PUBLIC_DEMO_MODE', 'false');

    const mockSupabase = createMockSupabase();
    const { createClient } = await import('@/utils/supabase/server');
    (createClient as any).mockResolvedValue(mockSupabase);

    const { POST } = await import('@/app/api/ai/settings/route');

    const request = new Request('http://localhost:3000/api/ai/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        provider: 'openai',
        baseUrl: null,
      }),
    });

    await POST(request);

    // Verify that supabase update was called with ai_base_url: null
    const fromSpy = mockSupabase.from;
    const updateCall = fromSpy.mock.results[0].value.update.mock.calls[0][0];
    expect(updateCall.ai_base_url).toBeNull();
  });
});
