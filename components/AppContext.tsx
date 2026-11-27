"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { demoStore } from "@/lib/data/demo-store.ts";
import { httpStore } from "@/lib/data/http-store.ts";
import type { Store, StoreMode } from "@/lib/data/store.ts";
import type { Business } from "@/lib/types.ts";

const MODE_KEY = "emporos.mode";

export interface SessionUser {
  id: string;
  email?: string;
  wallet?: string;
  isAdmin: boolean;
}

interface MeResponse {
  configured: boolean;
  emailLogin: boolean;
  user: SessionUser | null;
}

interface AppState {
  ready: boolean;
  mode: StoreMode;
  store: Store;
  /** A database is connected, so live mode and sign-in are available. */
  configured: boolean;
  emailLogin: boolean;
  user: SessionUser | null;
  business: Business | null;
  /** The business lookup for the current user has finished at least once. */
  businessLoaded: boolean;
  setMode(mode: StoreMode): void;
  refreshUser(): Promise<SessionUser | null>;
  refreshBusiness(): Promise<Business | null>;
  setBusiness(business: Business): void;
  signOut(): Promise<void>;
}

const AppContext = createContext<AppState | null>(null);

export function AppProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [mode, setModeState] = useState<StoreMode>("demo");
  const [configured, setConfigured] = useState(false);
  const [emailLogin, setEmailLogin] = useState(false);
  const [user, setUser] = useState<SessionUser | null>(null);
  const [business, setBusiness] = useState<Business | null>(null);
  const [businessLoaded, setBusinessLoaded] = useState(false);

  const store = useMemo<Store>(() => (mode === "live" && configured ? httpStore : demoStore), [mode, configured]);

  const refreshUser = useCallback(async () => {
    try {
      const response = await fetch("/api/auth/me", { cache: "no-store", credentials: "same-origin" });
      const me = (await response.json()) as MeResponse;
      setConfigured(Boolean(me.configured));
      setEmailLogin(Boolean(me.emailLogin));
      setUser(me.user ?? null);
      return me.user ?? null;
    } catch {
      setConfigured(false);
      setUser(null);
      return null;
    }
  }, []);

  useEffect(() => {
    void (async () => {
      await refreshUser().then(() => undefined);
      const params = new URLSearchParams(window.location.search);
      const stored = localStorage.getItem(MODE_KEY) as StoreMode | null;
      const wanted: StoreMode = params.get("demo") === "1" ? "demo" : stored ?? "live";
      setModeState(wanted);
      localStorage.setItem(MODE_KEY, wanted);
      setReady(true);
    })();
  }, [refreshUser]);

  // Without a database there is only the demo.
  const effectiveMode: StoreMode = configured ? mode : "demo";

  const refreshBusiness = useCallback(async () => {
    if (effectiveMode === "live" && !user) {
      setBusiness(null);
      return null;
    }
    setBusinessLoaded(false);
    try {
      const next = await store.getBusiness();
      setBusiness(next);
      return next;
    } catch {
      setBusiness(null);
      return null;
    } finally {
      setBusinessLoaded(true);
    }
  }, [effectiveMode, store, user]);

  useEffect(() => {
    if (ready) void refreshBusiness();
  }, [ready, refreshBusiness]);

  const setMode = useCallback((next: StoreMode) => {
    localStorage.setItem(MODE_KEY, next);
    setModeState(next);
  }, []);

  const signOut = useCallback(async () => {
    await fetch("/api/auth/logout", { method: "POST", credentials: "same-origin" }).catch(() => undefined);
    setUser(null);
    setBusiness(null);
  }, []);

  const value: AppState = {
    ready,
    mode: effectiveMode,
    store,
    configured,
    emailLogin,
    user,
    business,
    businessLoaded,
    setMode,
    refreshUser,
    refreshBusiness,
    setBusiness,
    signOut,
  };
  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp(): AppState {
  const value = useContext(AppContext);
  if (!value) throw new Error("useApp must be used inside AppProvider.");
  return value;
}
