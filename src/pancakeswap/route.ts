import type { TradeType as TradeTypeEnum } from "@pancakeswap/sdk";
import type { SmartRouterTrade } from "@pancakeswap/smart-router";
import type { PublicClient } from "viem";
import type { QuoteRequest } from "../types/index.js";
import { QuoteUnavailableError } from "../utils/errors.js";
import { pancakeSdk, smartRouterSdk } from "./sdk-runtime.js";

const { CurrencyAmount, Token, TradeType } = pancakeSdk;
const { PoolType, SmartRouter } = smartRouterSdk;

export type ExactInputTrade = SmartRouterTrade<TradeTypeEnum.EXACT_INPUT>;

export interface RouteProvider {
  getExactInputTrade(request: QuoteRequest): Promise<ExactInputTrade>;
}

export class PancakeRouteProvider implements RouteProvider {
  constructor(private readonly client: PublicClient) {}

  async getExactInputTrade(request: QuoteRequest): Promise<ExactInputTrade> {
    if (![56, 97].includes(request.tokenIn.chainId) || request.tokenIn.chainId !== request.tokenOut.chainId) {
      throw new QuoteUnavailableError("PancakeSwap routing supports only BSC chain IDs 56 and 97");
    }
    const input = new Token(request.tokenIn.chainId, request.tokenIn.address, request.tokenIn.decimals, request.tokenIn.symbol, request.tokenIn.name);
    const output = new Token(request.tokenOut.chainId, request.tokenOut.address, request.tokenOut.decimals, request.tokenOut.symbol, request.tokenOut.name);
    const onChainProvider = () => this.client;
    // Testnet is not supported by the SDK's default external USD-price source.
    // Candidate discovery does not require USD pricing, so use on-chain reserves
    // with a null price provider instead of generating noisy third-party fallbacks.
    const v2PoolProvider = SmartRouter.createV2PoolsProviderByCommonTokenPrices(async () => null);
    const getV2CandidatePools = SmartRouter.createGetV2CandidatePools(v2PoolProvider);
    const [v2Pools, v3Pools] = await Promise.all([
      getV2CandidatePools({ currencyA: input, currencyB: output, onChainProvider }),
      SmartRouter.getV3CandidatePools({ currencyA: input, currencyB: output, onChainProvider, subgraphFallback: true, staticFallback: true })
    ]);
    const pools = [...v2Pools, ...v3Pools];
    if (pools.length === 0) throw new QuoteUnavailableError("No PancakeSwap V2 or V3 pools were found");
    const trade = await SmartRouter.getBestTrade(CurrencyAmount.fromRawAmount(input, request.amountIn), output, TradeType.EXACT_INPUT, {
      gasPriceWei: () => this.client.getGasPrice(), maxHops: 3, maxSplits: 2,
      allowedPoolTypes: [PoolType.V2, PoolType.V3],
      poolProvider: SmartRouter.createStaticPoolProvider(pools),
      quoteProvider: SmartRouter.createQuoteProvider({ onChainProvider }), quoterOptimization: true
    });
    if (!trade || trade.tradeType !== TradeType.EXACT_INPUT) throw new QuoteUnavailableError("PancakeSwap returned no exact-input route");
    return trade as ExactInputTrade;
  }
}

export function describeRoute(trade: ExactInputTrade): string[] {
  return trade.routes.map((route) => route.path.map((currency) => currency.symbol ?? currency.wrapped.address).join(" → "));
}
