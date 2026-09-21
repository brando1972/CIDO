import { describe, expect, it } from "vitest";
import { parseTokenAmount } from "../../src/trading/validation.js";
describe("decimal conversion", () => { it("uses token decimals exactly", () => expect(parseTokenAmount("10.25", { symbol: "T", name: "T", address: "0x0000000000000000000000000000000000000001", decimals: 6, chainId: 97 })).toBe(10_250_000n)); });
