import type { FastifyInstance } from "fastify";
import type { AppDependencies } from "../app.js";
import { getChainConfig } from "../config/chains.js";
import { getToken, TOKEN_REGISTRY } from "../config/tokens.js";
import { AppError } from "../utils/errors.js";
export function registerBalanceRoutes(app: FastifyInstance, deps: AppDependencies) {
  app.get("/balance", async () => {
    if (!deps.balances) throw new AppError("Wallet is not configured", "WALLET_NOT_CONFIGURED", 503);
    const chainId = getChainConfig(deps.config).chain.id; const tokens = TOKEN_REGISTRY[chainId] ?? [];
    const balances = [{ symbol: "BNB", amount: await deps.balances.getNativeBalance() }];
    for (const token of tokens) balances.push({ symbol: token.symbol, amount: (await deps.balances.getTokenBalance(token)).formatted });
    return { wallet: deps.walletAddress, balances };
  });
  app.get<{ Params: { token: string } }>("/balance/:token", async (request) => {
    if (!deps.balances) throw new AppError("Wallet is not configured", "WALLET_NOT_CONFIGURED", 503);
    const token = getToken(getChainConfig(deps.config).chain.id, request.params.token); const balance = await deps.balances.getTokenBalance(token);
    return { wallet: deps.walletAddress, symbol: token.symbol, amount: balance.formatted };
  });
}
