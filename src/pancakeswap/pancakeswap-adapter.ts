import { erc20Abi, type Address, type Hash, type PublicClient, type WalletClient } from "viem";
import type { ApprovalRequest, AllowanceRequest, AllowanceResult, DexAdapter, SwapRequest } from "./adapter.js";
import type { PreparedSwap, QuoteRequest, QuoteResult, ReceiptResult, SimulationResult, TransactionResult } from "../types/index.js";
import { AllowanceError, LiveTradingDisabledError, QuoteExpiredError, QuoteUnavailableError, RpcError, WrongChainError } from "../utils/errors.js";
import { PancakeRouteProvider, type ExactInputTrade, type RouteProvider } from "./route.js";
import { PancakeQuoteService } from "./quote.js";
import { approveExactAmount } from "./approval.js";
import { simulateRawSwap } from "./simulation.js";
import { buildSwapCalldata, officialRouterAddress, sendPreparedSwap } from "./swap.js";
import { waitForReceipt as waitForChainReceipt } from "../blockchain/receipts.js";

export interface PancakeSwapAdapterOptions {
  publicClient: PublicClient;
  walletClient?: WalletClient;
  walletAddress?: Address;
  chainId: 56 | 97;
  liveTradingEnabled?: boolean;
  quoteTtlSeconds?: number;
  routeProvider?: RouteProvider;
}

export class PancakeSwapAdapter implements DexAdapter {
  readonly routerAddress: Address;
  readonly spender: Address;
  private readonly quoteService: PancakeQuoteService;
  private readonly trades = new WeakMap<QuoteResult, ExactInputTrade>();
  private readonly liveTradingEnabled: boolean;

  constructor(private readonly options: PancakeSwapAdapterOptions) {
    this.routerAddress = officialRouterAddress(options.chainId);
    this.spender = this.routerAddress;
    this.liveTradingEnabled = options.liveTradingEnabled ?? false;
    this.quoteService = new PancakeQuoteService(options.routeProvider ?? new PancakeRouteProvider(options.publicClient), options.quoteTtlSeconds ?? 30);
  }

  async getQuote(params: QuoteRequest): Promise<QuoteResult> {
    await this.checkExpectedChain();
    if (params.tokenIn.chainId !== this.options.chainId || params.tokenOut.chainId !== this.options.chainId) throw new WrongChainError(this.options.chainId, params.tokenIn.chainId);
    const { quote, trade } = await this.quoteService.getQuote(params);
    this.trades.set(quote, trade);
    return quote;
  }

  async checkAllowance(params: AllowanceRequest): Promise<AllowanceResult> {
    this.assertRouter(params.spender);
    try {
      const current = await this.options.publicClient.readContract({ address: params.token, abi: erc20Abi, functionName: "allowance", args: [params.owner, params.spender] });
      return { current, required: params.amount, sufficient: current >= params.amount };
    } catch (error) {
      throw new AllowanceError(error instanceof Error ? error.message : "Allowance lookup failed");
    }
  }

  async approveToken(params: ApprovalRequest): Promise<TransactionResult> {
    this.requireExecution(); this.assertRouter(params.spender); await this.checkExpectedChain();
    return approveExactAmount({ publicClient: this.options.publicClient, walletClient: this.options.walletClient!, owner: this.options.walletAddress!, token: params.token, spender: params.spender, amount: params.amount, expectedChainId: this.options.chainId });
  }

  async buildSwap(params: SwapRequest): Promise<PreparedSwap> {
    if (params.quote.expiresAt.getTime() <= Date.now()) throw new QuoteExpiredError();
    if (params.recipient.toLowerCase() !== this.options.walletAddress?.toLowerCase()) throw new RpcError("Swap recipient must be the configured trading wallet");
    const trade = this.trades.get(params.quote);
    if (!trade) throw new QuoteUnavailableError("Quote was not created by this adapter instance");
    return buildSwapCalldata(trade, params.quote, params.recipient);
  }

  async simulateSwap(params: PreparedSwap): Promise<SimulationResult> {
    this.assertRouter(params.to); await this.checkExpectedChain();
    if (!this.options.walletAddress) throw new RpcError("A wallet address is required for simulation");
    return simulateRawSwap(this.options.publicClient, this.options.walletAddress, params);
  }

  async executeSwap(params: PreparedSwap): Promise<TransactionResult> {
    this.requireExecution(); this.assertRouter(params.to); await this.checkExpectedChain();
    await this.simulateSwap(params);
    return sendPreparedSwap(this.options.walletClient!, this.options.walletAddress!, this.routerAddress, params);
  }

  async waitForReceipt(hash: Hash): Promise<ReceiptResult> { return waitForChainReceipt(this.options.publicClient, hash); }

  private async checkExpectedChain(): Promise<void> {
    const actual = await this.options.publicClient.getChainId();
    if (actual !== this.options.chainId) throw new WrongChainError(this.options.chainId, actual);
  }
  private assertRouter(address: Address): void {
    if (address.toLowerCase() !== this.routerAddress.toLowerCase()) throw new RpcError("Refused unexpected PancakeSwap spender/target");
  }
  private requireExecution(): void {
    if (!this.liveTradingEnabled) throw new LiveTradingDisabledError();
    if (!this.options.walletClient || !this.options.walletAddress) throw new RpcError("Wallet client is not configured");
  }
}
