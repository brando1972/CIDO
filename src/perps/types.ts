export type PerpsSide = "long" | "short";
export type PerpsOrderType = "market" | "limit";
export type PerpsOrderStatus = "open" | "filled" | "cancelled";
export type PerpsCloseReason = "manual" | "take_profit" | "stop_loss" | "trailing_stop" | "liquidation" | null;

export interface PerpsMarket {
  symbol: string;
  baseAsset: string;
  quoteAsset: "USD";
  referencePrice: string;
  fundingRate: string;
  nextFundingTime: string | null;
  maxLeverage: string;
  lastUpdated: string | null;
}

export interface PerpsOrderRequest {
  market: string;
  side: PerpsSide;
  sizeUsd: string;
  leverage: string;
  orderType: PerpsOrderType;
  limitPrice?: string | undefined;
  takeProfitPrice?: string | undefined;
  stopLossPrice?: string | undefined;
  trailingStopPercent?: string | undefined;
  reduceOnly: boolean;
}

export interface PerpsPreview extends PerpsOrderRequest {
  referencePrice: string;
  estimatedEntryPrice: string;
  notionalUsd: string;
  initialMarginUsd: string;
  estimatedFeeUsd: string;
  liquidationPrice: string;
  confirmationToken: string;
  expiresAt: string;
}

export interface PerpsOrder extends PerpsOrderRequest {
  id: string;
  status: PerpsOrderStatus;
  fillPrice: string | null;
  createdAt: string;
  updatedAt: string;
  closeReason?: PerpsCloseReason;
}

export interface PerpsPosition {
  market: string;
  side: PerpsSide;
  sizeUsd: string;
  leverage: string;
  entryPrice: string;
  markPrice: string;
  initialMarginUsd: string;
  unrealizedPnl: string;
  liquidationPrice: string;
  takeProfitPrice?: string | undefined;
  stopLossPrice?: string | undefined;
  trailingStopPercent?: string | undefined;
  trailingWatermarkPrice?: string | undefined;
  trailingTriggerPrice?: string | undefined;
  openedAt: string;
  lastUpdated: string;
}

export interface PerpsFeedStatus {
  source: "aster-perps-v2-testnet-public-market-data" | "binance-usdm-public-mark-price";
  status: "initializing" | "live" | "stale" | "error";
  lastUpdated: string | null;
  staleAfterMs: number;
  error: string | null;
}

export interface PerpsAccount {
  mode: "paper";
  currency: "USD";
  balance: string;
  equity: string;
  availableMargin: string;
  usedMargin: string;
  unrealizedPnl: string;
}

export interface PerpsSafetyState {
  killSwitchEnabled: boolean;
  reason: string | null;
  changedAt: string | null;
}
