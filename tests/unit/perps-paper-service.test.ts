import { describe, expect, it } from "vitest";
import { loadConfig } from "../../src/config/env.js";
import { PaperPerpsService } from "../../src/perps/paper-service.js";

const config = () => loadConfig({ NODE_ENV: "test", CHAIN: "bsc-testnet", BSC_TESTNET_RPC_URL: "https://example.com", PERPS_MODE: "paper", ENABLE_LIVE_PERPS: "false", PERPS_INITIAL_BALANCE_USD: "10000", PERPS_MAX_ORDER_USD: "1000", PERPS_MAX_LEVERAGE: "3" });
const marketOrder = { market: "BTCUSD", side: "long" as const, sizeUsd: "1000", leverage: "3", orderType: "market" as const, stopLossPrice: "55000", reduceOnly: false };

describe("PaperPerpsService", () => {
  it("exposes clearly synthetic illustrative markets", () => {
    const service = new PaperPerpsService(config());
    expect(service.mode).toBe("paper"); expect(service.dataSource).toBe("binance-usdm-public-mark-price");
    expect(service.listMarkets()[0]).toMatchObject({ symbol: "BTCUSD", referencePrice: "60000" });
  });

  it("revalues positions from injected public marks and reports feed freshness", async () => {
    let now = 10_000;
    const provider = { source: "binance-usdm-public-mark-price" as const, getMarkPrices: async () => [
      { symbol: "BTCUSD", price: "60600", fundingRate: "-0.0001", nextFundingTime: now + 28_800_000, timestamp: now }, { symbol: "ETHUSD", price: "2500", timestamp: now }, { symbol: "BNBUSD", price: "600", timestamp: now }
    ] };
    const service = new PaperPerpsService(config(), { now: () => now, provider });
    const preview = service.preview(marketOrder); service.place(marketOrder, preview.confirmationToken);
    await service.refreshMarks();
    expect(service.listPositions()[0]).toMatchObject({ markPrice: "60600", unrealizedPnl: "10", lastUpdated: new Date(now).toISOString() });
    expect(service.getAccount()).toMatchObject({ equity: "10009.5", unrealizedPnl: "10" });
    expect(service.listMarkets()[0]).toMatchObject({ fundingRate: "-0.0001", nextFundingTime: new Date(now + 28_800_000).toISOString() });
    expect(service.getFeedStatus().status).toBe("live");
    now += 16_000; expect(service.getFeedStatus().status).toBe("stale");
  });

  it("fills crossed limits and automatically closes on take profit", () => {
    let now = 20_000; const service = new PaperPerpsService(config(), { now: () => now, provider: { source: "binance-usdm-public-mark-price", getMarkPrices: async () => [] } });
    const request = { ...marketOrder, orderType: "limit" as const, limitPrice: "59000", takeProfitPrice: "61000" };
    const preview = service.preview(request); expect(service.place(request, preview.confirmationToken).order.status).toBe("open");
    service.applyMarkPrices([{ symbol: "BTCUSD", price: "59000", timestamp: ++now }]);
    expect(service.listPositions()).toHaveLength(1); expect(service.listOrders()[0]?.status).toBe("filled");
    service.applyMarkPrices([{ symbol: "BTCUSD", price: "61000", timestamp: ++now }]);
    expect(service.listPositions()).toHaveLength(0);
    expect(service.listOrders().at(-1)).toMatchObject({ reduceOnly: true, closeReason: "take_profit", fillPrice: "61000" });
  });

  it("fails visibly when the provider is unavailable without changing paper positions", async () => {
    const service = new PaperPerpsService(config(), { now: () => 30_000, provider: { source: "binance-usdm-public-mark-price", getMarkPrices: async () => { throw new Error("offline"); } } });
    await service.refreshMarks(); expect(service.getFeedStatus()).toMatchObject({ status: "error", lastUpdated: null, error: "offline" });
    expect(service.listPositions()).toHaveLength(0);
  });
  it("requires a matching preview before placing", () => {
    const service = new PaperPerpsService(config(), () => 1_000);
    expect(() => service.place(marketOrder, "missing")).toThrow(/confirmation/i);
    const preview = service.preview(marketOrder);
    expect(() => service.place({ ...marketOrder, sizeUsd: "1001" }, preview.confirmationToken)).toThrow(/confirmation/i);
  });
  it("verifies confirmation token statelessly across instances without shared memory", () => {
    const sharedSecret = "test-secret-key-xyz";
    const instanceA = new PaperPerpsService(config(), { now: () => 1_000, secret: sharedSecret });
    const instanceB = new PaperPerpsService(config(), { now: () => 1_500, secret: sharedSecret });

    const preview = instanceA.preview(marketOrder);
    expect(preview.confirmationToken).toMatch(/^ct_/);

    // Instance B has no memory of this preview, but can verify HMAC statelessly
    const placed = instanceB.place(marketOrder, preview.confirmationToken);
    expect(placed.order.status).toBe("filled");

    // Tampered order params must fail
    expect(() => instanceB.place({ ...marketOrder, sizeUsd: "500" }, preview.confirmationToken)).toThrow(/confirmation/i);

    // Expired token (>120s) must fail
    const expiredInstance = new PaperPerpsService(config(), { now: () => 1_000 + 130_000, secret: sharedSecret });
    expect(() => expiredInstance.place(marketOrder, preview.confirmationToken)).toThrow(/confirmation/i);
  });
  it("fills, charges fees, and closes", () => {
    const service = new PaperPerpsService(config(), () => 1_000); const preview = service.preview(marketOrder);
    expect(preview).toMatchObject({ initialMarginUsd: "333.33333333", estimatedFeeUsd: "0.5", estimatedEntryPrice: "60000" });
    const placed = service.place(marketOrder, preview.confirmationToken);
    expect(placed.order.status).toBe("filled"); expect(placed.account).toMatchObject({ balance: "9999.5", usedMargin: "333.33333333" });
    const closed = service.close("btcusd"); expect(closed.position).toBeNull(); expect(closed.account).toMatchObject({ balance: "9999", usedMargin: "0" });
  });
  it("keeps limit orders open and cancels them", () => {
    const service = new PaperPerpsService(config(), () => 1_000); const request = { ...marketOrder, orderType: "limit" as const, limitPrice: "50000", stopLossPrice: "45000" };
    const placed = service.place(request, service.preview(request).confirmationToken);
    expect(placed.order.status).toBe("open"); expect(service.cancel(placed.order.id).status).toBe("cancelled");
  });
  it("enforces limits and direction-aware TP/SL", () => {
    const service = new PaperPerpsService(config());
    expect(() => service.preview({ ...marketOrder, sizeUsd: "1000.00000001" })).toThrow(/limit/i);
    expect(() => service.preview({ ...marketOrder, leverage: "4" })).toThrow(/leverage/i);
    expect(() => service.preview({ ...marketOrder, stopLossPrice: undefined })).toThrow(/mandatory/i);
    expect(() => service.preview({ ...marketOrder, takeProfitPrice: "59000" })).toThrow(/takeProfitPrice/i);
    expect(() => service.preview({ ...marketOrder, stopLossPrice: "61000" })).toThrow(/stopLossPrice/i);
    expect(() => service.preview({ ...marketOrder, side: "short", takeProfitPrice: "61000" })).toThrow(/takeProfitPrice/i);
    expect(() => service.preview({ ...marketOrder, side: "short", stopLossPrice: "59000" })).toThrow(/stopLossPrice/i);
    expect(() => service.preview({ ...marketOrder, trailingStopPercent: "0" })).toThrow(/trailingStopPercent/i);
    expect(() => service.preview({ ...marketOrder, trailingStopPercent: "50.00000001" })).toThrow(/trailingStopPercent/i);
  });
  it("ratchets a long trailing stop upward without moving it backward, then triggers", () => {
    let now = 40_000; const service = new PaperPerpsService(config(), () => now);
    const request = { ...marketOrder, trailingStopPercent: "5" };
    service.place(request, service.preview(request).confirmationToken);
    expect(service.listPositions()[0]).toMatchObject({ trailingStopPercent: "5", trailingWatermarkPrice: "60000", trailingTriggerPrice: "57000" });
    service.applyMarkPrices([{ symbol: "BTCUSD", price: "66000", timestamp: ++now }]);
    expect(service.listPositions()[0]).toMatchObject({ trailingWatermarkPrice: "66000", trailingTriggerPrice: "62700" });
    service.applyMarkPrices([{ symbol: "BTCUSD", price: "64000", timestamp: ++now }]);
    expect(service.listPositions()[0]).toMatchObject({ trailingWatermarkPrice: "66000", trailingTriggerPrice: "62700" });
    service.applyMarkPrices([{ symbol: "BTCUSD", price: "62700", timestamp: ++now }]);
    expect(service.listPositions()).toHaveLength(0);
    expect(service.listOrders().at(-1)).toMatchObject({ reduceOnly: true, closeReason: "trailing_stop", fillPrice: "62700" });
  });
  it("ratchets a short trailing stop downward without moving it backward, then triggers", () => {
    let now = 50_000; const service = new PaperPerpsService(config(), () => now);
    const request = { ...marketOrder, side: "short" as const, stopLossPrice: "65000", trailingStopPercent: "5" };
    service.place(request, service.preview(request).confirmationToken);
    service.applyMarkPrices([{ symbol: "BTCUSD", price: "54000", timestamp: ++now }]);
    expect(service.listPositions()[0]).toMatchObject({ trailingWatermarkPrice: "54000", trailingTriggerPrice: "56700" });
    service.applyMarkPrices([{ symbol: "BTCUSD", price: "55000", timestamp: ++now }]);
    expect(service.listPositions()[0]).toMatchObject({ trailingWatermarkPrice: "54000", trailingTriggerPrice: "56700" });
    service.applyMarkPrices([{ symbol: "BTCUSD", price: "56700", timestamp: ++now }]);
    expect(service.listPositions()).toHaveLength(0);
    expect(service.listOrders().at(-1)).toMatchObject({ closeReason: "trailing_stop", fillPrice: "56700" });
  });
  it("preserves a trailing stop when a limit order fills", () => {
    let now = 60_000; const service = new PaperPerpsService(config(), () => now);
    const request = { ...marketOrder, orderType: "limit" as const, limitPrice: "59000", trailingStopPercent: "2" };
    service.place(request, service.preview(request).confirmationToken);
    service.applyMarkPrices([{ symbol: "BTCUSD", price: "59000", timestamp: ++now }]);
    expect(service.listPositions()[0]).toMatchObject({ trailingStopPercent: "2", trailingWatermarkPrice: "59000", trailingTriggerPrice: "57820" });
  });
  it("partially closes with decimal-string percentages", () => {
    const service = new PaperPerpsService(config()); const preview = service.preview(marketOrder); service.place(marketOrder, preview.confirmationToken);
    expect(service.close("BTCUSD", "25").position).toMatchObject({ sizeUsd: "750", initialMarginUsd: "249.99999999" });
  });
  it("hard-caps leverage at 3x", () => {
    const service = new PaperPerpsService(config());
    expect(service.preview(marketOrder)).toMatchObject({ leverage: "3", liquidationPrice: "40030.0002" });
    expect(() => service.preview({ ...marketOrder, leverage: "3.00000001" })).toThrow(/leverage/i);
  });
  it("emergency-closes positions, cancels orders, and blocks new entries", () => {
    const service = new PaperPerpsService(config());
    service.place(marketOrder, service.preview(marketOrder).confirmationToken);
    const limit = { ...marketOrder, market: "ETHUSD", limitPrice: "2000", stopLossPrice: "1800", orderType: "limit" as const };
    service.place(limit, service.preview(limit).confirmationToken);
    expect(service.emergencyCloseAll("test emergency")).toMatchObject({ closedPositions: 1, safety: { killSwitchEnabled: true, reason: "test emergency" } });
    expect(service.listPositions()).toHaveLength(0);
    expect(service.listOrders().find((order) => order.market === "ETHUSD")?.status).toBe("cancelled");
    expect(() => service.preview(marketOrder)).toThrow(/kill switch/i);
    service.setKillSwitch(false);
    expect(service.preview(marketOrder).confirmationToken).toBeTruthy();
  });
});
