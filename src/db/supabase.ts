import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { AppConfig } from "../config/env.js";

let clientInstance: SupabaseClient | null = null;

export function getSupabaseClient(config?: AppConfig): SupabaseClient | null {
  if (clientInstance) return clientInstance;

  const url = config?.SUPABASE_URL || process.env.SUPABASE_URL;
  const key = config?.SUPABASE_SERVICE_ROLE_KEY || config?.SUPABASE_ANON_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;

  if (!url || !key) {
    return null;
  }

  clientInstance = createClient(url, key, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });

  return clientInstance;
}

export interface StoredOrder {
  id: string;
  user_id?: string | null;
  market: string;
  side: "long" | "short";
  size_usd: string;
  leverage: string;
  order_type: "market" | "limit";
  status: string;
  fill_price?: string | null;
  stop_loss_price?: string | null;
  take_profit_price?: string | null;
  trailing_stop_percent?: string | null;
  is_live: boolean;
  close_reason?: string | null;
  realized_pnl?: string | null;
  fee_usd?: string | null;
  tx_hash?: string | null;
  created_at?: string;
}

export interface StoredPosition {
  id?: string;
  user_id?: string | null;
  market: string;
  side: "long" | "short";
  size_usd: string;
  leverage: string;
  entry_price: string;
  mark_price: string;
  initial_margin_usd: string;
  liquidation_price: string;
  unrealized_pnl: string;
  stop_loss_price?: string | null;
  take_profit_price?: string | null;
  trailing_stop_percent?: string | null;
  is_live: boolean;
  status: "open" | "closed" | "liquidated";
  opened_at?: string;
  last_updated?: string;
}

export class DatabaseRepository {
  private readonly supabase: SupabaseClient | null;

  constructor(supabase: SupabaseClient | null) {
    this.supabase = supabase;
  }

  get isEnabled(): boolean {
    return this.supabase !== null;
  }

  async saveOrder(order: StoredOrder): Promise<void> {
    if (!this.supabase) return;
    try {
      await this.supabase.from("cido_orders").upsert(order);
    } catch (err) {
      console.error("Supabase saveOrder error:", err);
    }
  }

  async savePosition(pos: StoredPosition): Promise<void> {
    if (!this.supabase) return;
    try {
      await this.supabase.from("cido_positions").upsert(pos, { onConflict: "id" });
    } catch (err) {
      console.error("Supabase savePosition error:", err);
    }
  }

  async getOpenPositions(userId?: string): Promise<StoredPosition[]> {
    if (!this.supabase) return [];
    try {
      let q = this.supabase.from("cido_positions").select("*").eq("status", "open");
      if (userId) q = q.eq("user_id", userId);
      const { data, error } = await q;
      if (error) throw error;
      return (data as StoredPosition[]) || [];
    } catch (err) {
      console.error("Supabase getOpenPositions error:", err);
      return [];
    }
  }

  async getRecentOrders(userId?: string, limit = 50): Promise<StoredOrder[]> {
    if (!this.supabase) return [];
    try {
      let q = this.supabase.from("cido_orders").select("*").order("created_at", { ascending: false }).limit(limit);
      if (userId) q = q.eq("user_id", userId);
      const { data, error } = await q;
      if (error) throw error;
      return (data as StoredOrder[]) || [];
    } catch (err) {
      console.error("Supabase getRecentOrders error:", err);
      return [];
    }
  }

  async saveAccountBalance(balance: string): Promise<void> {
    if (!this.supabase) return;
    try {
      await this.supabase.from("cido_account_state").upsert({ id: "default", balance });
    } catch (err) {
      console.error("Supabase saveAccountBalance error:", err);
    }
  }

  async getAccountBalance(): Promise<string | null> {
    if (!this.supabase) return null;
    try {
      const { data, error } = await this.supabase
        .from("cido_account_state")
        .select("balance")
        .eq("id", "default")
        .single();
      if (error) return null;
      return (data as { balance: string })?.balance ?? null;
    } catch (err) {
      console.error("Supabase getAccountBalance error:", err);
      return null;
    }
  }
}

