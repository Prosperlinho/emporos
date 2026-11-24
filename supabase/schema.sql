-- Emporos schema. Run in the Supabase SQL editor (or `supabase db push`), then run seed.sql.
-- Money is stored as naira decimal TEXT (max 2 dp) so it never passes through floats.

create extension if not exists pgcrypto;

create or replace function public.is_naira(value text) returns boolean
language sql immutable as $$ select value ~ '^(0|[1-9][0-9]*)(\.[0-9]{1,2})?$' $$;

-- Businesses (buyers). One per user.
create table if not exists public.businesses (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null unique default auth.uid() references auth.users (id) on delete cascade,
  name text not null check (length(name) between 1 and 120),
  location text not null default '',
  default_currency text not null default 'cNGN' check (default_currency = 'cNGN'),
  owner_wallet text check (owner_wallet is null or owner_wallet ~ '^0x[0-9a-fA-F]{40}$'),
  agent_id text,
  agent_registration_tx text,
  rules jsonb not null,
  agent jsonb,
  created_at timestamptz not null default now()
);

-- Suppliers. Created by a supplier user in the portal, or by a buyer adding one to their directory.
-- `verified` can only be changed with the service role (see column grants below).
create table if not exists public.suppliers (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid default auth.uid() references auth.users (id) on delete set null,
  name text not null check (length(name) between 1 and 120),
  location text not null default '',
  wallet_address text not null default '' check (wallet_address = '' or wallet_address ~ '^0x[0-9a-fA-F]{40}$'),
  currency text not null default 'cNGN' check (currency in ('cNGN', 'USDT')),
  verified boolean not null default false,
  contact text,
  created_at timestamptz not null default now()
);

create table if not exists public.products (
  id uuid primary key default gen_random_uuid(),
  supplier_id uuid not null references public.suppliers (id) on delete cascade,
  name text not null check (length(name) between 1 and 160),
  unit text not null default 'unit',
  unit_price text not null check (public.is_naira(unit_price)),
  delivery_fee text not null default '0' check (public.is_naira(delivery_fee)),
  stock integer not null check (stock >= 0),
  delivery_days integer not null check (delivery_days >= 0),
  delivery_areas text[] not null default '{}',
  updated_at timestamptz not null default now()
);
create index if not exists products_supplier_idx on public.products (supplier_id);

create table if not exists public.orders (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  status text not null check (status in ('quoted', 'awaiting_approval', 'paying', 'paid', 'delivered', 'failed', 'cancelled')),
  request jsonb not null,
  chosen jsonb not null,
  alternatives jsonb not null default '[]',
  reasons jsonb not null default '[]',
  rule_check jsonb not null,
  amount text not null check (public.is_naira(amount)),
  paid_by text check (paid_by in ('agent', 'owner')),
  payer text,
  fx jsonb,
  payment_tx_hash text check (payment_tx_hash is null or payment_tx_hash ~ '^0x[0-9a-fA-F]{64}$'),
  simulated boolean not null default false,
  error text,
  created_at timestamptz not null default now(),
  paid_at timestamptz,
  delivered_at timestamptz
);
create index if not exists orders_business_idx on public.orders (business_id, created_at desc);

-- Row-level security ---------------------------------------------------------
alter table public.businesses enable row level security;
alter table public.suppliers enable row level security;
alter table public.products enable row level security;
alter table public.orders enable row level security;

drop policy if exists "own business" on public.businesses;
create policy "own business" on public.businesses
  for all to authenticated using (owner_id = auth.uid()) with check (owner_id = auth.uid());

drop policy if exists "suppliers readable" on public.suppliers;
create policy "suppliers readable" on public.suppliers for select to anon, authenticated using (true);
drop policy if exists "suppliers insert own" on public.suppliers;
create policy "suppliers insert own" on public.suppliers for insert to authenticated with check (owner_id = auth.uid());
drop policy if exists "suppliers update own" on public.suppliers;
create policy "suppliers update own" on public.suppliers for update to authenticated using (owner_id = auth.uid()) with check (owner_id = auth.uid());
drop policy if exists "suppliers delete own" on public.suppliers;
create policy "suppliers delete own" on public.suppliers for delete to authenticated using (owner_id = auth.uid());

-- Users may not set or change `verified`.
revoke insert, update on public.suppliers from anon, authenticated;
grant insert (owner_id, name, location, wallet_address, currency, contact) on public.suppliers to authenticated;
grant update (name, location, wallet_address, currency, contact) on public.suppliers to authenticated;

drop policy if exists "products readable" on public.products;
create policy "products readable" on public.products for select to anon, authenticated using (true);
drop policy if exists "products write by supplier owner" on public.products;
create policy "products write by supplier owner" on public.products
  for all to authenticated
  using (exists (select 1 from public.suppliers s where s.id = supplier_id and s.owner_id = auth.uid()))
  with check (exists (select 1 from public.suppliers s where s.id = supplier_id and s.owner_id = auth.uid()));

drop policy if exists "own orders" on public.orders;
create policy "own orders" on public.orders
  for all to authenticated
  using (exists (select 1 from public.businesses b where b.id = business_id and b.owner_id = auth.uid()))
  with check (exists (select 1 from public.businesses b where b.id = business_id and b.owner_id = auth.uid()));
