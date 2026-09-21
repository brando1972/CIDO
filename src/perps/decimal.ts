import { AppError } from "../utils/errors.js";

export const SCALE = 100_000_000n;

export function parseDecimal(value: string, field = "value"): bigint {
  if (!/^\d+(?:\.\d{1,8})?$/.test(value)) throw new AppError(`${field} must be a non-negative decimal string with at most 8 decimal places`, "INVALID_DECIMAL", 400);
  const [whole = "0", fraction = ""] = value.split(".");
  return BigInt(whole) * SCALE + BigInt(fraction.padEnd(8, "0"));
}

export function formatDecimal(value: bigint): string {
  const sign = value < 0n ? "-" : "";
  const absolute = value < 0n ? -value : value;
  const whole = absolute / SCALE;
  const fraction = (absolute % SCALE).toString().padStart(8, "0").replace(/0+$/, "");
  return `${sign}${whole}${fraction ? `.${fraction}` : ""}`;
}

export const mul = (a: bigint, b: bigint): bigint => (a * b) / SCALE;
export function div(a: bigint, b: bigint): bigint {
  if (b === 0n) throw new AppError("Cannot divide by zero", "DIVISION_BY_ZERO", 400);
  return (a * SCALE) / b;
}
