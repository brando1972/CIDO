-- CIDO PostgreSQL Schema for Supabase
-- Run this in your Supabase SQL Editor (https://supabase.com/dashboard)

-- Enable UUID extension
create extension if not exists "uuid-ossp";

-- 1. User Profiles linked to Supabase Auth
create table if not exists public.cido_profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  default_leverage text default '3',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Row level security for profiles
alter table public.cido_profiles enable row level security;
create policy "Users can view own profile" on public.cido_profiles
  for select using (auth.uid() = id);
create policy "Users can update own profile" on public.cido_profiles
  for update using (auth.uid() = id);

-- 2. Orders (Paper & Live)
create table if not exists public.cido_orders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  market text not null,
  side text not null check (side in ('long', 'short')),
  size_usd text not null,
  leverage text not null,
  order_type text not null check (order_type in ('market', 'limit')),
  status text not null,
  fill_price text,
  stop_loss_price text,
  take_profit_price text,
  trailing_stop_percent text,
  is_live boolean default false,
  close_reason text,
  tx_hash text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table public.cido_orders enable row level security;
create policy "Users can view own orders" on public.cido_orders
  for select using (auth.uid() = user_id or user_id is null);
create policy "Users can insert own orders" on public.cido_orders
  for insert with check (auth.uid() = user_id or user_id is null);

-- 3. Positions (Paper & Live)
create table if not exists public.cido_positions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  market text not null,
  side text not null check (side in ('long', 'short')),
  size_usd text not null,
  leverage text not null,
  entry_price text not null,
  mark_price text not null,
  initial_margin_usd text not null,
  liquidation_price text not null,
  unrealized_pnl text default '0',
  stop_loss_price text,
  take_profit_price text,
  trailing_stop_percent text,
  is_live boolean default false,
  status text default 'open' check (status in ('open', 'closed', 'liquidated')),
  opened_at timestamptz default now(),
  last_updated timestamptz default now()
);

alter table public.cido_positions enable row level security;
create policy "Users can view own positions" on public.cido_positions
  for select using (auth.uid() = user_id or user_id is null);
create policy "Users can modify own positions" on public.cido_positions
  for all using (auth.uid() = user_id or user_id is null);

-- Index for fast queries
create index if not exists idx_cido_orders_user on public.cido_orders(user_id, created_at desc);
create index if not exists idx_cido_positions_user on public.cido_positions(user_id, status);
create index if not exists idx_cido_positions_market on public.cido_positions(market, status);
