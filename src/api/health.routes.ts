import type { FastifyInstance } from "fastify";
import type { AppDependencies } from "../app.js";
import { getChainConfig } from "../config/chains.js";
export function registerHealthRoutes(app: FastifyInstance, deps: AppDependencies) {
  app.get("/health", async () => { const chain = getChainConfig(deps.config); await deps.blockchain.checkChain(); return { status: "ok", chain: deps.config.CHAIN, chainId: chain.chain.id, blockNumber: (await deps.blockchain.getBlockNumber()).toString(), wallet: deps.walletAddress ?? null, walletMode: deps.wallet.getAddress() ? "signer" : deps.walletAddress ? "read-only" : "none", liveTradingEnabled: deps.config.ENABLE_LIVE_TRADING, dexIntegrationConfigured: true, perps: { mode: deps.perps.mode, liveExecutionEnabled: false, source: deps.perps.dataSource } }; });
}
