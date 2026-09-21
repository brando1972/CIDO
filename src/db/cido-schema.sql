-- CIDO Isolated PostgreSQL Schema (cido_db)
-- Dedicated to CIDO Perpetuals Console. Completely isolated from other projects.

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- 1. Users & 2FA credentials
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  username VARCHAR(50) UNIQUE NOT NULL,
  email VARCHAR(255),
  password_hash TEXT NOT NULL,
  totp_secret TEXT NOT NULL,
  totp_enabled BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Orders
CREATE TABLE IF NOT EXISTS cido_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  market TEXT NOT NULL,
  side TEXT NOT NULL CHECK (side IN ('long', 'short')),
  size_usd TEXT NOT NULL,
  leverage TEXT NOT NULL,
  order_type TEXT NOT NULL CHECK (order_type IN ('market', 'limit')),
  status TEXT NOT NULL,
  fill_price TEXT,
  stop_loss_price TEXT,
  take_profit_price TEXT,
  trailing_stop_percent TEXT,
  is_live BOOLEAN DEFAULT FALSE,
  close_reason TEXT,
  tx_hash TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. Positions
CREATE TABLE IF NOT EXISTS cido_positions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  market TEXT NOT NULL,
  side TEXT NOT NULL CHECK (side IN ('long', 'short')),
  size_usd TEXT NOT NULL,
  leverage TEXT NOT NULL,
  entry_price TEXT NOT NULL,
  mark_price TEXT NOT NULL,
  initial_margin_usd TEXT NOT NULL,
  liquidation_price TEXT NOT NULL,
  unrealized_pnl TEXT DEFAULT '0',
  stop_loss_price TEXT,
  take_profit_price TEXT,
  trailing_stop_percent TEXT,
  is_live BOOLEAN DEFAULT FALSE,
  status TEXT DEFAULT 'open' CHECK (status IN ('open', 'closed', 'liquidated')),
  opened_at TIMESTAMPTZ DEFAULT NOW(),
  last_updated TIMESTAMPTZ DEFAULT NOW()
);

-- Performance Indexes
CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);
CREATE INDEX IF NOT EXISTS idx_cido_orders_user ON cido_orders(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_cido_positions_user ON cido_positions(user_id, status);
CREATE INDEX IF NOT EXISTS idx_cido_positions_market ON cido_positions(market, status);
