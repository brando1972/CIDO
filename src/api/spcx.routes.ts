import type { FastifyInstance } from "fastify";

type YahooChart = { chart?: { result?: Array<{ timestamp?: number[]; indicators?: { quote?: Array<{ close?: Array<number | null> }> } }> ; error?: unknown } };

const IPO_DATE = "2026-06-12";
const EVENTS = [
  { date: IPO_DATE, label: "IPO / public trading", release: "Public float begins", status: "actual" },
  { date: "2026-08-06", label: "Q2 earnings release", release: "20% of eligible locked shares", status: "actual" },
  { date: "2026-08-20", label: "Day 70 tranche", release: "About 7% eligible", status: "actual" },
  { date: "2026-09-09", label: "Day 90 tranche", release: "About 7% eligible", status: "scheduled" },
  { date: "2026-09-24", label: "Day 105 tranche", release: "About 7% eligible", status: "scheduled" },
  { date: "2026-10-09", label: "Day 120 tranche", release: "About 7% eligible", status: "scheduled" },
  { date: "2026-10-24", label: "Day 135 tranche", release: "About 7% eligible", status: "scheduled" },
  { date: "2026-12-08", label: "Day 180 expiry", release: "Remaining standard lock-up", status: "scheduled" }
] as const;

function date(ts: number) { return new Date(ts * 1_000).toISOString().slice(0, 10); }
async function history(symbol: string) {
  const start = Math.floor(Date.parse(`${IPO_DATE}T00:00:00Z`) / 1_000);
  const end = Math.floor(Date.now() / 1_000) + 86_400;
  const url = new URL(`/v8/finance/chart/${symbol}`, "https://query2.finance.yahoo.com");
  url.searchParams.set("period1", String(start)); url.searchParams.set("period2", String(end)); url.searchParams.set("interval", "1d"); url.searchParams.set("events", "history");
  const response = await fetch(url, { headers: { "user-agent": "Mozilla/5.0" }, signal: AbortSignal.timeout(8_000) });
  if (!response.ok) throw new Error(`Historical data provider returned HTTP ${response.status}`);
  const payload = await response.json() as YahooChart; const result = payload.chart?.result?.[0];
  const timestamps = result?.timestamp ?? [], closes = result?.indicators?.quote?.[0]?.close ?? [];
  return timestamps.flatMap((ts, index) => typeof closes[index] === "number" ? [{ date: date(ts), close: closes[index]! }] : []);
}

export function registerSpcxRoutes(app: FastifyInstance) {
  app.get("/api/research/spcx-btc", async (_request, reply) => {
    try {
      const [spcx, btc] = await Promise.all([history("SPCX"), history("BTC-USD")]);
      const btcByDate = new Map(btc.map((point) => [point.date, point.close]));
      const paired = spcx.flatMap((point) => { const btcClose = btcByDate.get(point.date); return btcClose ? [{ date: point.date, spcxClose: point.close, btcClose }] : []; });
      const base = paired[0]; if (!base) throw new Error("No overlapping SPCX/BTC history was returned");
      const points = paired.map((point) => ({ ...point, spcxIndexed: point.spcxClose / base.spcxClose * 100, btcIndexed: point.btcClose / base.btcClose * 100 }));
      const eventPoints = EVENTS.map((event) => ({ ...event, point: points.find((point) => point.date >= event.date) ?? null }));
      return reply.header("Cache-Control", "public, max-age=900").send({ baseDate: base.date, baseSpcx: base.spcxClose, baseBtc: base.btcClose, points, events: eventPoints, methodology: "Daily closes indexed to 100 on SPCX's first public trading date. Unlock dates indicate eligibility to sell, not actual sales." });
    } catch (error) {
      return reply.status(503).send({ error: { code: "RESEARCH_DATA_UNAVAILABLE", message: error instanceof Error ? error.message : "Historical comparison unavailable" } });
    }
  });
}
