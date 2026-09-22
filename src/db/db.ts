import pg from "pg";
import { randomUUID } from "node:crypto";
import type { StoredOrder, StoredPosition } from "./supabase.js";

const { Pool } = pg;

export interface UserRecord {
  id: string;
  username: string;
  email: string | null;
  password_hash: string;
  totp_secret: string;
  totp_enabled: boolean;
  created_at: Date;
  updated_at: Date;
}

let poolInstance: pg.Pool | null = null;

export function getPostgresPool(connectionString?: string): pg.Pool | null {
  if (poolInstance) return poolInstance;

  const rawUrl = connectionString || process.env.DATABASE_URL;
  if (!rawUrl) return null;

  // Supabase pooler on 5432 is session mode (15 max total connections).
  // Transaction mode on port 6543 supports hundreds of serverless connections.
  const url = rawUrl.includes("pooler.supabase.com:5432")
    ? rawUrl.replace("pooler.supabase.com:5432", "pooler.supabase.com:6543")
    : rawUrl;

  poolInstance = new Pool({
    connectionString: url,
    ssl: { rejectUnauthorized: false },
    max: 2,
    idleTimeoutMillis: 5000,
    connectionTimeoutMillis: 5000,
  });

  return poolInstance;
}

export class CidoDatabaseRepository {
  private readonly pool: pg.Pool | null;

  constructor(pool: pg.Pool | null) {
    this.pool = pool;
  }

  get isEnabled(): boolean {
    return this.pool !== null;
  }

  async findUserByUsername(username: string): Promise<UserRecord | null> {
    if (!this.pool) return null;
    const res = await this.pool.query<UserRecord>(
      "SELECT id, username, email, password_hash, totp_secret, totp_enabled, created_at, updated_at FROM users WHERE LOWER(username) = LOWER($1) LIMIT 1",
      [username.trim()]
    );
    return res.rows[0] ?? null;
  }

  async findUserById(id: string): Promise<UserRecord | null> {
    if (!this.pool) return null;
    const res = await this.pool.query<UserRecord>(
      "SELECT id, username, email, password_hash, totp_secret, totp_enabled, created_at, updated_at FROM users WHERE id = $1 LIMIT 1",
      [id]
    );
    return res.rows[0] ?? null;
  }

  async upsertUser(user: {
    id?: string | undefined;
    username: string;
    email?: string | undefined;
    password_hash: string;
    totp_secret: string;
    totp_enabled?: boolean | undefined;
  }): Promise<UserRecord> {
    if (!this.pool) throw new Error("Database pool not initialized");
    const res = await this.pool.query<UserRecord>(
      `INSERT INTO users (username, email, password_hash, totp_secret, totp_enabled, updated_at)
       VALUES ($1, $2, $3, $4, $5, NOW())
       ON CONFLICT (username) DO UPDATE SET
         email = EXCLUDED.email,
         password_hash = EXCLUDED.password_hash,
         totp_secret = EXCLUDED.totp_secret,
         totp_enabled = EXCLUDED.totp_enabled,
         updated_at = NOW()
       RETURNING id, username, email, password_hash, totp_secret, totp_enabled, created_at, updated_at`,
      [
        user.username.trim(),
        user.email?.trim() || null,
        user.password_hash,
        user.totp_secret,
        user.totp_enabled ?? true,
      ]
    );
    return res.rows[0]!;
  }

  async saveOrder(order: StoredOrder): Promise<void> {
    if (!this.pool) return;
    try {
      await this.pool.query(
        `INSERT INTO cido_orders (
          id, user_id, market, side, size_usd, leverage, order_type, status,
          fill_price, stop_loss_price, take_profit_price, trailing_stop_percent,
          is_live, close_reason, tx_hash, realized_pnl, fee_usd, created_at, updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, NOW(), NOW())
        ON CONFLICT (id) DO UPDATE SET
          status = EXCLUDED.status,
          fill_price = EXCLUDED.fill_price,
          close_reason = EXCLUDED.close_reason,
          tx_hash = EXCLUDED.tx_hash,
          realized_pnl = EXCLUDED.realized_pnl,
          fee_usd = EXCLUDED.fee_usd,
          updated_at = NOW()`,
        [
          order.id,
          order.user_id || null,
          order.market,
          order.side,
          order.size_usd,
          order.leverage,
          order.order_type,
          order.status,
          order.fill_price || null,
          order.stop_loss_price || null,
          order.take_profit_price || null,
          order.trailing_stop_percent || null,
          order.is_live,
          order.close_reason || null,
          order.tx_hash || null,
          order.realized_pnl || null,
          order.fee_usd || null,
        ]
      );
    } catch (err) {
      console.error("CidoDatabaseRepository.saveOrder error:", err);
    }
  }

  async savePosition(pos: StoredPosition): Promise<void> {
    if (!this.pool) return;
    try {
      if (pos.status === "closed") {
        await this.pool.query(
          `UPDATE cido_positions SET
            status = 'closed',
            size_usd = '0',
            initial_margin_usd = '0',
            mark_price = $1,
            unrealized_pnl = $2,
            last_updated = NOW()
          WHERE market = $3 AND status = 'open'`,
          [pos.mark_price, pos.unrealized_pnl || "0", pos.market]
        );
        return;
      }
      let id = pos.id;
      if (!id) {
        const existing = await this.pool.query<{ id: string }>(
          "SELECT id FROM cido_positions WHERE market = $1 AND status = 'open' LIMIT 1",
          [pos.market]
        );
        if (existing.rows[0]?.id) {
          id = existing.rows[0].id;
        } else {
          id = randomUUID();
        }
      }
      await this.pool.query(
        `INSERT INTO cido_positions (
          id, user_id, market, side, size_usd, leverage, entry_price, mark_price,
          initial_margin_usd, liquidation_price, unrealized_pnl, stop_loss_price,
          take_profit_price, trailing_stop_percent, is_live, status, opened_at, last_updated
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, NOW(), NOW())
        ON CONFLICT (id) DO UPDATE SET
          size_usd = EXCLUDED.size_usd,
          mark_price = EXCLUDED.mark_price,
          unrealized_pnl = EXCLUDED.unrealized_pnl,
          stop_loss_price = EXCLUDED.stop_loss_price,
          take_profit_price = EXCLUDED.take_profit_price,
          trailing_stop_percent = EXCLUDED.trailing_stop_percent,
          status = EXCLUDED.status,
          last_updated = NOW()`,
        [
          id,
          pos.user_id || null,
          pos.market,
          pos.side,
          pos.size_usd,
          pos.leverage,
          pos.entry_price,
          pos.mark_price,
          pos.initial_margin_usd,
          pos.liquidation_price,
          pos.unrealized_pnl || "0",
          pos.stop_loss_price || null,
          pos.take_profit_price || null,
          pos.trailing_stop_percent || null,
          pos.is_live,
          pos.status,
        ]
      );
    } catch (err) {
      console.error("CidoDatabaseRepository.savePosition error:", err);
    }
  }

  async getOpenPositions(userId?: string): Promise<StoredPosition[]> {
    if (!this.pool) return [];
    try {
      const query = userId
        ? "SELECT * FROM cido_positions WHERE status = 'open' AND user_id = $1"
        : "SELECT * FROM cido_positions WHERE status = 'open'";
      const params = userId ? [userId] : [];
      const res = await this.pool.query<StoredPosition>(query, params);
      return res.rows;
    } catch (err) {
      console.error("CidoDatabaseRepository.getOpenPositions error:", err);
      return [];
    }
  }

  async getRecentOrders(userId?: string, limit = 50): Promise<StoredOrder[]> {
    if (!this.pool) return [];
    try {
      const query = userId
        ? "SELECT * FROM cido_orders WHERE user_id = $1 ORDER BY created_at DESC LIMIT $2"
        : "SELECT * FROM cido_orders ORDER BY created_at DESC LIMIT $1";
      const params = userId ? [userId, limit] : [limit];
      const res = await this.pool.query<StoredOrder>(query, params);
      return res.rows;
    } catch (err) {
      console.error("CidoDatabaseRepository.getRecentOrders error:", err);
      return [];
    }
  }

  async saveAccountBalance(balance: string): Promise<void> {
    if (!this.pool) return;
    try {
      await this.pool.query(
        `INSERT INTO cido_account_state (id, balance, updated_at) VALUES ('default', $1, NOW())
         ON CONFLICT (id) DO UPDATE SET balance = EXCLUDED.balance, updated_at = NOW()`,
        [balance]
      );
    } catch (err) {
      console.error("CidoDatabaseRepository.saveAccountBalance error:", err);
    }
  }

  async getAccountBalance(): Promise<string | null> {
    if (!this.pool) return null;
    try {
      const res = await this.pool.query<{ balance: string }>(
        "SELECT balance FROM cido_account_state WHERE id = 'default' LIMIT 1"
      );
      return res.rows[0]?.balance ?? null;
    } catch (err) {
      console.error("CidoDatabaseRepository.getAccountBalance error:", err);
      return null;
    }
  }
}
