export interface MarkPriceTick { symbol: string; price: string; timestamp: number; fundingRate?: string; nextFundingTime?: number; }

export interface MarkPriceProvider {
  readonly source: "aster-perps-v2-testnet-public-market-data" | "binance-usdm-public-mark-price";
  getMarkPrices(symbols: readonly string[]): Promise<MarkPriceTick[]>;
}

/** Public testnet market data from the Aster infrastructure that powers PancakeSwap Perps. No credentials or orders are sent. */
export class AsterPerpsV2TestnetMarkPriceProvider implements MarkPriceProvider {
  readonly source = "aster-perps-v2-testnet-public-market-data" as const;
  constructor(private readonly baseUrl: string, private readonly fetcher: typeof fetch = fetch) {}

  async getMarkPrices(symbols: readonly string[]): Promise<MarkPriceTick[]> {
    const requested = new Map(symbols.map((symbol) => [BINANCE_SYMBOLS[symbol], symbol]).filter((item): item is [string, string] => Boolean(item[0])));
    const response = await this.fetcher(new URL("/fapi/v1/premiumIndex", this.baseUrl), { signal: AbortSignal.timeout(5_000) });
    if (!response.ok) throw new Error(`Aster testnet market-data provider returned HTTP ${response.status}`);
    const body: unknown = await response.json();
    if (!Array.isArray(body)) throw new Error("Aster testnet market-data provider returned an invalid payload");
    const ticks: MarkPriceTick[] = [];
    for (const item of body) {
      if (!item || typeof item !== "object") continue;
      const row = item as Record<string, unknown>; const market = requested.get(String(row.symbol));
      if (!market || typeof row.markPrice !== "string" || !/^\d+(?:\.\d+)?$/.test(row.markPrice)) continue;
      ticks.push({ symbol: market, price: row.markPrice, timestamp: typeof row.time === "number" ? row.time : Date.now(), ...(typeof row.lastFundingRate === "string" ? { fundingRate: row.lastFundingRate } : {}), ...(typeof row.nextFundingTime === "number" ? { nextFundingTime: row.nextFundingTime } : {}) });
    }
    if (ticks.length !== requested.size) throw new Error("Aster testnet market-data provider omitted one or more configured markets");
    return ticks;
  }
}

const BINANCE_SYMBOLS: Readonly<Record<string, string>> = {
  BTCUSD: "BTCUSDT",
  ETHUSD: "ETHUSDT",
  BNBUSD: "BNBUSDT"
};

/** Public Binance USD-M Futures mark prices. No account, API key, or trading endpoint is used. */
export class BinanceUsdMMarkPriceProvider implements MarkPriceProvider {
  readonly source = "binance-usdm-public-mark-price" as const;
  constructor(private readonly baseUrl: string = "https://fapi.binance.com", private readonly fetcher: typeof fetch = fetch) {}

  async getMarkPrices(symbols: readonly string[]): Promise<MarkPriceTick[]> {
    const requested = new Map(symbols.map((symbol) => [BINANCE_SYMBOLS[symbol], symbol]).filter((item): item is [string, string] => Boolean(item[0])));
    
    let body: unknown;
    try {
      const response = await this.fetcher(new URL("/fapi/v1/premiumIndex", this.baseUrl), { signal: AbortSignal.timeout(5_000) });
      if (response.ok) {
        body = await response.json();
      }
    } catch {
      // Fall through to US fallback
    }

    if (Array.isArray(body)) {
      const ticks: MarkPriceTick[] = [];
      for (const item of body) {
        if (!item || typeof item !== "object") continue;
        const row = item as Record<string, unknown>; const market = requested.get(String(row.symbol));
        if (!market || typeof row.markPrice !== "string" || !/^\d+(?:\.\d+)?$/.test(row.markPrice)) continue;
        ticks.push({
          symbol: market,
          price: row.markPrice,
          timestamp: typeof row.time === "number" ? row.time : Date.now(),
          ...(typeof row.lastFundingRate === "string" ? { fundingRate: row.lastFundingRate } : {}),
          ...(typeof row.nextFundingTime === "number" ? { nextFundingTime: row.nextFundingTime } : {})
        });
      }
      if (ticks.length === requested.size) return ticks;
    }

    // Seamless US region fallback: Binance.US public price ticker
    try {
      const symbolsParam = encodeURIComponent(JSON.stringify(Array.from(requested.keys())));
      const usResponse = await this.fetcher(`https://api.binance.us/api/v3/ticker/price?symbols=${symbolsParam}`, { signal: AbortSignal.timeout(5_000) });
      if (usResponse.ok) {
        const usBody: unknown = await usResponse.json();
        if (Array.isArray(usBody)) {
          const ticks: MarkPriceTick[] = [];
          for (const item of usBody) {
            if (!item || typeof item !== "object") continue;
            const row = item as Record<string, unknown>; const market = requested.get(String(row.symbol));
            if (!market || typeof row.price !== "string" || !/^\d+(?:\.\d+)?$/.test(row.price)) continue;
            ticks.push({
              symbol: market,
              price: row.price,
              timestamp: Date.now()
            });
          }
          if (ticks.length === requested.size) return ticks;
        }
      }
    } catch {
      // Fall through
    }

    throw new Error("Mark-price provider was unable to reach primary feed or fallback");
  }
}
