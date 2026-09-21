import { z } from "zod";

const decimalString = z.string().regex(/^\d+(?:\.\d+)?$/, "Must be a non-negative decimal string").refine((value) => Number(value) > 0, "Amount must be greater than zero");
const tokenIdentifier = z.string().min(2).max(64);
const slippage = z.number().positive().optional();

export const quoteSchema = z.object({ tokenIn: tokenIdentifier, tokenOut: tokenIdentifier, amountIn: decimalString, slippagePercent: slippage }).strict();
export const tradeSchema = z.object({
  requestId: z.string().min(1).max(128).optional(), tokenIn: tokenIdentifier, tokenOut: tokenIdentifier,
  amountIn: decimalString, maxSlippagePercent: slippage, metadata: z.record(z.unknown()).optional()
}).strict();
export const buySellSchema = z.object({ token: tokenIdentifier, quoteToken: tokenIdentifier, amount: decimalString, maxSlippagePercent: slippage }).strict();
export type QuoteInput = z.infer<typeof quoteSchema>;
export type TradeInput = z.infer<typeof tradeSchema>;
