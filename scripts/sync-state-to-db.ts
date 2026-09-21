import { getSupabaseClient, DatabaseRepository } from "../src/db/supabase.js";
import fs from "node:fs";

const raw = JSON.parse(fs.readFileSync("data/paper-state.json", "utf8"));
const client = getSupabaseClient();
const db = new DatabaseRepository(client);

async function sync() {
  console.log("Syncing orders...");
  for (const o of raw.orders) {
    await db.saveOrder({
      id: o.id,
      market: o.market,
      side: o.side,
      size_usd: o.sizeUsd,
      leverage: o.leverage,
      order_type: o.orderType,
      status: o.status,
      fill_price: o.fillPrice,
      stop_loss_price: o.stopLossPrice,
      is_live: false,
      created_at: o.createdAt
    });
  }

  console.log("Syncing positions...");
  for (const p of raw.positions) {
    await db.savePosition({
      market: p.market,
      side: p.side,
      size_usd: p.sizeUsd,
      leverage: p.leverage,
      entry_price: p.entryPrice,
      mark_price: p.markPrice,
      initial_margin_usd: p.initialMarginUsd,
      liquidation_price: p.liquidationPrice,
      unrealized_pnl: p.unrealizedPnl,
      stop_loss_price: p.stopLossPrice,
      is_live: false,
      status: "open",
      opened_at: p.openedAt,
      last_updated: p.lastUpdated
    });
  }

  const positions = await db.getOpenPositions();
  const orders = await db.getRecentOrders();
  console.log("Supabase Open Positions count:", positions.length);
  console.log("Supabase Recent Orders count:", orders.length);
  console.log("Position details:", positions[0]);
}

sync().catch(console.error);
