/**
 * Price fetching utilities for investment tracking
 * - CoinGecko: crypto (free, no key, unlimited)
 * - Yahoo Finance: stocks/ETFs (free, no key, excellent ASX coverage)
 */

export interface PriceResult {
  price: number;
  currency: string;
  change24h?: number;
  changePercent?: number;
  lastUpdated: string;
  source: 'coingecko' | 'yahoo' | 'manual';
}

/**
 * Fetch cryptocurrency price from CoinGecko (FREE - no API key needed)
 * Supports 10,000+ cryptocurrencies
 */
export async function fetchCryptoPrice(symbol: string): Promise<PriceResult | null> {
  try {
    const coinId = SYMBOL_MAP[symbol.toUpperCase()] || symbol.toLowerCase();

    const response = await fetch(
      `https://api.coingecko.com/api/v3/simple/price?ids=${coinId}&vs_currencies=aud&include_24hr_change=true&include_last_updated_at=true`,
      {
        headers: {
          'Accept': 'application/json',
        },
        next: { revalidate: 300 }, // Cache for 5 minutes
      }
    );

    if (!response.ok) {
      console.error(`CoinGecko API error: ${response.status}`);
      return null;
    }

    const data = await response.json();

    if (!data[coinId]) {
      console.error(`CoinGecko: Coin ${coinId} not found`);
      return null;
    }

    return {
      price: data[coinId].aud,
      currency: 'AUD',
      change24h: data[coinId].aud_24h_change,
      changePercent: data[coinId].aud_24h_change,
      lastUpdated: new Date(data[coinId].last_updated_at * 1000).toISOString(),
      source: 'coingecko',
    };
  } catch (error) {
    console.error('CoinGecko fetch error:', error);
    return null;
  }
}

const SYMBOL_MAP: Record<string, string> = {
  'BTC': 'bitcoin',
  'ETH': 'ethereum',
  'USDT': 'tether',
  'BNB': 'binancecoin',
  'SOL': 'solana',
  'XRP': 'ripple',
  'DOGE': 'dogecoin',
  'ADA': 'cardano',
  'DOT': 'polkadot',
  'MATIC': 'polygon',
};

/**
 * Fetch multiple cryptocurrency prices in a single CoinGecko API call.
 * Returns a Map of uppercase symbol -> PriceResult.
 */
export async function fetchMultipleCryptoPrices(
  symbols: string[]
): Promise<Map<string, PriceResult>> {
  const results = new Map<string, PriceResult>();
  if (symbols.length === 0) return results;

  try {
    const coinIds = symbols.map((s) => SYMBOL_MAP[s.toUpperCase()] || s.toLowerCase());
    const uniqueIds = [...new Set(coinIds)];

    const response = await fetch(
      `https://api.coingecko.com/api/v3/simple/price?ids=${uniqueIds.join(",")}&vs_currencies=aud&include_24hr_change=true&include_last_updated_at=true`,
      {
        headers: { Accept: "application/json" },
        next: { revalidate: 300 },
      }
    );

    if (!response.ok) return results;

    const data = await response.json();

    // Map back from coinId to original symbol
    for (let i = 0; i < symbols.length; i++) {
      const symbol = symbols[i].toUpperCase();
      const coinId = coinIds[i];
      if (data[coinId]) {
        results.set(symbol, {
          price: data[coinId].aud,
          currency: "AUD",
          change24h: data[coinId].aud_24h_change,
          changePercent: data[coinId].aud_24h_change,
          lastUpdated: new Date(data[coinId].last_updated_at * 1000).toISOString(),
          source: "coingecko",
        });
      }
    }
  } catch (error) {
    console.error("CoinGecko batch fetch error:", error);
  }

  return results;
}

/**
 * Build the list of Yahoo Finance symbols to try for a given ticker.
 * If the symbol already has a dot (e.g. "CBA.AX"), use as-is.
 * Otherwise try .AX (ASX) first, then bare (US market).
 */
function getSymbolsToTry(symbol: string): string[] {
  if (symbol.includes('.')) return [symbol];
  return [symbol.toUpperCase() + '.AX', symbol.toUpperCase()];
}

/**
 * Fetch exchange rate from a currency to AUD using Yahoo Finance forex pairs.
 * e.g. fetchExchangeRateToAud("USD") returns how many AUD per 1 USD.
 */
export async function fetchExchangeRateToAud(fromCurrency: string): Promise<number | null> {
  if (fromCurrency.toUpperCase() === 'AUD') return 1;
  try {
    const symbol = `${fromCurrency.toUpperCase()}AUD=X`;
    const response = await fetch(
      `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?range=1d&interval=1d`,
      {
        headers: {
          'Accept': 'application/json',
          'User-Agent': 'PiggyBack/1.0',
        },
        next: { revalidate: 3600 },
      }
    );
    if (!response.ok) return null;
    const data = await response.json();
    const rate = data?.chart?.result?.[0]?.meta?.regularMarketPrice;
    return rate || null;
  } catch (error) {
    console.error(`Exchange rate fetch error (${fromCurrency}→AUD):`, error);
    return null;
  }
}

/**
 * Fetch stock/ETF price from Yahoo Finance v8 chart API (FREE - no key needed).
 * Primary source for stocks/ETFs. Excellent ASX coverage including Vanguard ETFs.
 * All prices are automatically converted to AUD.
 */
export async function fetchYahooFinancePrice(symbol: string): Promise<PriceResult | null> {
  try {
    const symbolsToTry = getSymbolsToTry(symbol);

    for (const formattedSymbol of symbolsToTry) {
      const response = await fetch(
        `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(formattedSymbol)}?range=1d&interval=1d`,
        {
          headers: {
            'Accept': 'application/json',
            'User-Agent': 'PiggyBack/1.0',
          },
          next: { revalidate: 3600 }, // Cache for 1 hour
        }
      );

      if (!response.ok) continue;

      const data = await response.json();
      const meta = data?.chart?.result?.[0]?.meta;

      if (!meta?.regularMarketPrice) continue;

      let price = meta.regularMarketPrice;
      let previousClose = meta.previousClose || meta.chartPreviousClose || price;
      const rawCurrency = meta.currency || 'AUD';

      // Convert to AUD if the price is in a different currency
      if (rawCurrency !== 'AUD') {
        const rate = await fetchExchangeRateToAud(rawCurrency);
        if (rate) {
          price = price * rate;
          previousClose = previousClose * rate;
        } else {
          console.warn(`Could not convert ${rawCurrency}→AUD for ${formattedSymbol}, skipping`);
          continue;
        }
      }

      const change = price - previousClose;
      const changePercent = previousClose > 0 ? (change / previousClose) * 100 : 0;

      return {
        price,
        currency: 'AUD',
        change24h: change,
        changePercent,
        lastUpdated: new Date().toISOString(),
        source: 'yahoo',
      };
    }

    return null;
  } catch (error) {
    console.error('Yahoo Finance fetch error:', error);
    return null;
  }
}

/**
 * Fetch stock/ETF price via Yahoo Finance.
 */
export async function fetchStockPrice(symbol: string): Promise<PriceResult | null> {
  return fetchYahooFinancePrice(symbol);
}

/**
 * Fetch price for any investment based on asset type and ticker
 */
export async function fetchInvestmentPrice(
  assetType: string,
  ticker?: string | null,
  quantity?: number | null,
): Promise<{ valueCents: number; priceData: PriceResult } | null> {
  if (!ticker) {
    return null;
  }

  let priceData: PriceResult | null = null;

  // Fetch based on asset type
  if (assetType === 'crypto') {
    priceData = await fetchCryptoPrice(ticker);
  } else if (assetType === 'stock' || assetType === 'etf') {
    priceData = await fetchStockPrice(ticker);
  }

  if (!priceData) {
    return null;
  }

  // Calculate total value
  const totalValue = quantity ? priceData.price * quantity : priceData.price;
  const valueCents = Math.round(totalValue * 100);

  return {
    valueCents,
    priceData,
  };
}
