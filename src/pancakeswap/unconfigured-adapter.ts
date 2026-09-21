import type { Hash } from "viem";
import type { ApprovalRequest, AllowanceRequest, AllowanceResult, DexAdapter, SwapRequest } from "./adapter.js";
import type { PreparedSwap, QuoteRequest, QuoteResult, ReceiptResult, SimulationResult, TransactionResult } from "../types/index.js";
import { IntegrationUnavailableError } from "../utils/errors.js";

/** Fail-closed until official PancakeSwap router tooling is selected and verified. */
export class UnconfiguredPancakeSwapAdapter implements DexAdapter {
  private unavailable(): never { throw new IntegrationUnavailableError(); }
  getQuote(_params: QuoteRequest): Promise<QuoteResult> { return Promise.reject(this.unavailable()); }
  checkAllowance(_params: AllowanceRequest): Promise<AllowanceResult> { return Promise.reject(this.unavailable()); }
  approveToken(_params: ApprovalRequest): Promise<TransactionResult> { return Promise.reject(this.unavailable()); }
  buildSwap(_params: SwapRequest): Promise<PreparedSwap> { return Promise.reject(this.unavailable()); }
  simulateSwap(_params: PreparedSwap): Promise<SimulationResult> { return Promise.reject(this.unavailable()); }
  executeSwap(_params: PreparedSwap): Promise<TransactionResult> { return Promise.reject(this.unavailable()); }
  waitForReceipt(_hash: Hash): Promise<ReceiptResult> { return Promise.reject(this.unavailable()); }
}
