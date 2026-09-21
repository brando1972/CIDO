import type { Hash, PublicClient } from "viem";
import type { ReceiptResult } from "../types/index.js";
export async function waitForReceipt(client: PublicClient, hash: Hash): Promise<ReceiptResult> {
  const receipt = await client.waitForTransactionReceipt({ hash });
  return { hash, status: receipt.status === "success" ? "confirmed" : "reverted", blockNumber: receipt.blockNumber, gasUsed: receipt.gasUsed, effectiveGasPrice: receipt.effectiveGasPrice };
}
