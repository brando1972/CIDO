import { describe, expect, it } from "vitest";
import { PerpsV2LiveAdapter } from "../../src/perps/v2-live-adapter.js";

describe("PerpsV2LiveAdapter Safety Guardrails", () => {
  const dummyClient = {} as any;
  const adapter = new PerpsV2LiveAdapter(dummyClient, undefined, undefined, 25, 3);

  it("accepts valid trades within the $25 and 3x leverage envelope", () => {
    expect(() => adapter.validateSafetyEnvelope({
      market: "BTCUSD",
      isLong: true,
      collateralUsd: "10",
      sizeUsd: "25",
      entryPrice: "60000",
      stopLossPrice: "58000"
    })).not.toThrow();
  });

  it("rejects trades exceeding the $25 test wallet cap", () => {
    expect(() => adapter.validateSafetyEnvelope({
      market: "BTCUSD",
      isLong: true,
      collateralUsd: "15",
      sizeUsd: "30",
      entryPrice: "60000",
      stopLossPrice: "58000"
    })).toThrow(/test safety limit/i);
  });

  it("rejects trades exceeding the 3x leverage cap", () => {
    expect(() => adapter.validateSafetyEnvelope({
      market: "BTCUSD",
      isLong: true,
      collateralUsd: "5",
      sizeUsd: "25", // 5x leverage
      entryPrice: "60000",
      stopLossPrice: "58000"
    })).toThrow(/leverage/i);
  });

  it("requires a mandatory stop loss", () => {
    expect(() => adapter.validateSafetyEnvelope({
      market: "BTCUSD",
      isLong: true,
      collateralUsd: "10",
      sizeUsd: "20",
      entryPrice: "60000",
      stopLossPrice: ""
    })).toThrow(/mandatory stop loss/i);
  });
});
