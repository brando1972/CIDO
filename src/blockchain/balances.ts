import { erc20Abi, formatEther, formatUnits, type Address, type PublicClient } from "viem";
import type { TokenDefinition } from "../types/index.js";

export class BalanceService {
  constructor(private readonly client: PublicClient, private readonly wallet: Address) {}
  async getNativeBalance() { return formatEther(await this.client.getBalance({ address: this.wallet })); }
  async getTokenBalance(token: TokenDefinition) {
    const raw = await this.client.readContract({ address: token.address, abi: erc20Abi, functionName: "balanceOf", args: [this.wallet] });
    return { raw, formatted: formatUnits(raw, token.decimals) };
  }
}
