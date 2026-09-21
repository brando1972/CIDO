import { privateKeyToAccount } from "viem/accounts";
import type { Address, Hex, TransactionSerializable } from "viem";
import type { AppConfig } from "../config/env.js";

export class TradingWallet {
  private readonly account;
  constructor(config: AppConfig) { this.account = config.PRIVATE_KEY ? privateKeyToAccount(config.PRIVATE_KEY as Hex) : undefined; }
  getAddress(): Address | undefined { return this.account?.address; }
  async signTransaction(transaction: TransactionSerializable): Promise<Hex> {
    if (!this.account) throw new Error("Trading wallet is not configured");
    return this.account.signTransaction(transaction);
  }
}
