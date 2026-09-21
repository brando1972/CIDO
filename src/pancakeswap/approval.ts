import { erc20Abi, type Address, type PublicClient, type WalletClient } from "viem";
import type { TransactionResult } from "../types/index.js";
import { AllowanceError, WrongChainError } from "../utils/errors.js";

export async function approveExactAmount(params: { publicClient: PublicClient; walletClient: WalletClient; owner: Address; token: Address; spender: Address; amount: bigint; expectedChainId: number }): Promise<TransactionResult> {
  const actualChainId = await params.publicClient.getChainId();
  if (actualChainId !== params.expectedChainId) throw new WrongChainError(params.expectedChainId, actualChainId);
  try {
    const simulation = await params.publicClient.simulateContract({ account: params.owner, address: params.token, abi: erc20Abi, functionName: "approve", args: [params.spender, params.amount] });
    const hash = await params.walletClient.writeContract(simulation.request);
    return { hash };
  } catch (error) {
    throw new AllowanceError(error instanceof Error ? error.message : "Token approval failed");
  }
}
