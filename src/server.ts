import { loadConfig } from "./config/env.js";
import { getChainConfig } from "./config/chains.js";
import { BlockchainClient } from "./blockchain/client.js";
import { TradingWallet } from "./blockchain/wallet.js";
import { BalanceService } from "./blockchain/balances.js";
import { PancakeSwapAdapter } from "./pancakeswap/pancakeswap-adapter.js";
import { TradeService } from "./trading/trade-service.js";
import { buildApp } from "./app.js";
import { getAddress } from "viem";
import { PaperPerpsService } from "./perps/paper-service.js";
import { getSupabaseClient, DatabaseRepository } from "./db/supabase.js";

const config = loadConfig(); const chain = getChainConfig(config); const blockchain = new BlockchainClient(config); const wallet = new TradingWallet(config);
const signerAddress = wallet.getAddress();
const address = signerAddress ?? (config.READ_ONLY_WALLET_ADDRESS ? getAddress(config.READ_ONLY_WALLET_ADDRESS) : undefined);
const walletClient = blockchain.getWalletClient(); const balances = address ? new BalanceService(blockchain.getPublicClient(), address) : undefined;
const dex = new PancakeSwapAdapter({
  publicClient: blockchain.getPublicClient(),
  ...(walletClient ? { walletClient } : {}),
  ...(address ? { walletAddress: address } : {}),
  chainId: chain.chain.id as 56 | 97,
  liveTradingEnabled: config.ENABLE_LIVE_TRADING,
  quoteTtlSeconds: config.QUOTE_TTL_SECONDS,
});
const trades = new TradeService(config, chain.chain.id, address, dex, balances);
const supabaseClient = getSupabaseClient(config);
const db = supabaseClient ? new DatabaseRepository(supabaseClient) : undefined;
const perps = new PaperPerpsService(config, { stateFilePath: "./data/paper-state.json", ...(db ? { db } : {}) });
perps.start();
const app = buildApp({ config, blockchain, wallet, ...(address ? { walletAddress: address } : {}), ...(balances ? { balances } : {}), trades, perps, ...(db ? { db } : {}) });
app.addHook("onClose", async () => perps.stop());
await app.listen({ host: "0.0.0.0", port: config.PORT });
