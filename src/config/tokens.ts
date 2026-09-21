import { getAddress } from "viem";
import type { TokenDefinition } from "../types/index.js";
import { UnsupportedTokenError } from "../utils/errors.js";

function token(symbol: string, name: string, address: string, chainId: number): TokenDefinition {
  return { symbol, name, address: getAddress(address), decimals: 18, chainId };
}

/**
 * Canonical addresses copied from @pancakeswap/tokens 0.9.0 and pinned here so
 * configuration does not load the SDK's unrelated multi-chain runtime graph.
 * Arbitrary addresses remain disabled.
 */
export const TOKEN_REGISTRY: Readonly<Record<number, readonly TokenDefinition[]>> = {
  56: [
    token("WBNB", "Wrapped BNB", "0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c", 56),
    token("USDT", "Tether USD", "0x55d398326f99059fF775485246999027B3197955", 56),
    token("USDC", "Binance-Peg USD Coin", "0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d", 56),
    token("CAKE", "PancakeSwap Token", "0x0E09FaBB73Bd3Ade0a17ECC321fD13a19e81cE82", 56),
  ],
  97: [
    token("WBNB", "Wrapped BNB", "0xae13d989daC2f0dEbFf460aC112a837C89BAa7cd", 97),
    token("USDT", "Tether USD", "0x0fB5D7c73FA349A90392f873a4FA1eCf6a3d0a96", 97),
    token("USDC", "Binance-Peg USD Coin", "0xCA8eB2dec4Fe3a5abbFDc017dE48E461A936623D", 97),
    token("CAKE", "PancakeSwap Token", "0x8d008B313C1d6C7fE2982F62d32Da7507cF43551", 97),
  ],
};

export function getToken(chainId: number, symbolOrAddress: string): TokenDefinition {
  const tokens = TOKEN_REGISTRY[chainId] ?? [];
  const requested = symbolOrAddress.toUpperCase();
  const token = tokens.find((candidate) => candidate.symbol.toUpperCase() === requested || candidate.address === tryAddress(symbolOrAddress));
  if (!token) throw new UnsupportedTokenError(symbolOrAddress, chainId);
  return token;
}

function tryAddress(value: string): string | undefined {
  try { return getAddress(value); } catch { return undefined; }
}
