"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useApp } from "@/components/AppContext.tsx";
import { LogoMark } from "@/components/Logo.tsx";
import { errorText } from "@/components/ui.tsx";
import { formatNaira } from "@/lib/money.ts";
import { createAccountWithPasskey, passkeysSupported } from "@/lib/passkey-client.ts";
import { DEFAULT_RULES } from "@/lib/rules.ts";

const LIMITS = ["100000", "500000", "1000000"];

/** New shops: three short screens, then straight into the app. */
export default function StartPage() {
  const { ready, configured, user, business, setMode, refreshUser, refreshBusiness, setBusiness } = useApp();
  const router = useRouter();
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [name, setName] = useState("");
  const [area, setArea] = useState("");
  const [limit, setLimit] = useState("500000");
  const [custom, setCustom] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (ready && user && business) router.replace("/app");
  }, [ready, user, business, router]);

  const weekly = limit === "custom" ? custom.replace(/\D/g, "") : limit;

  async function finish() {
    setBusy(true);
    setError("");
    try {
      if (!user) await createAccountWithPasskey(name);
      setMode("live");
      await refreshUser();
      const saved = await (await import("@/lib/data/http-store.ts")).httpStore.saveBusiness({
        name: name.trim(),
        location: area.trim(),
        defaultCurrency: "cNGN",
        rulesSavedAt: new Date().toISOString(),
        rules: { ...DEFAULT_RULES, maxPerOrder: weekly, periodCap: weekly, period: "weekly", requireApprovedSupplier: true },
      });
      setBusiness(saved);
      void refreshBusiness();
      router.replace("/app");
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  }

  if (ready && !configured) {
    return (
      <main className="shell start">
        <p className="muted">Accounts aren&apos;t open yet. <Link href="/app?demo=1">Try it with sample data</Link>.</p>
      </main>
    );
  }

  return (
    <main className="shell start">
      <Link className="brand" href="/" aria-label="Emporos home"><LogoMark size={28} /><span>emporos</span></Link>
      <div className="timeline" aria-label={`Step ${step} of 3`}>
        {[1, 2, 3].map((n) => <span key={n} className={step >= n ? "on" : ""} />)}
      </div>

      {step === 1 && (
        <form className="start-card" onSubmit={(e) => { e.preventDefault(); if (name.trim()) setStep(2); }}>
          <h1>What&apos;s your shop called?</h1>
          <label className="field"><span>Shop name</span><input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="Mama Tunde Provisions" maxLength={120} required /></label>
          <label className="field"><span>Where is it?</span><input value={area} onChange={(e) => setArea(e.target.value)} placeholder="Surulere, Lagos" maxLength={120} /></label>
          <button className="btn primary block" disabled={!name.trim()}>Continue</button>
        </form>
      )}

      {step === 2 && (
        <form className="start-card" onSubmit={(e) => { e.preventDefault(); if (Number(weekly) > 0) setStep(3); }}>
          <h1>How much can Emporos spend each week without asking you?</h1>
          <p className="muted">Anything above this, Emporos asks you first. You can change it any time.</p>
          <div className="choice">
            {LIMITS.map((value) => (
              <button type="button" key={value} className={`choice-item ${limit === value ? "on" : ""}`} onClick={() => setLimit(value)}>
                {formatNaira(value)}
              </button>
            ))}
            <button type="button" className={`choice-item ${limit === "custom" ? "on" : ""}`} onClick={() => setLimit("custom")}>Other</button>
          </div>
          {limit === "custom" && (
            <label className="field"><span>Weekly limit (₦)</span><input autoFocus inputMode="numeric" value={custom} onChange={(e) => setCustom(e.target.value.replace(/\D/g, ""))} placeholder="250000" /></label>
          )}
          <div className="row">
            <button type="button" className="btn" onClick={() => setStep(1)}>Back</button>
            <button className="btn primary" style={{ flex: 1 }} disabled={!(Number(weekly) > 0)}>Continue</button>
          </div>
        </form>
      )}

      {step === 3 && (
        <div className="start-card">
          <h1>{user ? "Save your shop" : "Secure your account"}</h1>
          <p className="muted">
            {user
              ? "You're signed in. We'll save your shop and take you in."
              : "No password. You'll sign in with your phone's fingerprint or Face ID."}
          </p>
          <dl className="kv">
            <dt>Shop</dt><dd>{name}{area ? `, ${area}` : ""}</dd>
            <dt>Weekly limit</dt><dd>{Number(weekly) > 0 ? formatNaira(weekly) : "—"}</dd>
          </dl>
          {!user && !passkeysSupported() && (
            <div className="notice warn">This browser can&apos;t use fingerprint sign-in. Open Emporos in Chrome or Safari on your phone, or <Link href="/login">sign in another way</Link>.</div>
          )}
          {error && <div className="notice error">{error}</div>}
          <div className="row">
            <button type="button" className="btn" onClick={() => setStep(2)} disabled={busy}>Back</button>
            <button type="button" className="btn primary" style={{ flex: 1 }} disabled={busy || (!user && !passkeysSupported())} onClick={() => void finish()}>
              {busy ? "One moment…" : user ? "Save and continue" : "Continue with fingerprint or Face ID"}
            </button>
          </div>
        </div>
      )}

      <p className="small muted" style={{ textAlign: "center", marginTop: 18 }}>
        Already have an account? <Link href="/login">Sign in</Link>
      </p>
    </main>
  );
}
