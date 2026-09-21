const baseUrl = process.env.TRADER_API_URL ?? "http://127.0.0.1:3001";
if (process.env.ENABLE_LIVE_TRADING !== "true") throw new Error("Round-trip test refused: ENABLE_LIVE_TRADING is not explicitly true in this shell");
const amount = process.env.ROUND_TRIP_USDT ?? "5";

async function request(path: string, init?: RequestInit) {
  const response = await fetch(`${baseUrl}${path}`, init);
  const body = await response.json() as Record<string, unknown>;
  if (!response.ok) throw new Error(`${path} failed: ${JSON.stringify(body)}`);
  return body;
}
const json = (body: unknown): RequestInit => ({ method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });

const before = await request("/balance");
console.log("PANCAKESWAP ROUND-TRIP TEST");
console.log("BUY QUOTE", await request("/quote", json({ tokenIn: "USDT", tokenOut: "CAKE", amountIn: amount, slippagePercent: 0.5 })));
const buy = await request("/trade/buy", json({ token: "CAKE", quoteToken: "USDT", amount, maxSlippagePercent: 0.5 }));
if (buy.status !== "confirmed") throw new Error(`Buy was not confirmed: ${JSON.stringify(buy)}`);
const afterBuy = await request("/balance");
const beforeCake = (((before.balances as Array<{symbol:string;amount:string}> | undefined) ?? []).find((item) => item.symbol === "CAKE")?.amount) ?? "0";
const afterCake = (((afterBuy.balances as Array<{symbol:string;amount:string}> | undefined) ?? []).find((item) => item.symbol === "CAKE")?.amount) ?? "0";
const acquired = (Number(afterCake) - Number(beforeCake)).toFixed(18).replace(/0+$/, "").replace(/\.$/, "");
if (!(Number(acquired) > 0)) throw new Error("CAKE balance did not increase after buy");
console.log("SELL QUOTE", await request("/quote", json({ tokenIn: "CAKE", tokenOut: "USDT", amountIn: acquired, slippagePercent: 0.5 })));
const sell = await request("/trade/sell", json({ token: "CAKE", quoteToken: "USDT", amount: acquired, maxSlippagePercent: 0.5 }));
if (sell.status !== "confirmed") throw new Error(`Sell was not confirmed: ${JSON.stringify(sell)}`);
console.log(JSON.stringify({ startingBalances: before, buy, sell, endingBalances: await request("/balance") }, null, 2));
