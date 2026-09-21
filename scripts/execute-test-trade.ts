import { fetch } from "undici";

interface TradeOptions {
  symbol?: string;
  side?: "long" | "short";
  sizeUsd?: string;
  leverage?: string;
  stopLossPercent?: number; // e.g. 5% below entry for long
}

export async function executeTestTrade(options: TradeOptions = {}) {
  const symbol = options.symbol || "BTCUSD";
  const side = options.side || "long";
  const sizeUsd = options.sizeUsd || "1.00";
  const leverage = options.leverage || "3";
  const stopLossPercent = options.stopLossPercent ?? 0.05; // 5%

  const baseUrl = "http://localhost:3001";

  console.log(`\n--- Automating Test Trade ---`);
  console.log(`Market: ${symbol} | Side: ${side.toUpperCase()} | Size: $${sizeUsd} | Leverage: ${leverage}x`);

  // 1. Fetch current ticker price
  const tickerRes = await fetch(`${baseUrl}/api/perps/ticker`);
  if (!tickerRes.ok) throw new Error(`Failed to fetch ticker: ${await tickerRes.text()}`);
  const tickerData = (await tickerRes.json()) as any;
  const market = tickerData.markets?.find((m: any) => m.symbol === symbol);
  if (!market) throw new Error(`Market ${symbol} not found in ticker`);

  const currentPrice = parseFloat(market.referencePrice);
  console.log(`Current ${symbol} Mark Price: $${currentPrice.toFixed(2)}`);

  // 2. Calculate safe stop-loss price
  const stopLossPrice = side === "long"
    ? (currentPrice * (1 - stopLossPercent)).toFixed(2)
    : (currentPrice * (1 + stopLossPercent)).toFixed(2);
  console.log(`Setting mandatory Stop-Loss at: $${stopLossPrice} (-${stopLossPercent * 100}%)`);

  // 3. Request preview
  const previewPayload = {
    market: symbol,
    side,
    sizeUsd,
    leverage,
    orderType: "market",
    stopLossPrice,
  };

  const previewRes = await fetch(`${baseUrl}/api/perps/orders/preview`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(previewPayload),
  });

  if (!previewRes.ok) throw new Error(`Preview failed: ${await previewRes.text()}`);
  const { preview } = (await previewRes.json()) as any;
  console.log(`Preview accepted. Initial Margin: $${preview.initialMarginUsd}, Estimated Liq Price: $${preview.liquidationPrice}`);

  // 4. Submit order with confirmation token
  const orderRes = await fetch(`${baseUrl}/api/perps/orders`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      ...previewPayload,
      confirmationToken: preview.confirmationToken,
    }),
  });

  if (!orderRes.ok) throw new Error(`Order placement failed: ${await orderRes.text()}`);
  const orderResult = (await orderRes.json()) as any;
  console.log(`Order status: ${orderResult.order.status.toUpperCase()} (ID: ${orderResult.order.id})`);
  console.log(`Position opened: ${JSON.stringify(orderResult.position, null, 2)}`);
  console.log(`Updated Account Equity: $${orderResult.account.equity}, Available Margin: $${orderResult.account.availableMargin}`);
  console.log(`\nView trade live in the dashboard at http://localhost:3001/perps\n`);
  return orderResult;
}

if (process.argv[1]?.endsWith("execute-test-trade.ts")) {
  executeTestTrade().catch((err) => {
    console.error("Test trade error:", err);
    process.exit(1);
  });
}
