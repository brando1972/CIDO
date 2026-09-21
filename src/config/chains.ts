import { bsc, bscTestnet, type Chain } from "viem/chains";
import { getAddress } from "viem";
import type { AppConfig } from "./env.js";

export interface ChainConfig {
  chain: Chain;
  rpcUrl: string;
  explorerUrl: string;
  /** Populated only after verification against current official PancakeSwap docs. */
  allowedSwapTargets: readonly `0x${string}`[];
}

export function getChainConfig(config: AppConfig): ChainConfig {
  if (config.CHAIN === "bsc-mainnet") return {
    chain: bsc,
    rpcUrl: config.BSC_MAINNET_RPC_URL!,
    explorerUrl: "https://bscscan.com",
    allowedSwapTargets: [getAddress("0x13f4EA83D0bd40E75C8222255bc855a974568Dd4")],
  };
  return {
    chain: bscTestnet,
    rpcUrl: config.BSC_TESTNET_RPC_URL!,
    explorerUrl: "https://testnet.bscscan.com",
    allowedSwapTargets: [getAddress("0x9a489505a00cE272eAa5e07Dba6491314CaE3796")],
  };
}
