import Fastify from "fastify";
import { ZodError } from "zod";
import type { AppConfig } from "./config/env.js";
import type { BlockchainClient } from "./blockchain/client.js";
import type { TradingWallet } from "./blockchain/wallet.js";
import type { BalanceService } from "./blockchain/balances.js";
import type { TradeService } from "./trading/trade-service.js";
import type { Address } from "viem";
import { AppError } from "./utils/errors.js";
import { registerHealthRoutes } from "./api/health.routes.js";
import { registerBalanceRoutes } from "./api/balance.routes.js";
import { registerQuoteRoutes } from "./api/quote.routes.js";
import { registerTradeRoutes } from "./api/trade.routes.js";
import { registerTransactionRoutes } from "./api/transaction.routes.js";
import { registerUiRoutes } from "./api/ui.routes.js";
import { registerPerpsRoutes } from "./api/perps.routes.js";
import { registerSpcxRoutes } from "./api/spcx.routes.js";
import { registerAuthRoutes } from "./api/auth.middleware.js";
import type { PaperPerpsService } from "./perps/paper-service.js";
import type { DatabaseRepository } from "./db/supabase.js";

export interface AppDependencies { config: AppConfig; blockchain: BlockchainClient; wallet: TradingWallet; walletAddress?: Address; balances?: BalanceService; trades: TradeService; perps: PaperPerpsService; db?: DatabaseRepository; }

export function buildApp(deps: AppDependencies) {
  const app = Fastify({ logger: { level: deps.config.NODE_ENV === "test" ? "silent" : "info", redact: ["req.headers.authorization", "*.PRIVATE_KEY", "privateKey", "secret", "passphrase"] } });
  app.setErrorHandler((error, _request, reply) => {
    if (error instanceof ZodError) return reply.status(400).send({ error: { code: "VALIDATION_ERROR", message: "Invalid request", details: error.flatten() } });
    if (error instanceof AppError) return reply.status(error.statusCode).send({ error: { code: error.code, message: error.message, details: error.details } });
    app.log.error({ err: error }, "Unhandled request error");
    return reply.status(500).send({ error: { code: "INTERNAL_ERROR", message: "Internal server error" } });
  });
  registerAuthRoutes(app, deps); registerUiRoutes(app); registerHealthRoutes(app, deps); registerBalanceRoutes(app, deps); registerQuoteRoutes(app, deps); registerTradeRoutes(app, deps); registerTransactionRoutes(app, deps); registerPerpsRoutes(app, deps); registerSpcxRoutes(app);
  return app;
}
