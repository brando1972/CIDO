import { AppError } from "../utils/errors.js";
import { parseDecimal, SCALE } from "./decimal.js";
import type { PerpsMarket, PerpsOrderRequest } from "./types.js";

export function validatePerpsRisk(request: PerpsOrderRequest, market: PerpsMarket, availableMargin: string, maxOrderUsd: string) {
  const size = parseDecimal(request.sizeUsd, "sizeUsd");
  const leverage = parseDecimal(request.leverage, "leverage");
  if (size <= 0n) throw new AppError("sizeUsd must be greater than zero", "INVALID_ORDER_SIZE", 400);
  if (leverage < SCALE || leverage > parseDecimal(market.maxLeverage)) throw new AppError(`leverage must be between 1 and ${market.maxLeverage}`, "LEVERAGE_LIMIT", 400);
  if (size > parseDecimal(maxOrderUsd)) throw new AppError(`sizeUsd exceeds paper order limit of ${maxOrderUsd}`, "ORDER_LIMIT", 400);
  const margin = (size * SCALE) / leverage;
  if (margin > parseDecimal(availableMargin)) throw new AppError("Insufficient paper margin", "INSUFFICIENT_MARGIN", 409);
  if (request.orderType === "limit" && !request.limitPrice) throw new AppError("limitPrice is required for limit orders", "LIMIT_PRICE_REQUIRED", 400);
  if (!request.reduceOnly && !request.stopLossPrice) throw new AppError("stopLossPrice is mandatory for every opening order", "STOP_LOSS_REQUIRED", 400);
  if (request.limitPrice && parseDecimal(request.limitPrice, "limitPrice") <= 0n) throw new AppError("limitPrice must be greater than zero", "INVALID_LIMIT_PRICE", 400);
  const entry = parseDecimal(request.limitPrice ?? market.referencePrice);
  const currentPrice = request.limitPrice ?? market.referencePrice;
  if (request.takeProfitPrice) {
    const takeProfit = parseDecimal(request.takeProfitPrice, "takeProfitPrice");
    if ((request.side === "long" && takeProfit <= entry) || (request.side === "short" && takeProfit >= entry)) {
      throw new AppError(
        request.side === "long"
          ? `Long takeProfitPrice ($${request.takeProfitPrice}) must be above entry price ($${currentPrice})`
          : `Short takeProfitPrice ($${request.takeProfitPrice}) must be below entry price ($${currentPrice})`,
        "INVALID_TAKE_PROFIT",
        400
      );
    }
  }
  if (request.stopLossPrice) {
    const stopLoss = parseDecimal(request.stopLossPrice, "stopLossPrice");
    if (stopLoss <= 0n || (request.side === "long" && stopLoss >= entry) || (request.side === "short" && stopLoss <= entry)) {
      throw new AppError(
        request.side === "long"
          ? `Long stopLossPrice ($${request.stopLossPrice}) must be below current entry price ($${currentPrice})`
          : `Short stopLossPrice ($${request.stopLossPrice}) must be above current entry price ($${currentPrice})`,
        "INVALID_STOP_LOSS",
        400
      );
    }
  }
  if (request.trailingStopPercent) {
    const trailingStop = parseDecimal(request.trailingStopPercent, "trailingStopPercent");
    if (trailingStop <= 0n || trailingStop > 50n * SCALE) throw new AppError("trailingStopPercent must be greater than 0 and no more than 50", "INVALID_TRAILING_STOP", 400);
  }
}
