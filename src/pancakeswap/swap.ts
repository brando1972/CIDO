import { hexToBigInt, type Address, type WalletClient } from "viem";
import type { PreparedSwap, QuoteResult, TransactionResult } from "../types/index.js";
import type { ExactInputTrade } from "./route.js";
import { percent } from "./quote.js";
import { RpcError } from "../utils/errors.js";
import { smartRouterSdk } from "./sdk-runtime.js";

const { SMART_ROUTER_ADDRESSES, SwapRouter } = smartRouterSdk;

export function officialRouterAddress(chainId: number): Address {
  if (chainId !== 56 && chainId !== 97) throw new RpcError(`No approved PancakeSwap Smart Router for chain ${chainId}`);
  return SMART_ROUTER_ADDRESSES[chainId];
}

export function buildSwapCalldata(trade: ExactInputTrade, quote: QuoteResult, recipient: Address): PreparedSwap {
  const to = officialRouterAddress(quote.tokenIn.chainId);
  const params = SwapRouter.swapCallParameters(trade, { recipient, slippageTolerance: percent(quote.slippagePercent), deadlineOrPreviousBlockhash: Math.floor(Date.now() / 1_000) + 300 });
  return { to, data: params.calldata, value: hexToBigInt(params.value), quote };
}

export async function sendPreparedSwap(walletClient: WalletClient, owner: Address, expectedRouter: Address, swap: PreparedSwap): Promise<TransactionResult> {
  if (swap.to.toLowerCase() !== expectedRouter.toLowerCase()) throw new RpcError("Refused transaction to an unexpected contract");
  try {
    const hash = await walletClient.sendTransaction({ account: owner, to: swap.to, data: swap.data, value: swap.value, chain: walletClient.chain });
    return { hash };
  } catch (error) {
    throw new RpcError("Swap broadcast failed", error instanceof Error ? { name: error.name, message: error.message } : undefined);
  }
}
