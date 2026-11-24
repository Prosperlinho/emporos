"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { demoStore } from "@/lib/data/demo-store.ts";
import type { Store, StoreMode } from "@/lib/data/store.ts";
import { createSupabaseStore } from "@/lib/data/supabase-store.ts";
import { getSupabase, supabaseConfigured } from "@/lib/supabase.ts";
import type { Business } from "@/lib/types.ts";

const MODE_KEY = "emporos.mode";

export interface SessionUser {
  id: string;
  email?: string;
  wallet?: string;
}

interface AppState {
  ready: boolean;
  mode: StoreMode;
  store: Store;
  user: SessionUser | null;
  business: Business | null;
  setMode(mode: StoreMode): void;
  refreshBusiness(): Promise<Business | null>;
  setBusiness(business: Business): void;
  signOut(): Promise<void>;
}

const AppContext = createContext<AppState | null>(null);

export function AppProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [mode, setModeState] = useState<StoreMode>("demo");
  const [user, setUser] = useState<SessionUser | null>(null);
  const [business, setBusiness] = useState<Business | null>(null);

  const store = useMemo<Store>(() => (mode === "live" && supabaseConfigured ? createSupabaseStore() : demoStore), [mode]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const wanted = params.get("demo") === "1" ? "demo" : (localStorage.getItem(MODE_KEY) as StoreMode | null);
    const initial: StoreMode = wanted === "live" && supabaseConfigured ? "live" : wanted === "demo" || !supabaseConfigured ? "demo" : "live";
    localStorage.setItem(MODE_KEY, initial);
    setModeState(initial);

    if (!supabaseConfigured) {
      setReady(true);
      return;
    }
    const db = getSupabase();
    const apply = (session: Awaited<ReturnType<typeof db.auth.getSession>>["data"]["session"]) => {
      const u = session?.user;
      const wallet = (u?.user_metadata?.custom_claims?.address ?? u?.user_metadata?.address) as string | undefined;
      setUser(u ? { id: u.id, ...(u.email ? { email: u.email } : {}), ...(wallet ? { wallet } : {}) } : null);
    };
    void db.auth.getSession().then(({ data }) => {
      apply(data.session);
      setReady(true);
    });
    const { data } = db.auth.onAuthStateChange((_event, session) => apply(session));
    return () => data.subscription.unsubscribe();
  }, []);

  const refreshBusiness = useCallback(async () => {
    if (mode === "live" && !user) {
      setBusiness(null);
      return null;
    }
    try {
      const next = await store.getBusiness();
      setBusiness(next);
      return next;
    } catch {
      setBusiness(null);
      return null;
    }
  }, [mode, store, user]);

  useEffect(() => {
    if (ready) void refreshBusiness();
  }, [ready, refreshBusiness]);

  const setMode = useCallback((next: StoreMode) => {
    const resolved = next === "live" && !supabaseConfigured ? "demo" : next;
    localStorage.setItem(MODE_KEY, resolved);
    setModeState(resolved);
  }, []);

  const signOut = useCallback(async () => {
    if (supabaseConfigured) await getSupabase().auth.signOut();
    setUser(null);
    setBusiness(null);
  }, []);

  const value: AppState = { ready, mode, store, user, business, setMode, refreshBusiness, setBusiness, signOut };
  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp(): AppState {
  const value = useContext(AppContext);
  if (!value) throw new Error("useApp must be used inside AppProvider.");
  return value;
}
