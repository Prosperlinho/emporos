import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

export const supabaseConfigured = Boolean(url && anonKey);

let browserClient: SupabaseClient | null = null;

/** Browser client with the user's session (persisted in localStorage). */
export function getSupabase(): SupabaseClient {
  if (!url || !anonKey) throw new Error("Supabase is not configured. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY.");
  browserClient ??= createClient(url, anonKey, { auth: { persistSession: true, autoRefreshToken: true } });
  return browserClient;
}

/** Stateless server client for public reads (catalog). Row-level security still applies. */
export function getServerSupabase(): SupabaseClient | null {
  if (!url || !anonKey) return null;
  return createClient(url, anonKey, { auth: { persistSession: false } });
}
