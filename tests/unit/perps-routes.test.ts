import Fastify from "fastify";
import { afterEach, describe, expect, it } from "vitest";
import { ZodError } from "zod";
import { registerPerpsRoutes } from "../../src/api/perps.routes.js";
import type { AppDependencies } from "../../src/app.js";
import { loadConfig } from "../../src/config/env.js";
import { PaperPerpsService } from "../../src/perps/paper-service.js";
import { AppError } from "../../src/utils/errors.js";

const apps: ReturnType<typeof Fastify>[] = [];
afterEach(async () => { await Promise.all(apps.splice(0).map((app) => app.close())); });

function createApp() {
  const config = loadConfig({ NODE_ENV: "test", CHAIN: "bsc-testnet", BSC_TESTNET_RPC_URL: "https://example.com" });
  const app = Fastify(); apps.push(app);
  app.setErrorHandler((error, _request, reply) => {
    if (error instanceof ZodError) return reply.status(400).send({ error: { code: "VALIDATION_ERROR" } });
    if (error instanceof AppError) return reply.status(error.statusCode).send({ error: { code: error.code, message: error.message } });
    return reply.status(500).send({ error: { code: "INTERNAL_ERROR" } });
  });
  registerPerpsRoutes(app, { config, perps: new PaperPerpsService(config) } as AppDependencies);
  return app;
}

describe("paper perps routes", () => {
  it("labels market prices as synthetic and illustrative", async () => {
    const response = await createApp().inject({ method: "GET", url: "/api/perps/markets" });
    expect(response.statusCode).toBe(200);
    const payload = response.json();
    expect(payload).toMatchObject({ mode: "paper", source: "binance-usdm-public-mark-price", feed: { status: "initializing" } });
    expect(payload.markets).toContainEqual(expect.objectContaining({ symbol: "BTCUSD", referencePrice: "60000" }));
  });

  it("previews and places only with the returned confirmation token", async () => {
    const app = createApp(); const body = { market: "BTCUSD", side: "long", sizeUsd: "1000", leverage: "3", stopLossPrice: "55000" };
    const previewResponse = await app.inject({ method: "POST", url: "/api/perps/orders/preview", payload: body });
    expect(previewResponse.statusCode).toBe(200);
    const preview = previewResponse.json().preview;
    expect(preview).toMatchObject({ estimatedEntryPrice: "60000", initialMarginUsd: "333.33333333", estimatedFeeUsd: "0.5" });
    const placed = await app.inject({ method: "POST", url: "/api/perps/orders", payload: { ...body, confirmationToken: preview.confirmationToken } });
    expect(placed.statusCode).toBe(200); expect(placed.json()).toMatchObject({ order: { status: "filled" }, position: { market: "BTCUSD" } });
    expect((await app.inject({ method: "GET", url: "/api/perps/positions" })).json().positions).toHaveLength(1);
  });

  it("returns structured errors for invalid risk and confirmation requests", async () => {
    const app = createApp();
    const risk = await app.inject({ method: "POST", url: "/api/perps/orders/preview", payload: { market: "BTCUSD", side: "long", sizeUsd: "3000", leverage: "3", stopLossPrice: "55000" } });
    expect(risk.statusCode).toBe(400); expect(risk.json()).toMatchObject({ error: { code: "ORDER_LIMIT" } });
    const invalid = await app.inject({ method: "POST", url: "/api/perps/orders", payload: { market: "BTCUSD", side: "long", sizeUsd: "100", leverage: "2", stopLossPrice: "55000", confirmationToken: "00000000-0000-4000-8000-000000000000" } });
    expect(invalid.statusCode).toBe(409); expect(invalid.json()).toMatchObject({ error: { code: "INVALID_CONFIRMATION" } });
  });

  it("supports the kill switch and emergency close", async () => {
    const app = createApp();
    const enabled = await app.inject({ method: "PUT", url: "/api/perps/safety/kill-switch", payload: { enabled: true, reason: "operator test" } });
    expect(enabled.json()).toMatchObject({ safety: { killSwitchEnabled: true, reason: "operator test" } });
    const blocked = await app.inject({ method: "POST", url: "/api/perps/orders/preview", payload: { market: "BTCUSD", side: "long", sizeUsd: "100", leverage: "2", stopLossPrice: "55000" } });
    expect(blocked.statusCode).toBe(423);
    const emergency = await app.inject({ method: "POST", url: "/api/perps/emergency-close", payload: { reason: "drill" } });
    expect(emergency.json()).toMatchObject({ closedPositions: 0, safety: { killSwitchEnabled: true, reason: "drill" } });
  });
});
