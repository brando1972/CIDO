import { describe, expect, it, vi } from "vitest";
import type { Address, PublicClient } from "viem";
import { simulateRawSwap } from "../../src/pancakeswap/simulation.js";
const owner = "0x0000000000000000000000000000000000000001" as Address;
const swap = { to: "0x0000000000000000000000000000000000000002", data: "0x1234", value: 0n, quote: {} } as const;
describe("raw-call simulation", () => {
  it("calls first and estimates gas only after success", async () => {
    const client = { call: vi.fn().mockResolvedValue({ data: "0x" }), estimateGas: vi.fn().mockResolvedValue(123n) } as unknown as PublicClient;
    await expect(simulateRawSwap(client, owner, swap as never)).resolves.toEqual({ success: true, gasEstimate: 123n });
    expect(client.call).toHaveBeenCalledBefore(client.estimateGas as never);
  });
  it("fails closed and never estimates after a reverted call", async () => {
    const client = { call: vi.fn().mockRejectedValue(new Error("execution reverted: bad route")), estimateGas: vi.fn() } as unknown as PublicClient;
    await expect(simulateRawSwap(client, owner, swap as never)).rejects.toMatchObject({ code: "SIMULATION_FAILED" });
    expect(client.estimateGas).not.toHaveBeenCalled();
  });
});
