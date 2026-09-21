import type { FastifyInstance } from "fastify";
import type { AppDependencies } from "../app.js";
import { buySellSchema, tradeSchema } from "../trading/schemas.js";
import { buyToTrade } from "../trading/buy.js"; import { sellToTrade } from "../trading/sell.js";
export function registerTradeRoutes(app: FastifyInstance, deps: AppDependencies) {
  app.post("/trade", async (request) => deps.trades.trade(tradeSchema.parse(request.body)));
  app.post("/trade/buy", async (request) => deps.trades.trade(buyToTrade(buySellSchema.parse(request.body))));
  app.post("/trade/sell", async (request) => deps.trades.trade(sellToTrade(buySellSchema.parse(request.body))));
}
