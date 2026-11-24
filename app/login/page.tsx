"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useApp } from "@/components/AppContext.tsx";
import { errorText } from "@/components/ui.tsx";
import { getSupabase, supabaseConfigured } from "@/lib/supabase.ts";

export default function LoginPage() {
  const { user, ready, setMode } = useApp();
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const next = typeof window !== "undefined" ? new URLSearchParams(window.location.search).get("next") ?? "/app" : "/app";

  useEffect(() => {
    if (ready && user) {
      setMode("live");
      router.replace(next.startsWith("/") ? next : "/app");
    }
  }, [ready, user, router, next, setMode]);

  async function emailLogin(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const { error: err } = await getSupabase().auth.signInWithOtp({
        email: email.trim(),
        options: { emailRedirectTo: `${window.location.origin}/login?next=${encodeURIComponent(next)}` },
      });
      if (err) throw err;
      setSent(true);
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  }

  async function walletLogin() {
    setBusy(true);
    setError("");
    try {
      if (!window.ethereum) throw new Error("No browser wallet found. Open this page in MiniPay, Valora or a wallet browser, or use email.");
      const { error: err } = await getSupabase().auth.signInWithWeb3({
        chain: "ethereum",
        statement: "Sign in to Emporos. This does not send a transaction or cost anything.",
      });
      if (err) throw err;
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="shell" style={{ maxWidth: 440, paddingTop: 40 }}>
      <Link className="brand" href="/"><span className="brand-mark">E</span><span>emporos</span></Link>
      <section className="panel accent" style={{ marginTop: 24 }}>
        <h1 style={{ fontSize: 26, letterSpacing: -0.8 }}>Sign in</h1>
        {!supabaseConfigured ? (
          <>
            <p className="muted">Accounts aren&apos;t set up on this deployment yet (Supabase is not configured). You can still try the full flow with demo data.</p>
            <Link className="btn primary block" href="/app?demo=1">Open live demo</Link>
          </>
        ) : sent ? (
          <div className="notice ok">Check {email} for a sign-in link. You can close this tab.</div>
        ) : (
          <div className="stack">
            <button className="btn primary block" type="button" disabled={busy} onClick={() => void walletLogin()}>
              Sign in with wallet
            </button>
            <p className="small muted" style={{ textAlign: "center", margin: 0 }}>or</p>
            <form className="stack" onSubmit={(e) => void emailLogin(e)}>
              <label className="field">
                <span>Email</span>
                <input type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@shop.ng" />
              </label>
              <button className="btn block" disabled={busy}>Email me a sign-in link</button>
            </form>
          </div>
        )}
        {error && <div className="notice error" style={{ marginTop: 12 }}>{error}</div>}
      </section>
      <p className="small muted" style={{ textAlign: "center" }}>
        Just looking? <Link href="/app?demo=1">Try the live demo</Link> · Supplier? <Link href="/supplier">List your products</Link>
      </p>
    </main>
  );
}
