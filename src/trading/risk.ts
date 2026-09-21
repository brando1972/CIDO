import type { AppConfig } from "../config/env.js";
import type { QuoteResult } from "../types/index.js";
import { LiveTradingDisabledError, PriceImpactExceededError, QuoteExpiredError, QuoteUnavailableError, SlippageExceededError, TradeLimitExceededError } from "../utils/errors.js";

export function validateSlippage(requested: number | undefined, config: AppConfig): number {
  const value = requested ?? config.DEFAULT_SLIPPAGE_PERCENT;
  if (value > config.MAX_SLIPPAGE_PERCENT) throw new SlippageExceededError(config.MAX_SLIPPAGE_PERCENT);
  return value;
}
export function validateUsdTradeLimit(amount: string, config: AppConfig): void {
  if (Number(amount) > config.MAX_TRADE_USD) throw new TradeLimitExceededError(config.MAX_TRADE_USD);
}
export function validateQuote(quote: QuoteResult, config: AppConfig, now = new Date()): void {
  if (quote.expectedAmountOut <= 0n || quote.minimumAmountOut <= 0n) throw new QuoteUnavailableError();
  if (quote.expiresAt.getTime() <= now.getTime()) throw new QuoteExpiredError();
  if (quote.priceImpactPercent !== undefined && quote.priceImpactPercent > config.MAX_PRICE_IMPACT_PERCENT) throw new PriceImpactExceededError(config.MAX_PRICE_IMPACT_PERCENT);
}
export function requireLiveTrading(config: AppConfig): void { if (!config.ENABLE_LIVE_TRADING) throw new LiveTradingDisabledError(); }
