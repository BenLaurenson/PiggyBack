import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createWiseApiClient } from '@/lib/wise-api';

const okResponse = (body: unknown) => ({
  ok: true,
  status: 200,
  json: async () => body,
  text: async () => JSON.stringify(body),
});

describe('createWiseApiClient', () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
  });

  it('uses the live base URL by default', () => {
    const client = createWiseApiClient('tok', 'live');
    expect(client.baseUrl).toBe('https://api.wise.com');
  });

  it('uses the sandbox base URL when requested', () => {
    const client = createWiseApiClient('tok', 'sandbox');
    expect(client.baseUrl).toBe('https://api.sandbox.transferwise.tech');
  });

  it('ping sends Authorization header and returns the response body', async () => {
    const fetchSpy = vi.fn().mockResolvedValue(okResponse({ id: 1, email: 'a@b.com' }));
    vi.stubGlobal('fetch', fetchSpy);
    const client = createWiseApiClient('tok-123', 'live');
    const me = await client.ping();
    expect(me).toEqual({ id: 1, email: 'a@b.com' });
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [url, init] = fetchSpy.mock.calls[0];
    expect(url).toBe('https://api.wise.com/v1/me');
    expect((init as RequestInit).headers).toMatchObject({
      Authorization: 'Bearer tok-123',
    });
  });

  it('getProfiles returns the JSON array', async () => {
    const profiles = [
      { id: 1, type: 'PERSONAL' },
      { id: 2, type: 'BUSINESS' },
    ];
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(okResponse(profiles)));
    const client = createWiseApiClient('tok', 'live');
    const result = await client.getProfiles();
    expect(result).toEqual(profiles);
  });

  it('throws WiseApiError on non-ok response', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      statusText: 'Unauthorized',
      text: async () => '{"errors":[{"message":"bad token"}]}',
    }));
    const client = createWiseApiClient('tok', 'live');
    await expect(client.ping()).rejects.toMatchObject({
      name: 'WiseApiError',
      status: 401,
    });
  });

  it('getBalances calls the balances endpoint for a profile', async () => {
    const fetchSpy = vi.fn().mockResolvedValue(okResponse([
      { id: 999, currency: 'AUD', amount: { value: 100, currency: 'AUD' } },
    ]));
    vi.stubGlobal('fetch', fetchSpy);
    const client = createWiseApiClient('tok', 'live');
    await client.getBalances(42);
    const [url] = fetchSpy.mock.calls[0];
    expect(url).toContain('/v4/profiles/42/balances');
    expect(url).toContain('types=STANDARD');
  });

  it('getStatementPage targets the verified balance-statements path with type=FLAT and the date window', async () => {
    const fetchSpy = vi.fn().mockResolvedValue(okResponse({
      transactions: [
        {
          referenceNumber: 'REDACTED_REFERENCE_001',
          date: '2026-05-23T03:00:00.000Z',
          amount: { value: -110, currency: 'AUD' },
          details: { type: 'CARD', description: 'AWS Sydney' },
          runningBalance: { value: 1000, currency: 'AUD' },
        },
      ],
    }));
    vi.stubGlobal('fetch', fetchSpy);
    const client = createWiseApiClient('tok', 'live');
    const page = await client.getStatementPage({
      profileId: 42,
      balanceId: 999,
      currency: 'AUD',
      intervalStart: '2026-01-01T00:00:00.000Z',
      intervalEnd: '2026-05-25T23:59:59.999Z',
    });
    const [url] = fetchSpy.mock.calls[0];
    expect(url).toContain('/v1/profiles/42/balance-statements/999/statement.json');
    expect(url).toContain('currency=AUD');
    expect(url).toContain('type=FLAT');
    expect(url).toContain('intervalStart=2026-01-01T00%3A00%3A00.000Z');
    expect(page.entries).toHaveLength(1);
    expect(page.entries[0].referenceNumber).toBe('REDACTED_REFERENCE_001');
    expect(page.nextCursor).toBeNull();
  });
});
