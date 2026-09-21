import {
  type Address,
  type PublicClient,
  type WalletClient,
  type Hash,
  erc20Abi,
  formatUnits,
  parseUnits
} from "viem";
import { AppError } from "../utils/errors.js";
import {
  PANCAKESWAP_PERPS_V2_BSC_ADDRESS,
  PERPS_V2_BSC_COLLATERAL,
  PERPS_V2_BSC_PAIRS,
  perpsV2DiamondAbi
} from "./v2-contract-abi.js";

export interface V2TradeInput {
  market: "BTCUSD" | "ETHUSD" | "BNBUSD";
  isLong: boolean;
  collateralUsd: string;
  sizeUsd: string;
  entryPrice: string;
  stopLossPrice: string;
  takeProfitPrice?: string | undefined;
}

export interface V2PositionView {
  tradeHash: Hash;
  user: Address;
  market: string;
  isLong: boolean;
  marginUsd: string;
  qty: string;
  openPrice: string;
  stopLoss: string;
  takeProfit: string;
  state: number;
}

export class PerpsV2LiveAdapter {
  constructor(
    private readonly publicClient: PublicClient,
    private readonly walletClient?: WalletClient,
    private readonly walletAddress?: Address,
    private readonly maxOrderUsd = 25,
    private readonly maxLeverage = 3
  ) {}

  /**
   * Verify whether the pair is active on the on-chain contract.
   */
  async checkPairStatus(market: "BTCUSD" | "ETHUSD" | "BNBUSD"): Promise<{ available: boolean; reason?: string }> {
    const pairBase = PERPS_V2_BSC_PAIRS[market];
    try {
      const result = await this.publicClient.readContract({
        address: PANCAKESWAP_PERPS_V2_BSC_ADDRESS,
        abi: perpsV2DiamondAbi,
        functionName: "openMarketTradeCheck",
        args: [{
          pairBase,
          isLong: true,
          tokenIn: PERPS_V2_BSC_COLLATERAL.USDT,
          amountIn: parseUnits("1", 18),
          qty: 1000000000n,
          price: parseUnits("100", 8),
          stopLoss: 0n,
          takeProfit: 0n,
          broker: 0
        }]
      });
      return { available: result[0], reason: result[1] };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      return { available: false, reason: msg };
    }
  }

  /**
   * Reads open positions for a user on BSC directly from the contract.
   */
  async getPositions(userAddress?: Address): Promise<V2PositionView[]> {
    const target = userAddress ?? this.walletAddress;
    if (!target) return [];

    const positions: V2PositionView[] = [];
    for (const [market, pairBase] of Object.entries(PERPS_V2_BSC_PAIRS)) {
      try {
        const rows = await this.publicClient.readContract({
          address: PANCAKESWAP_PERPS_V2_BSC_ADDRESS,
          abi: perpsV2DiamondAbi,
          functionName: "getPositionsV2",
          args: [target, pairBase]
        });

        for (const row of rows) {
          positions.push({
            tradeHash: row.tradeHash,
            user: row.user,
            market,
            isLong: row.isLong,
            marginUsd: formatUnits(row.margin, 18),
            qty: formatUnits(row.qty, 10),
            openPrice: formatUnits(row.openPrice, 8),
            stopLoss: formatUnits(row.stopLoss, 8),
            takeProfit: formatUnits(row.takeProfit, 8),
            state: row.state
          });
        }
      } catch {
        // Continue querying remaining pairs if one fails
      }
    }
    return positions;
  }

  /**
   * Pre-flight safety validations for $50 test wallet.
   */
  validateSafetyEnvelope(input: V2TradeInput) {
    const size = Number(input.sizeUsd);
    const collateral = Number(input.collateralUsd);
    if (!Number.isFinite(size) || size <= 0) throw new AppError("Invalid order size", "INVALID_SIZE", 400);
    if (!Number.isFinite(collateral) || collateral <= 0) throw new AppError("Invalid collateral", "INVALID_COLLATERAL", 400);

    if (size > this.maxOrderUsd) {
      throw new AppError(`Order size \$${size} exceeds the strict \$${this.maxOrderUsd} test safety limit`, "ORDER_SIZE_EXCEEDED", 400);
    }

    const leverage = size / collateral;
    if (leverage > this.maxLeverage) {
      throw new AppError(`Effective leverage ${leverage.toFixed(1)}x exceeds the strict ${this.maxLeverage}x cap`, "LEVERAGE_EXCEEDED", 400);
    }

    const sl = Number(input.stopLossPrice);
    if (!Number.isFinite(sl) || sl <= 0) {
      throw new AppError("A mandatory stop loss price is required on every trade", "MANDATORY_STOP_LOSS", 400);
    }
  }

  /**
   * Executes openMarketTrade on-chain after simulating and checking allowance.
   */
  async openMarketTrade(input: V2TradeInput): Promise<{ txHash: Hash }> {
    if (!this.walletClient || !this.walletAddress) {
      throw new AppError("A funded wallet signer is required to submit live trades", "SIGNER_REQUIRED", 401);
    }

    this.validateSafetyEnvelope(input);

    const pairBase = PERPS_V2_BSC_PAIRS[input.market];
    const tokenIn = PERPS_V2_BSC_COLLATERAL.USDT;
    const amountIn = parseUnits(input.collateralUsd, 18);
    const price = parseUnits(input.entryPrice, 8);
    const stopLoss = parseUnits(input.stopLossPrice, 8);
    const takeProfit = input.takeProfitPrice ? parseUnits(input.takeProfitPrice, 8) : 0n;

    // Calculate qty = (sizeUsd / entryPrice) * 1e10
    const qty = (parseUnits(input.sizeUsd, 18) * 10_000_000_000n) / parseUnits(input.entryPrice, 18);

    // 1. Check pair availability
    const status = await this.checkPairStatus(input.market);
    if (!status.available) {
      throw new AppError(`PancakeSwap Perps V2 contract rejected pair ${input.market}: ${status.reason || "Pair unavailable for trading"}`, "PAIR_UNAVAILABLE", 400);
    }

    // 2. Check token allowance
    const allowance = await this.publicClient.readContract({
      address: tokenIn,
      abi: erc20Abi,
      functionName: "allowance",
      args: [this.walletAddress, PANCAKESWAP_PERPS_V2_BSC_ADDRESS]
    });

    if (allowance < amountIn) {
      // Approve exact collateral amount
      await this.walletClient.writeContract({
        address: tokenIn,
        abi: erc20Abi,
        functionName: "approve",
        args: [PANCAKESWAP_PERPS_V2_BSC_ADDRESS, amountIn],
        account: this.walletAddress,
        chain: this.walletClient.chain
      });
    }

    // 3. Simulate trade execution
    const args = [{
      pairBase,
      isLong: input.isLong,
      tokenIn,
      amountIn,
      qty,
      price,
      stopLoss,
      takeProfit,
      broker: 0
    }] as const;

    await this.publicClient.simulateContract({
      address: PANCAKESWAP_PERPS_V2_BSC_ADDRESS,
      abi: perpsV2DiamondAbi,
      functionName: "openMarketTrade",
      args,
      account: this.walletAddress
    });

    // 4. Broadcast transaction
    const txHash = await this.walletClient.writeContract({
      address: PANCAKESWAP_PERPS_V2_BSC_ADDRESS,
      abi: perpsV2DiamondAbi,
      functionName: "openMarketTrade",
      args,
      account: this.walletAddress,
      chain: this.walletClient.chain
    });

    return { txHash };
  }

  /**
   * Executes closeTrade on-chain.
   */
  async closeTrade(tradeHash: Hash): Promise<{ txHash: Hash }> {
    if (!this.walletClient || !this.walletAddress) {
      throw new AppError("A funded wallet signer is required to close live trades", "SIGNER_REQUIRED", 401);
    }

    await this.publicClient.simulateContract({
      address: PANCAKESWAP_PERPS_V2_BSC_ADDRESS,
      abi: perpsV2DiamondAbi,
      functionName: "closeTrade",
      args: [tradeHash],
      account: this.walletAddress
    });

    const txHash = await this.walletClient.writeContract({
      address: PANCAKESWAP_PERPS_V2_BSC_ADDRESS,
      abi: perpsV2DiamondAbi,
      functionName: "closeTrade",
      args: [tradeHash],
      account: this.walletAddress,
      chain: this.walletClient.chain
    });

    return { txHash };
  }
}
