import { createPublicClient, createWalletClient, http, type PublicClient, type WalletClient } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import type { AppConfig } from "../config/env.js";
import { getChainConfig } from "../config/chains.js";
import { WrongChainError } from "../utils/errors.js";

export class BlockchainClient {
  readonly publicClient: PublicClient;
  readonly walletClient?: WalletClient;
  private readonly chainConfig;
  constructor(private readonly config: AppConfig) {
    this.chainConfig = getChainConfig(config);
    this.publicClient = createPublicClient({ chain: this.chainConfig.chain, transport: http(this.chainConfig.rpcUrl) });
    if (config.PRIVATE_KEY) this.walletClient = createWalletClient({ account: privateKeyToAccount(config.PRIVATE_KEY as `0x${string}`), chain: this.chainConfig.chain, transport: http(this.chainConfig.rpcUrl) });
  }
  getPublicClient() { return this.publicClient; }
  getWalletClient() { return this.walletClient; }
  getBlockNumber() { return this.publicClient.getBlockNumber(); }
  async checkChain() {
    const actual = await this.publicClient.getChainId();
    if (actual !== this.chainConfig.chain.id) throw new WrongChainError(this.chainConfig.chain.id, actual);
    return actual;
  }
}
