import { describe, expect, it } from "vitest";
import type { AppConfig } from "../../src/config/env.js";
import { requireLiveTrading, validateQuote, validateSlippage, validateUsdTradeLimit } from "../../src/trading/risk.js";
import type { QuoteResult, TokenDefinition } from "../../src/types/index.js";
const config = { DEFAULT_SLIPPAGE_PERCENT: 0.5, MAX_SLIPPAGE_PERCENT: 1, MAX_TRADE_USD: 25, MAX_PRICE_IMPACT_PERCENT: 5, ENABLE_LIVE_TRADING: false } as AppConfig;
const token = { symbol: "TEST", name: "Test", address: "0x0000000000000000000000000000000000000001", decimals: 18, chainId: 97 } as TokenDefinition;
const quote = (expiresAt: Date): QuoteResult => ({ tokenIn: token, tokenOut: token, amountIn: 1n, expectedAmountOut: 1n, minimumAmountOut: 1n, slippagePercent: 0.5, route: [], quoteTimestamp: new Date(), expiresAt });
describe("risk controls", () => {
  it("enforces maximum slippage", () => expect(() => validateSlippage(1.01, config)).toThrowError(/exceeds/));
  it("uses configured default slippage", () => expect(validateSlippage(undefined, config)).toBe(0.5));
  it("enforces USD trade cap", () => expect(() => validateUsdTradeLimit("25.01", config)).toThrowError(/exceeds/));
  it("rejects expired quotes", () => expect(() => validateQuote(quote(new Date(0)), config)).toThrowError(/expired/));
  it("locks live trading", () => expect(() => requireLiveTrading(config)).toThrowError(/disabled/));
});
