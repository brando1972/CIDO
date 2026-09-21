import type { Address, Hash, Hex } from "viem";

export type ChainName = "bsc-mainnet" | "bsc-testnet";

export interface TokenDefinition {
  symbol: string;
  name: string;
  address: Address;
  decimals: number;
  chainId: number;
}

export interface QuoteRequest {
  tokenIn: TokenDefinition;
  tokenOut: TokenDefinition;
  amountIn: bigint;
  slippagePercent: number;
}

export interface QuoteResult {
  tokenIn: TokenDefinition;
  tokenOut: TokenDefinition;
  amountIn: bigint;
  expectedAmountOut: bigint;
  minimumAmountOut: bigint;
  slippagePercent: number;
  estimatedGas?: bigint;
  priceImpactPercent?: number;
  route: readonly string[];
  quoteTimestamp: Date;
  expiresAt: Date;
}

export interface PreparedSwap {
  to: Address;
  data: Hex;
  value: bigint;
  quote: QuoteResult;
}

export interface TransactionResult { hash: Hash; }
export interface SimulationResult { success: true; gasEstimate?: bigint; }
export interface ReceiptResult {
  hash: Hash;
  status: "confirmed" | "reverted";
  blockNumber: bigint;
  gasUsed: bigint;
  effectiveGasPrice: bigint;
}
