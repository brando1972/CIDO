import { describe, expect, it } from "vitest";
import { div, formatDecimal, mul, parseDecimal } from "../../src/perps/decimal.js";

describe("perps fixed-point decimal math", () => {
  it("round trips supported decimal strings without floating point", () => {
    expect(formatDecimal(parseDecimal("123.45000000"))).toBe("123.45");
    expect(formatDecimal(parseDecimal("0.00000001"))).toBe("0.00000001");
  });
  it("multiplies and divides deterministically", () => {
    expect(formatDecimal(mul(parseDecimal("2500"), parseDecimal("0.0005")))).toBe("1.25");
    expect(formatDecimal(div(parseDecimal("1000"), parseDecimal("5")))).toBe("200");
  });
  it("rejects unsafe input forms", () => {
    expect(() => parseDecimal("1e3")).toThrow(); expect(() => parseDecimal("-1")).toThrow(); expect(() => parseDecimal("1.000000001")).toThrow();
  });
});
