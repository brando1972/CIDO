import type { z } from "zod";
import type { buySellSchema, TradeInput } from "./schemas.js";
export function buyToTrade(input: z.infer<typeof buySellSchema>): TradeInput { return { tokenIn: input.quoteToken, tokenOut: input.token, amountIn: input.amount, ...(input.maxSlippagePercent === undefined ? {} : { maxSlippagePercent: input.maxSlippagePercent }) }; }
