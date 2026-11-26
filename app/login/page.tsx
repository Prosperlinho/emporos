"use client";

import { LogoMark } from "@/components/Logo.tsx";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { createSiweMessage } from "viem/siwe";
import { useAccount, useSignMessage } from "wagmi";
import { useApp } from "@/components/AppContext.tsx";
import { errorText } from "@/components/ui.tsx";

async function post<T>(path: string, body?: unknown): Promise<T> {
  const response = await fetch(`/api/auth/${path}`, {
    method: "POST",
    credentials: "same-origin",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body ?? {}),
  });
  const data = (await response.json().catch(() => ({}))) as T & { error?: string };
  if (!response.ok) throw new Error(data.error ?? "Sign-in failed.");
  return data;
}

export default function LoginPage() {
  const { user, ready, configured, emailLogin, setMode, refreshUser } = useApp();
  const { address, chainId, isConnected } = useAccount();
  const { signMessageAsync } = useSignMessage();
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const next = typeof window !== "undefined" ? new URLSearchParams(window.location.search).get("next") ?? "/app" : "/app";

  useEffect(() => {
    if (ready && user) {
      setMode("live");
      router.replace(next.startsWith("/") && !next.startsWith("//") ? next : "/app");
    }
  }, [ready, user, router, next, setMode]);

  async function run(task: () => Promise<void>) {
    setBusy(true);
    setError("");
    try {
      await task();
    } catch (e) {
      const message = errorText(e);
      setError(/rejected|denied/i.test(message) ? "Signature cancelled." : message);
    } finally {
      setBusy(false);
    }
  }

  const walletLogin = () =>
    run(async () => {
      if (!address) throw new Error("Connect a wallet first.");
      const { nonce } = await post<{ nonce: string }>("nonce");
      const message = createSiweMessage({
        address,
        chainId: chainId ?? 42220,
        domain: window.location.host,
        uri: window.location.origin,
        nonce,
        version: "1",
        statement: "Sign in to Emporos. No transaction, no cost.",
      });
      const signature = await signMessageAsync({ message });
      await post("wallet", { message, signature });
      await refreshUser();
    });

  const sendCode = (e: React.FormEvent) => {
    e.preventDefault();
    void run(async () => {
      await post("email-start", { email });
      setSent(true);
    });
  };

  const verifyCode = (e: React.FormEvent) => {
    e.preventDefault();
    void run(async () => {
      await post("email-verify", { email, code });
      await refreshUser();
    });
  };

  return (
    <main className="shell" style={{ maxWidth: 440, paddingTop: 40 }}>
      <Link className="brand" href="/"><LogoMark size={26} /><span>emporos</span></Link>
      <section className="panel accent" style={{ marginTop: 24 }}>
        <h1 style={{ fontSize: 26, letterSpacing: -0.8 }}>Sign in</h1>
        {!ready ? (
          <p className="muted">Loading…</p>
        ) : !configured ? (
          <>
            <p className="muted">Accounts aren&apos;t enabled yet. Try it with sample data.</p>
            <Link className="btn primary block" href="/app?demo=1">Try with sample data</Link>
          </>
        ) : (
          <div className="stack">
            {isConnected ? (
              <button className="btn primary block" type="button" disabled={busy} onClick={() => void walletLogin()}>
                {busy ? "Check your wallet…" : "Sign in with wallet"}
              </button>
            ) : (
              <div className="row" style={{ justifyContent: "center" }}><ConnectButton label="Connect wallet" /></div>
            )}

            {emailLogin && (
              <>
                <p className="small muted" style={{ textAlign: "center", margin: 0 }}>or</p>
                {!sent ? (
                  <form className="stack" onSubmit={sendCode}>
                    <label className="field">
                      <span>Email</span>
                      <input type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@shop.ng" />
                    </label>
                    <button className="btn block" disabled={busy}>Email me a code</button>
                  </form>
                ) : (
                  <form className="stack" onSubmit={verifyCode}>
                    <label className="field">
                      <span>Code sent to {email}</span>
                      <input inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))} placeholder="123456" />
                    </label>
                    <button className="btn primary block" disabled={busy || code.length !== 6}>Sign in</button>
                    <button type="button" className="link-btn small" onClick={() => { setSent(false); setCode(""); }}>Use a different email</button>
                  </form>
                )}
              </>
            )}
          </div>
        )}
        {error && <div className="notice error" style={{ marginTop: 12 }}>{error}</div>}
      </section>
      <p className="small muted" style={{ textAlign: "center" }}>
        <Link href="/app?demo=1">Try with sample data</Link> · <Link href="/supplier">Suppliers</Link>
      </p>
    </main>
  );
}
