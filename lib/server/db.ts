// Postgres (Neon, via Vercel Marketplace). Tables are created on first use, so connecting the
// database in Vercel is the only setup step. Every statement is idempotent.
import "server-only";
import { neon, type NeonQueryFunction } from "@neondatabase/serverless";

const url = process.env.DATABASE_URL || process.env.POSTGRES_URL || "";
export const dbConfigured = Boolean(url);

const NAIRA = `'^(0|[1-9][0-9]*)(\\.[0-9]{1,2})?$'`;

const SCHEMA = [
  `create extension if not exists pgcrypto`,
  `create table if not exists users (
     id uuid primary key default gen_random_uuid(),
     email text unique,
     wallet text unique,
     created_at timestamptz not null default now()
   )`,
  `create table if not exists businesses (
     id uuid primary key default gen_random_uuid(),
     owner_id uuid not null unique references users (id) on delete cascade,
     doc jsonb not null,
     updated_at timestamptz not null default now()
   )`,
  `create table if not exists suppliers (
     id uuid primary key default gen_random_uuid(),
     owner_id uuid references users (id) on delete set null,
     name text not null check (length(name) between 1 and 120),
     location text not null default '',
     wallet_address text not null default '' check (wallet_address = '' or wallet_address ~ '^0x[0-9a-fA-F]{40}$'),
     currency text not null default 'cNGN' check (currency in ('cNGN', 'USDT')),
     verified boolean not null default false,
     contact text,
     created_at timestamptz not null default now()
   )`,
  `create table if not exists products (
     id uuid primary key default gen_random_uuid(),
     supplier_id uuid not null references suppliers (id) on delete cascade,
     name text not null check (length(name) between 1 and 160),
     unit text not null default 'unit',
     unit_price text not null check (unit_price ~ ${NAIRA}),
     delivery_fee text not null default '0' check (delivery_fee ~ ${NAIRA}),
     stock integer not null check (stock >= 0),
     delivery_days integer not null check (delivery_days >= 0),
     delivery_areas text[] not null default '{}',
     updated_at timestamptz not null default now()
   )`,
  `create index if not exists products_supplier_idx on products (supplier_id)`,
  `create table if not exists orders (
     id uuid primary key default gen_random_uuid(),
     business_id uuid not null references businesses (id) on delete cascade,
     status text not null,
     doc jsonb not null,
     created_at timestamptz not null default now()
   )`,
  `create index if not exists orders_business_idx on orders (business_id, created_at desc)`,
  `create table if not exists email_codes (
     email text primary key,
     code_hash text not null,
     attempts integer not null default 0,
     expires_at timestamptz not null,
     sent_at timestamptz not null default now()
   )`,
  `create table if not exists passkeys (
     id text primary key,
     user_id uuid not null references users (id) on delete cascade,
     public_key text not null,
     counter bigint not null default 0,
     transports text[] not null default '{}',
     created_at timestamptz not null default now(),
     last_used_at timestamptz
   )`,
  `create index if not exists passkeys_user_idx on passkeys (user_id)`,
];

let client: NeonQueryFunction<false, false> | null = null;
let ready: Promise<void> | null = null;

async function migrate(sql: NeonQueryFunction<false, false>): Promise<void> {
  for (const statement of SCHEMA) await sql.query(statement);
}

/** A ready-to-use query function. Throws if no database is connected. */
export async function db(): Promise<NeonQueryFunction<false, false>> {
  if (!url) throw new Error("No database connected. Add Neon Postgres to the project in Vercel (Storage tab).");
  client ??= neon(url);
  ready ??= migrate(client).catch((error) => {
    ready = null;
    throw error;
  });
  await ready;
  return client;
}

export type DbRow = Record<string, unknown>;
