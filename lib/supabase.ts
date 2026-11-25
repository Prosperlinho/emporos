import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

export const supabaseConfigured = Boolean(url && anonKey);

// No generated Database types: rows come back untyped and are mapped into checked
// domain types in lib/data/supabase-store.ts. (Without this, supabase-js types rows as `never`.)
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Db = ReturnType<typeof createClient<any>>;

let browserClient: Db | null = null;

/** Browser client with the user's session (persisted in localStorage). */
export function getSupabase(): Db {
  if (!url || !anonKey) throw new Error("Supabase is not configured. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY.");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  browserClient ??= createClient<any>(url, anonKey, { auth: { persistSession: true, autoRefreshToken: true } });
  return browserClient;
}

/** Stateless server client for public reads (catalog). Row-level security still applies. */
export function getServerSupabase(): Db | null {
  if (!url || !anonKey) return null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return createClient<any>(url, anonKey, { auth: { persistSession: false } });
}
