import { describe, expect, it, vi } from "vitest";
import type { Address } from "viem";
import type { AppConfig } from "../../src/config/env.js";
import type { BalanceService } from "../../src/blockchain/balances.js";
import type { DexAdapter } from "../../src/pancakeswap/adapter.js";
import type { PreparedSwap, QuoteResult } from "../../src/types/index.js";
import { getToken } from "../../src/config/tokens.js";
import { TradeService } from "../../src/trading/trade-service.js";

const wallet = "0x0000000000000000000000000000000000000001" as Address;
const spender = "0x9a489505a00cE272eAa5e07Dba6491314CaE3796" as Address;
const usdt = getToken(97, "USDT");
const cake = getToken(97, "CAKE");
const config = {
  ENABLE_LIVE_TRADING: false,
  DEFAULT_SLIPPAGE_PERCENT: 0.5,
  MAX_SLIPPAGE_PERCENT: 1,
  MAX_TRADE_USD: 25,
  MAX_PRICE_IMPACT_PERCENT: 5,
  QUOTE_TTL_SECONDS: 30,
} as AppConfig;

function quote(): QuoteResult {
  return { tokenIn: usdt, tokenOut: cake, amountIn: 10n ** 18n, expectedAmountOut: 3n * 10n ** 17n, minimumAmountOut: 29n * 10n ** 16n, slippagePercent: 0.5, priceImpactPercent: 1, route: ["USDT → CAKE"], quoteTimestamp: new Date(), expiresAt: new Date(Date.now() + 30_000) };
}

function dependencies(allowance = true, balance = 2n * 10n ** 18n) {
  const prepared = { to: spender, data: "0x", value: 0n, quote: quote() } as PreparedSwap;
  const dex = {
    spender,
    getQuote: vi.fn().mockResolvedValue(quote()),
    checkAllowance: vi.fn().mockResolvedValue({ current: allowance ? 10n ** 18n : 0n, required: 10n ** 18n, sufficient: allowance }),
    approveToken: vi.fn(), buildSwap: vi.fn().mockResolvedValue(prepared),
    simulateSwap: vi.fn().mockResolvedValue({ success: true, gasEstimate: 200_000n }),
    executeSwap: vi.fn(), waitForReceipt: vi.fn(),
  } as unknown as DexAdapter;
  const balances = { getTokenBalance: vi.fn().mockResolvedValue({ raw: balance, formatted: "2" }) } as unknown as BalanceService;
  return { dex, balances };
}

describe("TradeService execution gates", () => {
  it("returns approval_required without signing when simulation mode lacks allowance", async () => {
    const { dex, balances } = dependencies(false);
    const result = await new TradeService(config, 97, wallet, dex, balances).trade({ tokenIn: "USDT", tokenOut: "CAKE", amountIn: "1" });
    expect(result).toMatchObject({ status: "approval_required", wouldExecute: false });
    expect(dex.approveToken).not.toHaveBeenCalled();
    expect(dex.executeSwap).not.toHaveBeenCalled();
  });

  it("simulates but never broadcasts when allowance is sufficient and live trading is off", async () => {
    const { dex, balances } = dependencies(true);
    const result = await new TradeService(config, 97, wallet, dex, balances).trade({ tokenIn: "USDT", tokenOut: "CAKE", amountIn: "1" });
    expect(result).toMatchObject({ status: "simulation_only", wouldExecute: true });
    expect(dex.simulateSwap).toHaveBeenCalledOnce();
    expect(dex.executeSwap).not.toHaveBeenCalled();
  });

  it("rejects an amount larger than the wallet token balance", async () => {
    const { dex, balances } = dependencies(true, 1n);
    await expect(new TradeService(config, 97, wallet, dex, balances).trade({ tokenIn: "USDT", tokenOut: "CAKE", amountIn: "1" })).rejects.toMatchObject({ code: "INSUFFICIENT_BALANCE" });
    expect(dex.buildSwap).not.toHaveBeenCalled();
  });
});
