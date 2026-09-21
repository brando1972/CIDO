import { describe, expect, it } from "vitest";
import { loadConfig } from "../../src/config/env.js";
const base = { BSC_TESTNET_RPC_URL: "https://rpc.example.test", CHAIN: "bsc-testnet" };
describe("environment", () => {
  it("defaults live trading off", () => expect(loadConfig(base).ENABLE_LIVE_TRADING).toBe(false));
  it("requires a key for live trading", () => expect(() => loadConfig({ ...base, ENABLE_LIVE_TRADING: "true" })).toThrow());
  it("does not require a key for read-only mode", () => expect(loadConfig({ ...base, ENABLE_LIVE_TRADING: "false" }).PRIVATE_KEY).toBeUndefined());
  it("defaults perpetuals to paper mode and makes live perps impossible", () => {
    expect(loadConfig(base)).toMatchObject({ PERPS_MODE: "paper", ENABLE_LIVE_PERPS: false, PERPS_MAX_LEVERAGE: 3 });
    expect(() => loadConfig({ ...base, ENABLE_LIVE_PERPS: "true" })).toThrow();
    expect(() => loadConfig({ ...base, PERPS_MODE: "live" })).toThrow();
    expect(loadConfig({ ...base, PERPS_MAX_LEVERAGE: "10" }).PERPS_MAX_LEVERAGE).toBe(10);
    expect(() => loadConfig({ ...base, PERPS_MAX_LEVERAGE: "126" })).toThrow();
  });
});
