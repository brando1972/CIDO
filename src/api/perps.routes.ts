import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { AppDependencies } from "../app.js";
import { fetchMarketInsight } from "../perps/market-insights.js";

import { AppError } from "../utils/errors.js";

const decimal = z.string().regex(/^\d+(?:\.\d{1,8})?$/);
const orderSchema = z.object({ market: z.string().min(1), side: z.enum(["long", "short"]), sizeUsd: decimal, leverage: decimal, orderType: z.enum(["market", "limit"]).default("market"), limitPrice: decimal.optional(), takeProfitPrice: decimal.optional(), stopLossPrice: decimal.optional(), trailingStopPercent: decimal.optional(), reduceOnly: z.boolean().default(false), isLive: z.boolean().default(false) });

export function registerPerpsRoutes(app: FastifyInstance, deps: AppDependencies) {
  const perps = deps.perps;
  app.get("/api/perps/insights", async (request) => {
    const q = z.object({ symbol: z.string().default("BTCUSD"), timeframe: z.string().default("LIVE") }).parse(request.query);
    return fetchMarketInsight(q.symbol, q.timeframe, String(deps.config.PERPS_MAX_LEVERAGE));
  });
  app.get("/api/perps/markets", async () => {
    await perps.ensureFreshMarks();
    return { mode: perps.mode, source: perps.dataSource, feed: perps.getFeedStatus(), disclaimer: "PancakeSwap Perps V2 trading console with live reference prices.", markets: perps.listMarkets() };
  });
  app.get("/api/perps/ticker", async () => {
    await perps.ensureFreshMarks();
    return perps.getTicker();
  });
  app.get("/api/perps/account", async () => {
    await perps.ensureFreshMarks();
    const account = perps.getAccount();
    if (deps.balances && deps.walletAddress) {
      try {
        const bnb = await deps.balances.getNativeBalance();
        return { ...account, walletAddress: deps.walletAddress, walletBnbBalance: bnb };
      } catch {
        return account;
      }
    }
    return account;
  });
  app.get("/api/perps/positions", async () => {
    await perps.ensureFreshMarks();
    return { positions: perps.listPositions() };
  });
  app.get("/api/perps/orders", async () => ({ orders: perps.listOrders() }));
  app.get("/api/perps/safety", async () => ({ safety: perps.getSafetyState() }));
  app.put("/api/perps/safety/kill-switch", async (request) => { const body = z.object({ enabled: z.boolean(), reason: z.string().max(200).optional() }).parse(request.body); return { safety: perps.setKillSwitch(body.enabled, body.reason) }; });
  app.post("/api/perps/emergency-close", async (request) => perps.emergencyCloseAll(z.object({ reason: z.string().max(200).default("operator emergency close") }).parse(request.body ?? {}).reason));
  app.post("/api/perps/orders/preview", async (request) => {
    await perps.ensureFreshMarks();
    const parsed = orderSchema.parse(request.body);
    if (parsed.isLive && !deps.config.ENABLE_LIVE_PERPS) {
      throw new AppError("Live execution is disabled. Set ENABLE_LIVE_PERPS=true and provide a wallet PRIVATE_KEY in .env to trade on-chain.", "LIVE_PERPS_DISABLED", 403);
    }
    return { preview: perps.preview(parsed) };
  });
  app.post("/api/perps/orders", async (request) => {
    await perps.ensureFreshMarks();
    const body = orderSchema.extend({ confirmationToken: z.string().min(1) }).parse(request.body);
    if (body.isLive && !deps.config.ENABLE_LIVE_PERPS) {
      throw new AppError("Live execution is disabled. Set ENABLE_LIVE_PERPS=true and provide a wallet PRIVATE_KEY in .env to trade on-chain.", "LIVE_PERPS_DISABLED", 403);
    }
    const { confirmationToken, ...order } = body;
    return perps.place(order, confirmationToken);
  });
  app.delete("/api/perps/orders/:orderId", async (request) => ({ order: perps.cancel(z.object({ orderId: z.string().uuid() }).parse(request.params).orderId) }));
  app.post("/api/perps/positions/:market/close", async (request) => { const { market } = z.object({ market: z.string().min(1) }).parse(request.params); const { percentage } = z.object({ percentage: decimal.default("100") }).parse(request.body ?? {}); return perps.close(market, percentage); });
}
