import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Tests for Issue 31 — Inconsistent Demo Mode Guard in API Routes
 *
 * Verifies that mutation API routes (POST/PUT/DELETE) return a demo-mode
 * response when NEXT_PUBLIC_DEMO_MODE is "true".
 */

// Mock supabase server
vi.mock('@/utils/supabase/server', () => ({
  createClient: vi.fn(),
}));

// Mock budget calculations
vi.mock('@/lib/budget-zero-calculations', () => ({
  calculateNextDueDate: vi.fn(),
}));

describe('demo mode guards on mutation routes', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  describe('POST /api/budget/expenses/match', () => {
    it('should return demo mode response when demo mode is active', async () => {
      // Enable demo mode
      vi.stubEnv('NEXT_PUBLIC_DEMO_MODE', 'true');

      const { POST } = await import('@/app/api/budget/expenses/match/route');

      const request = new Request('http://localhost:3000/api/budget/expenses/match', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ expense_id: 'exp-1', transaction_id: 'txn-1' }),
      });

      const response = await POST(request);
      const json = await response.json();

      expect(json.demo).toBe(true);
      expect(json.error).toBeDefined();

      vi.unstubAllEnvs();
    });
  });

  describe('DELETE /api/budget/expenses/match', () => {
    it('should return demo mode response when demo mode is active', async () => {
      vi.stubEnv('NEXT_PUBLIC_DEMO_MODE', 'true');

      const { DELETE } = await import('@/app/api/budget/expenses/match/route');

      const request = new Request(
        'http://localhost:3000/api/budget/expenses/match?transaction_id=txn-1',
        { method: 'DELETE' }
      );

      const response = await DELETE(request);
      const json = await response.json();

      expect(json.demo).toBe(true);
      expect(json.error).toBeDefined();

      vi.unstubAllEnvs();
    });
  });

  describe('POST /api/budget/zero/assign', () => {
    it('should return demo mode response when demo mode is active', async () => {
      vi.stubEnv('NEXT_PUBLIC_DEMO_MODE', 'true');

      const { POST } = await import('@/app/api/budget/zero/assign/route');

      const request = new Request('http://localhost:3000/api/budget/zero/assign', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          partnership_id: 'p-1',
          month: '2026-01-01',
          category_name: 'Food',
          assigned_cents: 10000,
        }),
      });

      const response = await POST(request);
      const json = await response.json();

      expect(json.demo).toBe(true);
      expect(json.error).toBeDefined();

      vi.unstubAllEnvs();
    });
  });

  describe('POST /api/ai/settings', () => {
    it('should return demo mode response when demo mode is active', async () => {
      vi.stubEnv('NEXT_PUBLIC_DEMO_MODE', 'true');

      const { POST } = await import('@/app/api/ai/settings/route');

      const request = new Request('http://localhost:3000/api/ai/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider: 'openai', model: 'gpt-4' }),
      });

      const response = await POST(request);
      const json = await response.json();

      expect(json.demo).toBe(true);
      expect(json.error).toBeDefined();

      vi.unstubAllEnvs();
    });
  });
});
