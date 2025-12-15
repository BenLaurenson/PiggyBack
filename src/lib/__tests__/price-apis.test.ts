import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  fetchCryptoPrice,
  fetchMultipleCryptoPrices,
  fetchStockPrice,
  fetchYahooFinancePrice,
  fetchExchangeRateToAud,
  fetchInvestmentPrice,
} from "../price-apis";

// Mock global fetch
const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

beforeEach(() => {
  mockFetch.mockReset();
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ─── Helpers ────────────────────────────────────────────────

function makeCoinGeckoResponse(coinId: string, aud: number, change: number, updatedAt: number) {
  return {
    ok: true,
    json: () =>
      Promise.resolve({
        [coinId]: {
          aud,
          aud_24h_change: change,
          last_updated_at: updatedAt,
        },
      }),
  };
}

function makeYahooResponse(price: number, previousClose: number, currency = "AUD") {
  return {
    ok: true,
    json: () =>
      Promise.resolve({
        chart: {
          result: [
            {
              meta: {
                regularMarketPrice: price,
                previousClose,
                currency,
              },
            },
          ],
        },
      }),
  };
}

function makeEmptyYahooResponse() {
  return {
    ok: true,
    json: () =>
      Promise.resolve({
        chart: { result: [{ meta: {} }] },
      }),
  };
}

function makeForexResponse(rate: number) {
  return {
    ok: true,
    json: () =>
      Promise.resolve({
        chart: {
          result: [
            {
              meta: {
                regularMarketPrice: rate,
              },
            },
          ],
        },
      }),
  };
}

// ─── fetchCryptoPrice ───────────────────────────────────────

describe("fetchCryptoPrice", () => {
  it("fetches BTC price using symbol map", async () => {
    const ts = Math.floor(Date.now() / 1000);
    mockFetch.mockResolvedValueOnce(makeCoinGeckoResponse("bitcoin", 95000.5, -2.3, ts));

    const result = await fetchCryptoPrice("BTC");

    expect(result).not.toBeNull();
    expect(result!.price).toBe(95000.5);
    expect(result!.currency).toBe("AUD");
    expect(result!.change24h).toBe(-2.3);
    expect(result!.source).toBe("coingecko");

    // Verify URL contains mapped coin id
    expect(mockFetch).toHaveBeenCalledTimes(1);
    const url = mockFetch.mock.calls[0][0];
    expect(url).toContain("ids=bitcoin");
  });

  it("maps ETH to ethereum", async () => {
    const ts = Math.floor(Date.now() / 1000);
    mockFetch.mockResolvedValueOnce(makeCoinGeckoResponse("ethereum", 4200, 5.1, ts));

    const result = await fetchCryptoPrice("ETH");

    expect(result!.price).toBe(4200);
    const url = mockFetch.mock.calls[0][0];
    expect(url).toContain("ids=ethereum");
  });

  it("uses lowercase symbol for unknown coins", async () => {
    const ts = Math.floor(Date.now() / 1000);
    mockFetch.mockResolvedValueOnce(makeCoinGeckoResponse("avalanche-2", 45, 1.5, ts));

    const result = await fetchCryptoPrice("avalanche-2");

    expect(result!.price).toBe(45);
  });

  it("returns null when coin not found in response", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({}),
    });

    const result = await fetchCryptoPrice("NONEXISTENT");
    expect(result).toBeNull();
  });

  it("returns null on API error", async () => {
    mockFetch.mockResolvedValueOnce({ ok: false, status: 429 });

    const result = await fetchCryptoPrice("BTC");
    expect(result).toBeNull();
  });

  it("returns null on network error", async () => {
    mockFetch.mockRejectedValueOnce(new Error("Network failure"));

    const result = await fetchCryptoPrice("BTC");
    expect(result).toBeNull();
  });

  it("converts lastUpdated timestamp to ISO string", async () => {
    const ts = 1700000000; // 2023-11-14T22:13:20Z
    mockFetch.mockResolvedValueOnce(makeCoinGeckoResponse("bitcoin", 50000, 0, ts));

    const result = await fetchCryptoPrice("BTC");
    expect(result!.lastUpdated).toBe(new Date(ts * 1000).toISOString());
  });
});

// ─── fetchMultipleCryptoPrices ──────────────────────────────

describe("fetchMultipleCryptoPrices", () => {
  it("returns empty map for empty symbols", async () => {
    const result = await fetchMultipleCryptoPrices([]);
    expect(result.size).toBe(0);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("fetches multiple crypto prices in single call", async () => {
    const ts = Math.floor(Date.now() / 1000);
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () =>
        Promise.resolve({
          bitcoin: { aud: 95000, aud_24h_change: -1, last_updated_at: ts },
          ethereum: { aud: 4200, aud_24h_change: 3, last_updated_at: ts },
          solana: { aud: 180, aud_24h_change: 5, last_updated_at: ts },
        }),
    });

    const result = await fetchMultipleCryptoPrices(["BTC", "ETH", "SOL"]);

    expect(result.size).toBe(3);
    expect(result.get("BTC")!.price).toBe(95000);
    expect(result.get("ETH")!.price).toBe(4200);
    expect(result.get("SOL")!.price).toBe(180);

    // Single fetch call for all
    expect(mockFetch).toHaveBeenCalledTimes(1);
    const url = mockFetch.mock.calls[0][0];
    expect(url).toContain("bitcoin");
    expect(url).toContain("ethereum");
    expect(url).toContain("solana");
  });

  it("deduplicates coin IDs", async () => {
    const ts = Math.floor(Date.now() / 1000);
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () =>
        Promise.resolve({
          bitcoin: { aud: 95000, aud_24h_change: 0, last_updated_at: ts },
        }),
    });

    const result = await fetchMultipleCryptoPrices(["BTC", "BTC"]);

    // Both map to bitcoin, should only appear once in URL
    const url = mockFetch.mock.calls[0][0];
    const matches = url.match(/bitcoin/g);
    expect(matches).toHaveLength(1);
    // Both symbols should still get results
    expect(result.size).toBe(1); // Map dedupes by uppercase key
    expect(result.get("BTC")).toBeDefined();
  });

  it("returns empty map on API error", async () => {
    mockFetch.mockResolvedValueOnce({ ok: false, status: 500 });

    const result = await fetchMultipleCryptoPrices(["BTC"]);
    expect(result.size).toBe(0);
  });

  it("returns empty map on network error", async () => {
    mockFetch.mockRejectedValueOnce(new Error("Network failure"));

    const result = await fetchMultipleCryptoPrices(["BTC"]);
    expect(result.size).toBe(0);
  });

  it("only returns results for coins found in response", async () => {
    const ts = Math.floor(Date.now() / 1000);
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () =>
        Promise.resolve({
          bitcoin: { aud: 95000, aud_24h_change: 0, last_updated_at: ts },
          // ethereum missing from response
        }),
    });

    const result = await fetchMultipleCryptoPrices(["BTC", "ETH"]);
    expect(result.size).toBe(1);
    expect(result.has("BTC")).toBe(true);
    expect(result.has("ETH")).toBe(false);
  });

  it("uppercases symbol keys in result map", async () => {
    const ts = Math.floor(Date.now() / 1000);
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () =>
        Promise.resolve({
          bitcoin: { aud: 50000, aud_24h_change: 0, last_updated_at: ts },
        }),
    });

    const result = await fetchMultipleCryptoPrices(["btc"]);
    expect(result.has("BTC")).toBe(true);
    expect(result.has("btc")).toBe(false);
  });
});

// ─── fetchYahooFinancePrice ─────────────────────────────────

describe("fetchYahooFinancePrice", () => {
  it("fetches ASX stock price with .AX suffix", async () => {
    mockFetch.mockResolvedValueOnce(makeYahooResponse(65.43, 64.80));

    const result = await fetchYahooFinancePrice("VDHG");

    expect(result).not.toBeNull();
    expect(result!.price).toBe(65.43);
    expect(result!.currency).toBe("AUD");
    expect(result!.source).toBe("yahoo");

    const url = mockFetch.mock.calls[0][0];
    expect(url).toContain("VDHG.AX");
  });

  it("calculates change and changePercent from previousClose", async () => {
    mockFetch.mockResolvedValueOnce(makeYahooResponse(100, 95));

    const result = await fetchYahooFinancePrice("TEST");

    expect(result!.change24h).toBeCloseTo(5);
    expect(result!.changePercent).toBeCloseTo(5.2632, 2);
  });

  it("falls back to bare symbol when .AX fails and converts USD to AUD", async () => {
    // .AX returns empty meta
    mockFetch.mockResolvedValueOnce(makeEmptyYahooResponse());
    // Bare symbol succeeds in USD
    mockFetch.mockResolvedValueOnce(makeYahooResponse(150.25, 148.00, "USD"));
    // Exchange rate: 1 USD = 1.55 AUD
    mockFetch.mockResolvedValueOnce(makeForexResponse(1.55));

    const result = await fetchYahooFinancePrice("AAPL");

    expect(result).not.toBeNull();
    // Price converted: 150.25 * 1.55 = 232.8875
    expect(result!.price).toBeCloseTo(232.89, 1);
    expect(result!.currency).toBe("AUD");
    expect(mockFetch).toHaveBeenCalledTimes(3);

    const secondUrl = mockFetch.mock.calls[1][0];
    expect(secondUrl).toContain("/AAPL?");
    expect(secondUrl).not.toContain(".AX");

    // Verify forex call
    const forexUrl = mockFetch.mock.calls[2][0];
    expect(forexUrl).toContain("USDAUD=X");
  });

  it("skips .AX suffix for symbols with existing dot", async () => {
    mockFetch.mockResolvedValueOnce(makeYahooResponse(45, 44));

    await fetchYahooFinancePrice("CBA.AX");

    expect(mockFetch).toHaveBeenCalledTimes(1);
    const url = mockFetch.mock.calls[0][0];
    expect(url).toContain("CBA.AX");
  });

  it("returns null when both attempts fail", async () => {
    mockFetch.mockResolvedValueOnce(makeEmptyYahooResponse());
    mockFetch.mockResolvedValueOnce(makeEmptyYahooResponse());

    const result = await fetchYahooFinancePrice("FAKE");
    expect(result).toBeNull();
  });

  it("returns null on HTTP error", async () => {
    mockFetch.mockResolvedValueOnce({ ok: false, status: 404 });
    mockFetch.mockResolvedValueOnce({ ok: false, status: 404 });

    const result = await fetchYahooFinancePrice("FAKE");
    expect(result).toBeNull();
  });

  it("returns null on network error", async () => {
    mockFetch.mockRejectedValueOnce(new Error("Network failure"));

    const result = await fetchYahooFinancePrice("VDHG");
    expect(result).toBeNull();
  });

  it("URL-encodes the symbol", async () => {
    mockFetch.mockResolvedValueOnce(makeYahooResponse(10, 9.5));

    await fetchYahooFinancePrice("TEST STOCK");

    const url = mockFetch.mock.calls[0][0];
    expect(url).toContain(encodeURIComponent("TEST STOCK.AX"));
  });

  it("handles zero previousClose without NaN", async () => {
    mockFetch.mockResolvedValueOnce(makeYahooResponse(50, 0));

    const result = await fetchYahooFinancePrice("NEW");

    expect(result!.changePercent).toBe(0);
  });

  it("skips symbol when exchange rate fetch fails and tries next", async () => {
    // .AX returns empty meta
    mockFetch.mockResolvedValueOnce(makeEmptyYahooResponse());
    // Bare symbol succeeds in USD
    mockFetch.mockResolvedValueOnce(makeYahooResponse(150.25, 148.00, "USD"));
    // Exchange rate fails
    mockFetch.mockResolvedValueOnce({ ok: false, status: 500 });

    const result = await fetchYahooFinancePrice("AAPL");

    // Both symbols exhausted (bare USD failed conversion), returns null
    expect(result).toBeNull();
  });

  it("does not fetch exchange rate for AUD prices", async () => {
    mockFetch.mockResolvedValueOnce(makeYahooResponse(65.43, 64.80, "AUD"));

    const result = await fetchYahooFinancePrice("VDHG");

    expect(result).not.toBeNull();
    expect(result!.price).toBe(65.43);
    expect(result!.currency).toBe("AUD");
    // Only 1 call — no exchange rate fetch
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });
});

// ─── fetchExchangeRateToAud ─────────────────────────────────

describe("fetchExchangeRateToAud", () => {
  it("returns 1 for AUD", async () => {
    const rate = await fetchExchangeRateToAud("AUD");
    expect(rate).toBe(1);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("returns 1 for aud (case-insensitive)", async () => {
    const rate = await fetchExchangeRateToAud("aud");
    expect(rate).toBe(1);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("fetches USD to AUD rate", async () => {
    mockFetch.mockResolvedValueOnce(makeForexResponse(1.55));

    const rate = await fetchExchangeRateToAud("USD");

    expect(rate).toBe(1.55);
    const url = mockFetch.mock.calls[0][0];
    expect(url).toContain("USDAUD=X");
  });

  it("fetches GBP to AUD rate", async () => {
    mockFetch.mockResolvedValueOnce(makeForexResponse(1.92));

    const rate = await fetchExchangeRateToAud("GBP");

    expect(rate).toBe(1.92);
    const url = mockFetch.mock.calls[0][0];
    expect(url).toContain("GBPAUD=X");
  });

  it("returns null on API error", async () => {
    mockFetch.mockResolvedValueOnce({ ok: false, status: 404 });

    const rate = await fetchExchangeRateToAud("USD");
    expect(rate).toBeNull();
  });

  it("returns null on network error", async () => {
    mockFetch.mockRejectedValueOnce(new Error("Network failure"));

    const rate = await fetchExchangeRateToAud("USD");
    expect(rate).toBeNull();
  });

  it("returns null when rate is 0", async () => {
    mockFetch.mockResolvedValueOnce(makeForexResponse(0));

    const rate = await fetchExchangeRateToAud("USD");
    expect(rate).toBeNull();
  });
});

// ─── fetchStockPrice (delegates to Yahoo Finance) ───────────

describe("fetchStockPrice", () => {
  it("fetches via Yahoo Finance", async () => {
    mockFetch.mockResolvedValueOnce(makeYahooResponse(65.43, 64.80));

    const result = await fetchStockPrice("VDHG");

    expect(result).not.toBeNull();
    expect(result!.source).toBe("yahoo");
    expect(result!.price).toBe(65.43);

    expect(mockFetch).toHaveBeenCalledTimes(1);
    const url = mockFetch.mock.calls[0][0];
    expect(url).toContain("yahoo");
  });

  it("returns null when Yahoo Finance fails", async () => {
    mockFetch.mockResolvedValueOnce(makeEmptyYahooResponse());
    mockFetch.mockResolvedValueOnce(makeEmptyYahooResponse());

    const result = await fetchStockPrice("FAKE");
    expect(result).toBeNull();
  });
});

// ─── fetchInvestmentPrice ───────────────────────────────────

describe("fetchInvestmentPrice", () => {
  it("returns null when no ticker provided", async () => {
    const result = await fetchInvestmentPrice("crypto", null);
    expect(result).toBeNull();
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("returns null when ticker is undefined", async () => {
    const result = await fetchInvestmentPrice("stock", undefined);
    expect(result).toBeNull();
  });

  it("routes crypto to CoinGecko", async () => {
    const ts = Math.floor(Date.now() / 1000);
    mockFetch.mockResolvedValueOnce(makeCoinGeckoResponse("bitcoin", 95000, -1.5, ts));

    const result = await fetchInvestmentPrice("crypto", "BTC", 0.5);

    expect(result).not.toBeNull();
    expect(result!.priceData.source).toBe("coingecko");
    // 95000 * 0.5 * 100 = 4750000
    expect(result!.valueCents).toBe(4750000);
  });

  it("routes stock to Yahoo Finance (primary)", async () => {
    mockFetch.mockResolvedValueOnce(makeYahooResponse(90.50, 89.00));

    const result = await fetchInvestmentPrice("stock", "VAS", 100);

    expect(result).not.toBeNull();
    expect(result!.priceData.source).toBe("yahoo");
    // 90.50 * 100 * 100 = 905000
    expect(result!.valueCents).toBe(905000);
  });

  it("routes etf to Yahoo Finance (primary)", async () => {
    mockFetch.mockResolvedValueOnce(makeYahooResponse(120.00, 118.00));

    const result = await fetchInvestmentPrice("etf", "VGS", 50);

    expect(result).not.toBeNull();
    expect(result!.priceData.source).toBe("yahoo");
    // 120 * 50 * 100 = 600000
    expect(result!.valueCents).toBe(600000);
  });

  it("returns null for property asset type (no API)", async () => {
    const result = await fetchInvestmentPrice("property", "HOUSE");
    expect(result).toBeNull();
  });

  it("returns null for other asset type (no API)", async () => {
    const result = await fetchInvestmentPrice("other", "MISC");
    expect(result).toBeNull();
  });

  it("uses price directly when no quantity", async () => {
    const ts = Math.floor(Date.now() / 1000);
    mockFetch.mockResolvedValueOnce(makeCoinGeckoResponse("bitcoin", 95000, 0, ts));

    const result = await fetchInvestmentPrice("crypto", "BTC", null);

    // 95000 * 100 = 9500000 (no quantity multiplication)
    expect(result!.valueCents).toBe(9500000);
  });

  it("rounds value to nearest cent", async () => {
    const ts = Math.floor(Date.now() / 1000);
    mockFetch.mockResolvedValueOnce(makeCoinGeckoResponse("ethereum", 4200.555, 0, ts));

    const result = await fetchInvestmentPrice("crypto", "ETH", 1.5);

    // 4200.555 * 1.5 = 6300.8325, * 100 = 630083.25 => rounded to 630083
    expect(result!.valueCents).toBe(630083);
  });

  it("returns null when underlying API fails", async () => {
    mockFetch.mockRejectedValueOnce(new Error("Network error"));

    const result = await fetchInvestmentPrice("crypto", "BTC", 1);
    expect(result).toBeNull();
  });
});
