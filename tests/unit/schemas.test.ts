import { describe, expect, it } from "vitest";
import { buySellSchema, quoteSchema, tradeSchema } from "../../src/trading/schemas.js";
describe("request schemas", () => {
  it("accepts decimal-string trade amounts", () => expect(tradeSchema.parse({ tokenIn: "USDT", tokenOut: "CAKE", amountIn: "10.25" }).amountIn).toBe("10.25"));
  it("rejects zero and numeric amounts", () => { expect(() => quoteSchema.parse({ tokenIn: "USDT", tokenOut: "CAKE", amountIn: "0" })).toThrow(); expect(() => buySellSchema.parse({ token: "CAKE", quoteToken: "USDT", amount: 10 })).toThrow(); });
  it("rejects unknown fields", () => expect(() => tradeSchema.parse({ tokenIn: "USDT", tokenOut: "CAKE", amountIn: "1", bypassRisk: true })).toThrow());
});
