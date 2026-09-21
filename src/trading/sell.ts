import type { z } from "zod";
import type { buySellSchema, TradeInput } from "./schemas.js";
export function sellToTrade(input: z.infer<typeof buySellSchema>): TradeInput { return { tokenIn: input.token, tokenOut: input.quoteToken, amountIn: input.amount, ...(input.maxSlippagePercent === undefined ? {} : { maxSlippagePercent: input.maxSlippagePercent }) }; }
