import { parseUnits } from "viem";
import type { TokenDefinition } from "../types/index.js";
export function parseTokenAmount(amount: string, token: TokenDefinition): bigint { return parseUnits(amount, token.decimals); }
