import { describe, expect, it, vi } from "vitest";
import type { Address, PublicClient, WalletClient } from "viem";
import { smartRouterSdk } from "../../src/pancakeswap/sdk-runtime.js";
import { PancakeSwapAdapter } from "../../src/pancakeswap/pancakeswap-adapter.js";
import { officialRouterAddress } from "../../src/pancakeswap/swap.js";
import { percent } from "../../src/pancakeswap/quote.js";

const owner = "0x0000000000000000000000000000000000000001" as Address;
const token = "0x0000000000000000000000000000000000000002" as Address;
const attacker = "0x0000000000000000000000000000000000000003" as Address;
const { SMART_ROUTER_ADDRESSES } = smartRouterSdk;

function clients() {
  const publicClient = { getChainId: vi.fn().mockResolvedValue(56), readContract: vi.fn().mockResolvedValue(9n), call: vi.fn(), estimateGas: vi.fn() } as unknown as PublicClient;
  const walletClient = { writeContract: vi.fn(), sendTransaction: vi.fn() } as unknown as WalletClient;
  return { publicClient, walletClient };
}

describe("PancakeSwapAdapter safety boundaries", () => {
  it("uses router addresses exported by the official SDK", () => { expect(officialRouterAddress(56)).toBe(SMART_ROUTER_ADDRESSES[56]); expect(officialRouterAddress(97)).toBe(SMART_ROUTER_ADDRESSES[97]); });
  it("rejects unsupported chains", () => expect(() => officialRouterAddress(1)).toThrow(/No approved/));
  it("reads a limited allowance for the approved router", async () => {
    const { publicClient } = clients(); const adapter = new PancakeSwapAdapter({ publicClient, chainId: 56 });
    await expect(adapter.checkAllowance({ token, owner, spender: SMART_ROUTER_ADDRESSES[56], amount: 10n })).resolves.toEqual({ current: 9n, required: 10n, sufficient: false });
  });
  it("rejects an unexpected spender before an RPC call", async () => {
    const { publicClient } = clients(); const adapter = new PancakeSwapAdapter({ publicClient, chainId: 56 });
    await expect(adapter.checkAllowance({ token, owner, spender: attacker, amount: 1n })).rejects.toMatchObject({ code: "RPC_ERROR" });
    expect(publicClient.readContract).not.toHaveBeenCalled();
  });
  it("never approves or broadcasts while live trading is disabled", async () => {
    const { publicClient, walletClient } = clients(); const adapter = new PancakeSwapAdapter({ publicClient, walletClient, walletAddress: owner, chainId: 56, liveTradingEnabled: false });
    await expect(adapter.approveToken({ token, spender: SMART_ROUTER_ADDRESSES[56], amount: 1n })).rejects.toMatchObject({ code: "LIVE_TRADING_DISABLED" });
    expect(walletClient.writeContract).not.toHaveBeenCalled(); expect(walletClient.sendTransaction).not.toHaveBeenCalled();
  });
  it("encodes fractional percentages exactly enough for slippage policy", () => expect(percent(0.5).toSignificant(3)).toBe("0.5"));
});
