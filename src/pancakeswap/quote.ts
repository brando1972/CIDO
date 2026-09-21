import type { Percent as PancakePercent } from "@pancakeswap/sdk";
import type { QuoteRequest, QuoteResult } from "../types/index.js";
import type { ExactInputTrade, RouteProvider } from "./route.js";
import { describeRoute } from "./route.js";
import { pancakeSdk, smartRouterSdk } from "./sdk-runtime.js";

const { Percent } = pancakeSdk;
const { SmartRouter } = smartRouterSdk;

export interface QuotedTrade { quote: QuoteResult; trade: ExactInputTrade; }

export class PancakeQuoteService {
  constructor(private readonly routes: RouteProvider, private readonly quoteTtlSeconds = 30) {}
  async getQuote(request: QuoteRequest): Promise<QuotedTrade> {
    const trade = await this.routes.getExactInputTrade(request);
    const slippage = percent(request.slippagePercent);
    const now = new Date();
    const quote: QuoteResult = {
      tokenIn: request.tokenIn, tokenOut: request.tokenOut, amountIn: request.amountIn,
      expectedAmountOut: trade.outputAmount.quotient,
      minimumAmountOut: SmartRouter.minimumAmountOut(trade, slippage).quotient,
      slippagePercent: request.slippagePercent, estimatedGas: trade.gasEstimate,
      priceImpactPercent: Number(SmartRouter.getPriceImpact(trade).toSignificant(8)),
      route: describeRoute(trade), quoteTimestamp: now,
      expiresAt: new Date(now.getTime() + this.quoteTtlSeconds * 1_000)
    };
    return { quote, trade };
  }
}

export function percent(value: number): PancakePercent {
  if (!Number.isFinite(value) || value <= 0) throw new RangeError("Slippage percent must be positive and finite");
  return new Percent(BigInt(Math.round(value * 10_000)), 1_000_000n);
}
