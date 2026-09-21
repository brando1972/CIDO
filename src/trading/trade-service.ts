import { randomUUID } from "node:crypto";
import { formatUnits, type Address } from "viem";
import type { BalanceService } from "../blockchain/balances.js";
import type { AppConfig } from "../config/env.js";
import { getToken } from "../config/tokens.js";
import type { DexAdapter } from "../pancakeswap/adapter.js";
import type { QuoteInput, TradeInput } from "./schemas.js";
import { parseTokenAmount } from "./validation.js";
import { validateQuote, validateSlippage, validateUsdTradeLimit } from "./risk.js";
import { AllowanceError, InsufficientBalanceError, IntegrationUnavailableError, TransactionRevertedError } from "../utils/errors.js";

export class TradeService {
  constructor(private readonly config: AppConfig, private readonly chainId: number, private readonly wallet: Address | undefined, private readonly dex: DexAdapter, private readonly balances?: BalanceService) {}
  async quote(input: QuoteInput) {
    const tokenIn = getToken(this.chainId, input.tokenIn); const tokenOut = getToken(this.chainId, input.tokenOut);
    const quote = await this.dex.getQuote({ tokenIn, tokenOut, amountIn: parseTokenAmount(input.amountIn, tokenIn), slippagePercent: validateSlippage(input.slippagePercent, this.config) });
    validateQuote(quote, this.config); return serializeQuote(quote);
  }
  async trade(input: TradeInput) {
    const tradeId = randomUUID();
    const tokenIn = getToken(this.chainId, input.tokenIn); const tokenOut = getToken(this.chainId, input.tokenOut);
    const slippagePercent = validateSlippage(input.maxSlippagePercent, this.config);
    // USD cap is enforceable only where tokenIn is an approved USD quote asset.
    if (["USDT", "USDC"].includes(tokenIn.symbol)) validateUsdTradeLimit(input.amountIn, this.config);
    const amountIn = parseTokenAmount(input.amountIn, tokenIn);
    const quote = await this.dex.getQuote({ tokenIn, tokenOut, amountIn, slippagePercent });
    validateQuote(quote, this.config);
    if (!["USDT", "USDC"].includes(tokenIn.symbol) && ["USDT", "USDC"].includes(tokenOut.symbol)) {
      validateUsdTradeLimit(formatUnits(quote.expectedAmountOut, tokenOut.decimals), this.config);
    }
    if (!this.wallet) return { tradeId, status: "wallet_required", quote: serializeQuote(quote) };
    if (!this.balances) throw new InsufficientBalanceError();
    const balance = await this.balances.getTokenBalance(tokenIn);
    if (balance.raw < amountIn) throw new InsufficientBalanceError();
    if (!this.dex.spender) throw new IntegrationUnavailableError();
    let allowance = await this.dex.checkAllowance({ token: tokenIn.address, owner: this.wallet, spender: this.dex.spender, amount: amountIn });
    if (!allowance.sufficient) {
      if (!this.config.ENABLE_LIVE_TRADING) {
        return { tradeId, status: "approval_required", wouldExecute: false, requiredAllowance: input.amountIn, quote: serializeQuote(quote) };
      }
      const approval = await this.dex.approveToken({ token: tokenIn.address, spender: this.dex.spender, amount: amountIn });
      const approvalReceipt = await this.dex.waitForReceipt(approval.hash);
      if (approvalReceipt.status !== "confirmed") throw new TransactionRevertedError();
      allowance = await this.dex.checkAllowance({ token: tokenIn.address, owner: this.wallet, spender: this.dex.spender, amount: amountIn });
      if (!allowance.sufficient) throw new AllowanceError("Token approval confirmed but allowance remains insufficient");
    }
    // Refresh the quote after an approval delay so stale calldata is never signed.
    const executionQuote = this.config.ENABLE_LIVE_TRADING
      ? await this.dex.getQuote({ tokenIn, tokenOut, amountIn, slippagePercent })
      : quote;
    validateQuote(executionQuote, this.config);
    const prepared = await this.dex.buildSwap({ quote: executionQuote, recipient: this.wallet });
    const simulation = await this.dex.simulateSwap(prepared);
    if (!this.config.ENABLE_LIVE_TRADING) return { tradeId, status: "simulation_only", wouldExecute: simulation.success, quote: serializeQuote(executionQuote) };
    const transaction = await this.dex.executeSwap(prepared);
    const receipt = await this.dex.waitForReceipt(transaction.hash);
    return { tradeId, status: receipt.status, transactionHash: transaction.hash, receipt: { ...receipt, blockNumber: receipt.blockNumber.toString(), gasUsed: receipt.gasUsed.toString(), effectiveGasPrice: receipt.effectiveGasPrice.toString() } };
  }
}

function serializeQuote(quote: Awaited<ReturnType<DexAdapter["getQuote"]>>) {
  return { tokenIn: quote.tokenIn.symbol, tokenOut: quote.tokenOut.symbol, amountIn: formatUnits(quote.amountIn, quote.tokenIn.decimals), expectedAmountOut: formatUnits(quote.expectedAmountOut, quote.tokenOut.decimals), minimumAmountOut: formatUnits(quote.minimumAmountOut, quote.tokenOut.decimals), slippagePercent: quote.slippagePercent, estimatedGas: quote.estimatedGas?.toString(), priceImpactPercent: quote.priceImpactPercent, route: quote.route, quoteTimestamp: quote.quoteTimestamp.toISOString(), expiresAt: quote.expiresAt.toISOString() };
}
