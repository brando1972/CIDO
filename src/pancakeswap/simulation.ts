import type { Address, PublicClient } from "viem";
import type { PreparedSwap, SimulationResult } from "../types/index.js";
import { SimulationError } from "../utils/errors.js";

export async function simulateRawSwap(client: PublicClient, owner: Address, swap: PreparedSwap): Promise<SimulationResult> {
  try {
    await client.call({ account: owner, to: swap.to, data: swap.data, value: swap.value });
    const gasEstimate = await client.estimateGas({ account: owner, to: swap.to, data: swap.data, value: swap.value });
    return { success: true, gasEstimate };
  } catch (error) {
    throw new SimulationError("PancakeSwap raw-call simulation failed", error instanceof Error ? { name: error.name, message: error.message } : undefined);
  }
}
