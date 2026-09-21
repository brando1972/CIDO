import { loadConfig } from "../src/config/env.js";
import { BlockchainClient } from "../src/blockchain/client.js";
import { TradingWallet } from "../src/blockchain/wallet.js";
import { BalanceService } from "../src/blockchain/balances.js";
const config = loadConfig(); const blockchain = new BlockchainClient(config); await blockchain.checkChain();
const address = new TradingWallet(config).getAddress(); if (!address) throw new Error("PRIVATE_KEY is required for wallet balance testing");
console.log(JSON.stringify({ wallet: address, nativeBalance: await new BalanceService(blockchain.getPublicClient(), address).getNativeBalance() }, null, 2));
