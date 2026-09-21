export class AppError extends Error {
  constructor(message: string, readonly code: string, readonly statusCode: number, readonly details?: unknown) { super(message); }
}
export class UnsupportedTokenError extends AppError { constructor(token: string, chainId: number) { super(`Token ${token} is not approved on chain ${chainId}`, "UNSUPPORTED_TOKEN", 400); } }
export class InsufficientBalanceError extends AppError { constructor() { super("Insufficient token balance", "INSUFFICIENT_BALANCE", 400); } }
export class TradeLimitExceededError extends AppError { constructor(max: number) { super(`Trade exceeds the configured $${max} limit`, "TRADE_LIMIT_EXCEEDED", 400); } }
export class SlippageExceededError extends AppError { constructor(max: number) { super(`Requested slippage exceeds ${max}%`, "SLIPPAGE_EXCEEDED", 400); } }
export class PriceImpactExceededError extends AppError { constructor(max: number) { super(`Quote price impact exceeds ${max}%`, "PRICE_IMPACT_EXCEEDED", 400); } }
export class QuoteUnavailableError extends AppError { constructor(message = "A usable quote is unavailable") { super(message, "QUOTE_UNAVAILABLE", 503); } }
export class QuoteExpiredError extends AppError { constructor() { super("Quote has expired", "QUOTE_EXPIRED", 409); } }
export class AllowanceError extends AppError { constructor(message: string) { super(message, "ALLOWANCE_ERROR", 502); } }
export class SimulationError extends AppError { constructor(message: string, details?: unknown) { super(message, "SIMULATION_FAILED", 422, details); } }
export class RpcError extends AppError { constructor(message: string, details?: unknown) { super(message, "RPC_ERROR", 503, details); } }
export class WrongChainError extends AppError { constructor(expected: number, actual: number) { super(`Wrong chain: expected ${expected}, received ${actual}`, "WRONG_CHAIN", 503); } }
export class TransactionRevertedError extends AppError { constructor() { super("Transaction reverted", "TRANSACTION_REVERTED", 422); } }
export class LiveTradingDisabledError extends AppError { constructor() { super("Live trading is disabled", "LIVE_TRADING_DISABLED", 403); } }
export class IntegrationUnavailableError extends AppError { constructor() { super("PancakeSwap integration is not configured", "DEX_INTEGRATION_UNAVAILABLE", 503); } }
