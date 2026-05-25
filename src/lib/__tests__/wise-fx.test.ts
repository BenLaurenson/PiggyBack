import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fetchAudRateForCurrency, convertToAudCents, __clearFxCache } from '@/lib/wise-fx';

describe('wise-fx', () => {
  beforeEach(() => {
    __clearFxCache();
    vi.unstubAllGlobals();
  });

  it('returns 1 for AUD without calling the network', async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
    const rate = await fetchAudRateForCurrency('AUD', new Date('2026-05-25'));
    expect(rate).toBe(1);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('fetches AUD-per-unit rate from Frankfurter for non-AUD', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ amount: 1, base: 'USD', date: '2026-05-23', rates: { AUD: 1.5234 } }),
      }),
    );
    const rate = await fetchAudRateForCurrency('USD', new Date('2026-05-25'));
    expect(rate).toBe(1.5234);
  });

  it('throws when the feed returns a non-ok response', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: false, status: 502, statusText: 'Bad Gateway' }),
    );
    await expect(fetchAudRateForCurrency('USD', new Date('2026-05-25'))).rejects.toThrow(
      /Frankfurter/,
    );
  });

  it('caches a previously-fetched (currency, date) pair', async () => {
    const fetchSpy = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ amount: 1, base: 'EUR', date: '2026-05-23', rates: { AUD: 1.6500 } }),
    });
    vi.stubGlobal('fetch', fetchSpy);
    await fetchAudRateForCurrency('EUR', new Date('2026-05-25'));
    await fetchAudRateForCurrency('EUR', new Date('2026-05-25'));
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it('converts native cents to AUD cents using the provided rate', () => {
    expect(convertToAudCents(10_000, 1.5234)).toBe(15_234);
    expect(convertToAudCents(-10_000, 1.5234)).toBe(-15_234);
    expect(convertToAudCents(10_000, 1.52345)).toBe(15_235);
  });
});
