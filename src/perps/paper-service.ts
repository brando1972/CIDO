import { createHash, randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { AppError } from "../utils/errors.js";
import type { AppConfig } from "../config/env.js";
import { div, formatDecimal, mul, parseDecimal, SCALE } from "./decimal.js";
import { AsterPerpsV2TestnetMarkPriceProvider, BinanceUsdMMarkPriceProvider, type MarkPriceProvider, type MarkPriceTick } from "./mark-price-provider.js";
import { validatePerpsRisk } from "./risk.js";
import type { PerpsAccount, PerpsCloseReason, PerpsFeedStatus, PerpsMarket, PerpsOrder, PerpsOrderRequest, PerpsPosition, PerpsPreview, PerpsSafetyState } from "./types.js";

import type { DatabaseRepository } from "../db/supabase.js";
import type { CidoDatabaseRepository } from "../db/db.js";

const FEE_RATE = 50_000n, MAINTENANCE_RATE = 50_000n, PREVIEW_TTL_MS = 30_000;
const referenceMarkets = (max: number): PerpsMarket[] => [
  { symbol: "BTCUSD", baseAsset: "BTC", quoteAsset: "USD", referencePrice: "60000", fundingRate: "0", nextFundingTime: null, maxLeverage: String(max), lastUpdated: null },
  { symbol: "ETHUSD", baseAsset: "ETH", quoteAsset: "USD", referencePrice: "2500", fundingRate: "0", nextFundingTime: null, maxLeverage: String(max), lastUpdated: null },
  { symbol: "BNBUSD", baseAsset: "BNB", quoteAsset: "USD", referencePrice: "600", fundingRate: "0", nextFundingTime: null, maxLeverage: String(max), lastUpdated: null }
];
export interface PaperPerpsDependencies { now?: () => number; provider?: MarkPriceProvider; stateFilePath?: string; db?: DatabaseRepository | CidoDatabaseRepository; }

export class PaperPerpsService {
  readonly mode = "paper" as const;
  readonly dataSource: MarkPriceProvider["source"];
  private balance: bigint;
  private readonly markets: PerpsMarket[];
  private readonly orders = new Map<string, PerpsOrder>();
  private readonly positions = new Map<string, PerpsPosition>();
  private readonly previews = new Map<string, { requestHash: string; expiresAt: number }>();
  private readonly now: () => number; private readonly provider: MarkPriceProvider;
  private readonly stateFilePath: string | undefined;
  private readonly db: DatabaseRepository | CidoDatabaseRepository | undefined;
  private pollTimer: NodeJS.Timeout | undefined; private refreshInFlight: Promise<void> | undefined;
  private feedLastUpdated: number | null = null; private feedError: string | null = null;
  private safety: PerpsSafetyState = { killSwitchEnabled: false, reason: null, changedAt: null };

  constructor(private readonly config: AppConfig, clockOrDeps: (() => number) | PaperPerpsDependencies = {}) {
    if (config.PERPS_MODE !== "paper" || config.ENABLE_LIVE_PERPS) throw new AppError("Live perpetuals execution is not implemented or permitted", "LIVE_PERPS_DISABLED", 503);
    const deps = typeof clockOrDeps === "function" ? { now: clockOrDeps } : clockOrDeps;
    this.now = deps.now ?? Date.now;
    this.stateFilePath = deps.stateFilePath;
    this.db = deps.db;
    const defaultProvider = config.PERPS_MARK_PROVIDER === "aster-testnet"
      ? new AsterPerpsV2TestnetMarkPriceProvider(config.PERPS_MARK_PRICE_URL)
      : new BinanceUsdMMarkPriceProvider(config.PERPS_MARK_PRICE_URL);
    this.provider = deps.provider ?? defaultProvider;
    this.dataSource = this.provider.source;
    this.balance = parseDecimal(config.PERPS_INITIAL_BALANCE_USD); this.markets = referenceMarkets(config.PERPS_MAX_LEVERAGE);
    this.loadSavedState();
  }
  private loadSavedState() {
    if (!this.stateFilePath || !existsSync(this.stateFilePath)) return;
    try {
      const raw = JSON.parse(readFileSync(this.stateFilePath, "utf8"));
      if (raw.balance) this.balance = parseDecimal(raw.balance);
      if (Array.isArray(raw.orders)) { for (const o of raw.orders) this.orders.set(o.id, o); }
      if (Array.isArray(raw.positions)) { for (const p of raw.positions) this.positions.set(p.market, p); }
    } catch { /* ignore corrupted state */ }
  }
  private saveState() {
    if (this.stateFilePath) {
      try {
        const dir = dirname(this.stateFilePath);
        if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
        const payload = { balance: formatDecimal(this.balance), orders: [...this.orders.values()], positions: [...this.positions.values()] };
        writeFileSync(this.stateFilePath, JSON.stringify(payload, null, 2), "utf8");
      } catch { /* ignore write failure */ }
    }
    if (this.db) {
      for (const o of this.orders.values()) {
        void this.db.saveOrder({
          id: o.id,
          market: o.market,
          side: o.side,
          size_usd: o.sizeUsd,
          leverage: o.leverage,
          order_type: o.orderType,
          status: o.status,
          fill_price: o.fillPrice ?? null,
          stop_loss_price: o.stopLossPrice ?? null,
          take_profit_price: o.takeProfitPrice ?? null,
          trailing_stop_percent: o.trailingStopPercent ?? null,
          is_live: false,
          close_reason: o.closeReason ?? null,
          created_at: o.createdAt,
        });
      }
      for (const p of this.positions.values()) {
        void this.db.savePosition({
          market: p.market,
          side: p.side,
          size_usd: p.sizeUsd,
          leverage: p.leverage,
          entry_price: p.entryPrice,
          mark_price: p.markPrice,
          initial_margin_usd: p.initialMarginUsd,
          liquidation_price: p.liquidationPrice,
          unrealized_pnl: p.unrealizedPnl,
          stop_loss_price: p.stopLossPrice ?? null,
          take_profit_price: p.takeProfitPrice ?? null,
          trailing_stop_percent: p.trailingStopPercent ?? null,
          is_live: false,
          status: "open",
          opened_at: p.openedAt,
          last_updated: p.lastUpdated,
        });
      }
    }
  }
  async hydrateFromDb(): Promise<void> {
    if (!this.db) return;
    try {
      const openPositions = await this.db.getOpenPositions();
      for (const p of openPositions) {
        this.positions.set(p.market, {
          market: p.market,
          side: p.side,
          sizeUsd: p.size_usd,
          leverage: p.leverage,
          entryPrice: p.entry_price,
          markPrice: p.mark_price,
          initialMarginUsd: p.initial_margin_usd,
          unrealizedPnl: p.unrealized_pnl,
          liquidationPrice: p.liquidation_price,
          ...(p.stop_loss_price ? { stopLossPrice: p.stop_loss_price } : {}),
          ...(p.take_profit_price ? { takeProfitPrice: p.take_profit_price } : {}),
          ...(p.trailing_stop_percent ? { trailingStopPercent: p.trailing_stop_percent } : {}),
          openedAt: p.opened_at ?? new Date(this.now()).toISOString(),
          lastUpdated: p.last_updated ?? new Date(this.now()).toISOString(),
        });
      }
      const recentOrders = await this.db.getRecentOrders();
      for (const o of recentOrders) {
        this.orders.set(o.id, {
          id: o.id,
          market: o.market,
          side: o.side,
          sizeUsd: o.size_usd,
          leverage: o.leverage,
          orderType: o.order_type,
          status: o.status as any,
          reduceOnly: Boolean(o.close_reason),
          fillPrice: o.fill_price ?? null,
          ...(o.stop_loss_price ? { stopLossPrice: o.stop_loss_price } : {}),
          ...(o.take_profit_price ? { takeProfitPrice: o.take_profit_price } : {}),
          ...(o.trailing_stop_percent ? { trailingStopPercent: o.trailing_stop_percent } : {}),
          closeReason: (o.close_reason as any) ?? null,
          createdAt: o.created_at ?? new Date(this.now()).toISOString(),
          updatedAt: o.created_at ?? new Date(this.now()).toISOString(),
        });
      }
    } catch (err) {
      console.warn("PaperPerpsService: error hydrating from DB", err);
    }
  }

  async ensureFreshMarks(): Promise<void> {
    if (this.config.NODE_ENV === "test") return;
    const age = this.feedLastUpdated === null ? Infinity : this.now() - this.feedLastUpdated;
    if (age > this.config.PERPS_MARK_POLL_MS) {
      await this.refreshMarks();
    }
  }

  start() { if (!this.pollTimer) { void this.refreshMarks(); this.pollTimer = setInterval(() => void this.refreshMarks(), this.config.PERPS_MARK_POLL_MS); this.pollTimer.unref(); } }
  stop() { if (this.pollTimer) clearInterval(this.pollTimer); this.pollTimer = undefined; }
  async refreshMarks() { if (this.refreshInFlight) return this.refreshInFlight; this.refreshInFlight = this.fetchMarks().finally(() => { this.refreshInFlight = undefined; }); return this.refreshInFlight; }
  private async fetchMarks() { try { this.applyMarkPrices(await this.provider.getMarkPrices(this.markets.map(m => m.symbol))); this.feedError = null; } catch (e) { this.feedError = e instanceof Error ? e.message : "Unknown mark-price provider error"; } }
  applyMarkPrices(ticks: readonly MarkPriceTick[]) { for (const tick of ticks) { const m = this.markets.find(x => x.symbol === tick.symbol.toUpperCase()); if (!m) continue; m.referencePrice = formatDecimal(parseDecimal(tick.price)); if (tick.fundingRate !== undefined) m.fundingRate = fmt(signed(tick.fundingRate)); if (tick.nextFundingTime !== undefined) m.nextFundingTime = new Date(tick.nextFundingTime).toISOString(); m.lastUpdated = new Date(tick.timestamp).toISOString(); this.feedLastUpdated = Math.max(this.feedLastUpdated ?? 0, tick.timestamp); this.processMarket(m, tick.timestamp); } }
  getFeedStatus(): PerpsFeedStatus { const age = this.feedLastUpdated === null ? Infinity : this.now() - this.feedLastUpdated; const status = this.feedLastUpdated === null ? (this.feedError ? "error" : "initializing") : age > this.config.PERPS_MARK_STALE_MS ? "stale" : "live"; return { source: this.dataSource, status, lastUpdated: this.feedLastUpdated === null ? null : new Date(this.feedLastUpdated).toISOString(), staleAfterMs: this.config.PERPS_MARK_STALE_MS, error: this.feedError }; }
  getTicker() { return { mode: this.mode, feed: this.getFeedStatus(), markets: this.listMarkets() }; }
  getSafetyState() { return { ...this.safety }; }
  setKillSwitch(enabled: boolean, reason?: string) { this.safety = { killSwitchEnabled: enabled, reason: enabled ? (reason?.trim() || "operator") : null, changedAt: new Date(this.now()).toISOString() }; return this.getSafetyState(); }
  listMarkets() { return this.markets.map(m => ({ ...m })); }
  listOrders() { return [...this.orders.values()].map(o => ({ ...o })); }
  listPositions() { return [...this.positions.values()].map(p => ({ ...p })); }
  getAccount(): PerpsAccount { let used=0n,pnl=0n; for(const p of this.positions.values()){used+=parseDecimal(p.initialMarginUsd);pnl+=signed(p.unrealizedPnl);} const equity=this.balance+pnl; return {mode:"paper",currency:"USD",balance:formatDecimal(this.balance),equity:fmt(equity),availableMargin:fmt(equity-used),usedMargin:formatDecimal(used),unrealizedPnl:fmt(pnl)}; }

  preview(input: PerpsOrderRequest): PerpsPreview { if(this.safety.killSwitchEnabled)throw new AppError("Perpetuals kill switch is enabled","PERPS_KILL_SWITCH",423); const r=normalize(input),m=this.market(r.market); validatePerpsRisk(r,m,this.getAccount().availableMargin,this.config.PERPS_MAX_ORDER_USD); const price=r.limitPrice??m.referencePrice,size=parseDecimal(r.sizeUsd),lev=parseDecimal(r.leverage),entry=parseDecimal(price),margin=div(size,lev),fee=mul(size,FEE_RATE),move=div(SCALE,lev)-MAINTENANCE_RATE,liq=r.side==="long"?mul(entry,SCALE-move):mul(entry,SCALE+move),expiry=this.now()+PREVIEW_TTL_MS,token=randomUUID(); this.previews.set(token,{requestHash:hash(r),expiresAt:expiry}); return {...r,referencePrice:m.referencePrice,estimatedEntryPrice:price,notionalUsd:formatDecimal(size),initialMarginUsd:formatDecimal(margin),estimatedFeeUsd:formatDecimal(fee),liquidationPrice:formatDecimal(liq<0n?0n:liq),confirmationToken:token,expiresAt:new Date(expiry).toISOString()}; }
  place(input: PerpsOrderRequest, token: string) { const r=normalize(input),c=this.previews.get(token); if(!c||c.expiresAt<this.now()||c.requestHash!==hash(r))throw new AppError("Preview confirmation is missing, expired, or does not match the order","INVALID_CONFIRMATION",409); this.previews.delete(token); if(r.reduceOnly)throw new AppError("Use the paper position close endpoint for reduce-only orders","REDUCE_ONLY_ROUTE",400); const preview=this.preview(r);this.previews.delete(preview.confirmationToken); const ts=this.now(),at=new Date(ts).toISOString(),m=this.market(r.market),filled=r.orderType==="market"||crossed(r,m.referencePrice); if(filled&&this.positions.has(r.market))throw new AppError("Close the existing paper position before opening another in this market","POSITION_EXISTS",409); const fill=filled?(r.orderType==="market"?m.referencePrice:r.limitPrice!):null,o:PerpsOrder={id:randomUUID(),...r,status:filled?"filled":"open",fillPrice:fill,createdAt:at,updatedAt:at};this.orders.set(o.id,o);const p=filled?this.open(o,fill!,ts):null;this.saveState();return{order:{...o},position:p?{...p}:null,account:this.getAccount()}; }
  cancel(id:string){const o=this.orders.get(id);if(!o)throw new AppError("Paper order not found","ORDER_NOT_FOUND",404);if(o.status!=="open")throw new AppError("Only open paper orders can be cancelled","ORDER_NOT_OPEN",409);o.status="cancelled";o.updatedAt=new Date(this.now()).toISOString();this.saveState();return{...o};}
  close(symbol:string,percentage="100"){return this.closePosition(symbol.toUpperCase(),percentage,"manual",this.now());}
  emergencyCloseAll(reason="operator emergency close") { this.setKillSwitch(true, reason); const results=[]; for(const symbol of [...this.positions.keys()])results.push(this.closePosition(symbol,"100","manual",this.now())); for(const order of this.orders.values()){if(order.status==="open"){order.status="cancelled";order.updatedAt=new Date(this.now()).toISOString();}} this.saveState(); return { safety:this.getSafetyState(), closedPositions:results.length, account:this.getAccount() }; }

  private processMarket(m:PerpsMarket,ts:number){if(!this.positions.has(m.symbol)){const o=[...this.orders.values()].filter(x=>x.market===m.symbol&&x.status==="open").sort((a,b)=>a.createdAt.localeCompare(b.createdAt)).find(x=>crossed(x,m.referencePrice));if(o){o.status="filled";o.fillPrice=o.limitPrice!;o.updatedAt=new Date(ts).toISOString();this.open(o,o.fillPrice,ts);this.saveState();}}const p=this.positions.get(m.symbol);if(!p)return;p.markPrice=m.referencePrice;p.lastUpdated=new Date(ts).toISOString();p.unrealizedPnl=pnl(p);const mark=parseDecimal(p.markPrice);ratchetTrailingStop(p,mark);const reason:PerpsCloseReason=liquidated(p,mark)?"liquidation":trigger(p,mark);if(reason)this.closePosition(p.market,"100",reason,ts);}
  private open(o:PerpsOrder,fill:string,ts:number){const size=parseDecimal(o.sizeUsd),lev=parseDecimal(o.leverage),margin=div(size,lev),fee=mul(size,FEE_RATE),move=div(SCALE,lev)-MAINTENANCE_RATE,entry=parseDecimal(fill),liq=o.side==="long"?mul(entry,SCALE-move):mul(entry,SCALE+move),at=new Date(ts).toISOString();this.balance-=fee;const p:PerpsPosition={market:o.market,side:o.side,sizeUsd:formatDecimal(size),leverage:o.leverage,entryPrice:fill,markPrice:this.market(o.market).referencePrice,initialMarginUsd:formatDecimal(margin),unrealizedPnl:"0",liquidationPrice:formatDecimal(liq<0n?0n:liq),takeProfitPrice:o.takeProfitPrice,stopLossPrice:o.stopLossPrice,trailingStopPercent:o.trailingStopPercent,openedAt:at,lastUpdated:at};if(o.trailingStopPercent){p.trailingWatermarkPrice=fill;p.trailingTriggerPrice=trailingTriggerPrice(p,parseDecimal(fill));}p.unrealizedPnl=pnl(p);this.positions.set(p.market,p);this.saveState();return p;}
  private closePosition(symbol:string,percentage:string,reason:Exclude<PerpsCloseReason,null>,ts:number){const p=this.positions.get(symbol);if(!p)throw new AppError("Paper position not found","POSITION_NOT_FOUND",404);const percent=parseDecimal(percentage);if(percent<=0n||percent>100n*SCALE)throw new AppError("percentage must be greater than 0 and no more than 100","INVALID_PERCENTAGE",400);const fraction=div(percent,100n*SCALE),size=mul(parseDecimal(p.sizeUsd),fraction),fee=mul(size,FEE_RATE),realized=mul(signed(p.unrealizedPnl),fraction);this.balance+=realized-fee;const at=new Date(ts).toISOString(),o:PerpsOrder={id:randomUUID(),market:symbol,side:p.side==="long"?"short":"long",sizeUsd:formatDecimal(size),leverage:p.leverage,orderType:"market",reduceOnly:true,status:"filled",fillPrice:p.markPrice,createdAt:at,updatedAt:at,closeReason:reason};this.orders.set(o.id,o);if(percent===100n*SCALE)this.positions.delete(symbol);else{const remain=SCALE-fraction;p.sizeUsd=formatDecimal(mul(parseDecimal(p.sizeUsd),remain));p.initialMarginUsd=formatDecimal(mul(parseDecimal(p.initialMarginUsd),remain));p.unrealizedPnl=fmt(mul(signed(p.unrealizedPnl),remain));}this.saveState();return{order:{...o},position:this.positions.get(symbol)?{...this.positions.get(symbol)!}:null,account:this.getAccount()};}
  private market(symbol:string){const m=this.markets.find(x=>x.symbol===symbol.toUpperCase());if(!m)throw new AppError("Unsupported paper perpetual market","MARKET_NOT_FOUND",404);return m;}
}
const normalize=(r:PerpsOrderRequest):PerpsOrderRequest=>({...r,market:r.market.toUpperCase(),orderType:r.orderType??"market",reduceOnly:r.reduceOnly??false});
const hash=(r:PerpsOrderRequest)=>createHash("sha256").update(JSON.stringify(r)).digest("hex");
const signed=(v:string)=>v.startsWith("-")?-parseDecimal(v.slice(1)):parseDecimal(v); const fmt=(v:bigint)=>v<0n?`-${formatDecimal(-v)}`:formatDecimal(v);
const crossed=(o:Pick<PerpsOrderRequest,"side"|"limitPrice">,mark:string)=>o.side==="long"?parseDecimal(mark)<=parseDecimal(o.limitPrice!):parseDecimal(mark)>=parseDecimal(o.limitPrice!);
const pnl=(p:PerpsPosition)=>fmt(div(mul(parseDecimal(p.sizeUsd),p.side==="long"?parseDecimal(p.markPrice)-parseDecimal(p.entryPrice):parseDecimal(p.entryPrice)-parseDecimal(p.markPrice)),parseDecimal(p.entryPrice)));
const liquidated=(p:PerpsPosition,mark:bigint)=>p.side==="long"?mark<=parseDecimal(p.liquidationPrice):mark>=parseDecimal(p.liquidationPrice);
function trailingTriggerPrice(p:PerpsPosition,watermark:bigint){const percent=div(parseDecimal(p.trailingStopPercent!),100n*SCALE);return formatDecimal(mul(watermark,p.side==="long"?SCALE-percent:SCALE+percent));}
function ratchetTrailingStop(p:PerpsPosition,mark:bigint){if(!p.trailingStopPercent)return;const previous=parseDecimal(p.trailingWatermarkPrice??p.entryPrice),watermark=p.side==="long"?(mark>previous?mark:previous):(mark<previous?mark:previous);p.trailingWatermarkPrice=formatDecimal(watermark);p.trailingTriggerPrice=trailingTriggerPrice(p,watermark);}
function trigger(p:PerpsPosition,mark:bigint):PerpsCloseReason{if(p.takeProfitPrice&&(p.side==="long"?mark>=parseDecimal(p.takeProfitPrice):mark<=parseDecimal(p.takeProfitPrice)))return"take_profit";if(p.stopLossPrice&&(p.side==="long"?mark<=parseDecimal(p.stopLossPrice):mark>=parseDecimal(p.stopLossPrice)))return"stop_loss";if(p.trailingTriggerPrice&&(p.side==="long"?mark<=parseDecimal(p.trailingTriggerPrice):mark>=parseDecimal(p.trailingTriggerPrice)))return"trailing_stop";return null;}
