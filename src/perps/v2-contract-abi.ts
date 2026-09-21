import { parseAbi } from "viem";

/**
 * Verified PancakeSwap / ApolloX Perpetuals V2 Diamond contract address on BNB Smart Chain.
 */
export const PANCAKESWAP_PERPS_V2_BSC_ADDRESS = "0x1b6f2d3844c6ae7d56ceb3c3643b9060ba28feb0" as const;

/**
 * Base asset identifiers on BSC for Perps V2.
 */
export const PERPS_V2_BSC_PAIRS = {
  BTCUSD: "0x7130d2A12B9BCbFAe4f2634d864A1Ee1Ce3Ead9c", // BTCB on BSC
  ETHUSD: "0x2170ed0880ac9a755fd29b2688956bd959f933f8", // ETH on BSC
  BNBUSD: "0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c", // WBNB on BSC
} as const;

/**
 * Default margin collateral token (USDT on BSC).
 */
export const PERPS_V2_BSC_COLLATERAL = {
  USDT: "0x55d398326f99059fF775485246999027B3197955",
} as const;

/**
 * On-chain ABI for PancakeSwap / ApolloX Perps V2 contract functions.
 */
export const perpsV2DiamondAbi = parseAbi([
  // Trade execution
  "function openMarketTrade((address pairBase, bool isLong, address tokenIn, uint96 amountIn, uint80 qty, uint64 price, uint64 stopLoss, uint64 takeProfit, uint24 broker)) external",
  "function openMarketTradeBNB((address pairBase, bool isLong, address tokenIn, uint96 amountIn, uint80 qty, uint64 price, uint64 stopLoss, uint64 takeProfit, uint24 broker)) external payable",
  "function closeTrade(bytes32 tradeHash) external",
  "function batchCloseTrade(bytes32[] tradeHashes) external",
  "function addMargin(bytes32 tradeHash, uint96 margin) external",
  "function updateTradeSl(bytes32 tradeHash, uint64 stopLoss) external",
  "function updateTradeTp(bytes32 tradeHash, uint64 takeProfit) external",
  "function updateTradeTpAndSl(bytes32 tradeHash, uint64 takeProfit, uint64 stopLoss) external",

  // View & checks
  "function openMarketTradeCheck((address pairBase, bool isLong, address tokenIn, uint96 amountIn, uint80 qty, uint64 price, uint64 stopLoss, uint64 takeProfit, uint24 broker)) external view returns (bool, string memory)",
  "function getPositionsV2(address user, address pairBase) external view returns ((bytes32 tradeHash, address user, uint64 openTime, address pairBase, address tokenIn, uint96 amountIn, uint64 openPrice, uint64 closePrice, uint24 broker, bool isLong, uint96 margin, uint96 closeMargin, uint80 qty, uint80 closeQty, uint64 stopLoss, uint64 takeProfit, uint8 state)[])",
  "function getPositionByHashV2(bytes32 tradeHash) external view returns ((bytes32 tradeHash, address user, uint64 openTime, address pairBase, address tokenIn, uint96 amountIn, uint64 openPrice, uint64 closePrice, uint24 broker, bool isLong, uint96 margin, uint96 closeMargin, uint80 qty, uint80 closeQty, uint64 stopLoss, uint64 takeProfit, uint8 state))",
  "function getPendingTrade(bytes32 tradeHash) external view returns ((address user, uint24 broker, bool isLong, uint64 openPrice, address pairBase, uint96 amountIn, address tokenIn, uint80 qty, uint64 stopLoss, uint64 takeProfit, uint128 tradeId))",
  "function pairsV4() external view returns (address[])",
  "function getPairForTrading(address pair) external view returns (string name, uint8 baseDecimals, uint8 quoteDecimals, uint8 pairType, uint8 status)"
]);
