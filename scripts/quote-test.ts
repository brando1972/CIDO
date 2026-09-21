const baseUrl = process.env.TRADER_API_URL ?? "http://127.0.0.1:3001";
const response = await fetch(`${baseUrl}/quote`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ tokenIn: "USDT", tokenOut: "CAKE", amountIn: process.env.QUOTE_AMOUNT ?? "0.1", slippagePercent: 0.5 }),
});
console.log(await response.text());
if (!response.ok) process.exitCode = 1;
