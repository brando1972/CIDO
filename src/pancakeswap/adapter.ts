import type { Address, Hash } from "viem";
import type { PreparedSwap, QuoteRequest, QuoteResult, ReceiptResult, SimulationResult, TransactionResult } from "../types/index.js";

export interface AllowanceRequest { token: Address; owner: Address; spender: Address; amount: bigint; }
export interface AllowanceResult { current: bigint; required: bigint; sufficient: boolean; }
export interface ApprovalRequest { token: Address; spender: Address; amount: bigint; }
export interface SwapRequest { quote: QuoteResult; recipient: Address; }

export interface DexAdapter {
  readonly spender?: Address;
  getQuote(params: QuoteRequest): Promise<QuoteResult>;
  checkAllowance(params: AllowanceRequest): Promise<AllowanceResult>;
  approveToken(params: ApprovalRequest): Promise<TransactionResult>;
  buildSwap(params: SwapRequest): Promise<PreparedSwap>;
  simulateSwap(params: PreparedSwap): Promise<SimulationResult>;
  executeSwap(params: PreparedSwap): Promise<TransactionResult>;
  waitForReceipt(hash: Hash): Promise<ReceiptResult>;
}

export { PancakeSwapAdapter, type PancakeSwapAdapterOptions } from "./pancakeswap-adapter.js";
