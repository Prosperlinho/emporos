"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { formatUnits } from "viem";
import { useApp } from "@/components/AppContext.tsx";
import { useBalances } from "@/components/hooks.ts";
import { errorText } from "@/components/ui.tsx";

export default function AddMoneyPage() {
  const { mode, business, store, setBusiness } = useApp();
  const address = business?.altanaWallet as `0x${string}` | undefined;
  const { data: balances, refetch } = useBalances(address);
  const [qr, setQr] = useState("");
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ text: string; error?: boolean } | null>(null);

  useEffect(() => {
    if (!address) return;
    void import("qrcode").then((QR) => QR.toDataURL(address, { margin: 1, width: 220 })).then(setQr, () => setQr(""));
  }, [address]);

  async function createBalance() {
    if (!business) return;
    setBusy(true);
    setMessage({ text: "Follow your phone's fingerprint or Face ID prompt…" });
    try {
      const { setUpAltanaWallet } = await import("@/lib/altana.ts");
      const altanaWallet = await setUpAltanaWallet();
      setBusiness(await store.saveBusiness({ ...business, altanaWallet }));
      setMessage({ text: "Your Emporos balance is ready." });
    } catch (e) {
      setMessage({ text: errorText(e), error: true });
    } finally {
      setBusy(false);
    }
  }

  async function copy() {
    if (!address) return;
    await navigator.clipboard.writeText(address).catch(() => undefined);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  const naira = balances?.cngn != null ? Number(formatUnits(balances.cngn, balances.cngnDecimals ?? 6)) : null;
  const fees = balances ? Number(formatUnits(balances.usdt, 6)) : null;

  if (mode === "demo") {
    return (
      <section className="page-head">
        <h1>Add money</h1>
        <p>With sample data there&apos;s nothing to add. Your sample balance is already funded. <Link href="/app">Back to Buy</Link></p>
      </section>
    );
  }

  return (
    <>
      <section className="page-head">
        <h1>Add money</h1>
        <p>Your Emporos balance pays suppliers. Top it up with naira (cNGN).</p>
      </section>

      {message && <div className={`notice ${message.error ? "error" : "ok"}`}>{message.text}</div>}

      {!address ? (
        <section className="panel">
          <h2>Create your Emporos balance</h2>
          <p className="sub">It takes a few seconds and is protected by your fingerprint or Face ID. No seed phrase to write down.</p>
          <button className="btn primary block" disabled={busy || !business} onClick={() => void createBalance()}>
            {busy ? "One moment…" : "Create my Emporos balance"}
          </button>
        </section>
      ) : (
        <>
          <section className="panel accent">
            <div className="row between">
              <div>
                <div className="small muted">Balance</div>
                <div className="big">{naira === null ? "…" : `₦${naira.toLocaleString("en-NG", { maximumFractionDigits: 2 })}`}</div>
              </div>
              <button className="btn small" onClick={() => void refetch()}>Refresh</button>
            </div>
            <div className="small muted" style={{ marginTop: 6 }}>
              Fee credit: {fees === null ? "…" : `$${fees.toFixed(2)}`}{fees !== null && fees < 0.3 ? " (add about $1 of USD₮ so payments can go through)" : ""}
            </div>
          </section>

          <section className="panel">
            <h2>Your account number</h2>
            <p className="sub">Send cNGN on the Celo network to this address. Scan it or copy it.</p>
            <div className="add-money">
              {qr ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={qr} alt="QR code of your Emporos account address" width={220} height={220} />
              ) : null}
              <div className="mono add-address">{address}</div>
              <button className="btn primary block" onClick={() => void copy()}>{copied ? "Copied ✓" : "Copy account number"}</button>
            </div>
          </section>

          <section className="panel">
            <h2>Where to get cNGN</h2>
            <ul className="reasons">
              <li>Buy cNGN with naira from an exchange or app that supports cNGN on Celo, then send it to the account number above.</li>
              <li>Make sure the network is <strong>Celo</strong>. Money sent on another network won&apos;t arrive.</li>
              <li>Also send about <strong>$1 of USD₮</strong> once. It covers network fees for many payments.</li>
            </ul>
            <p className="small muted" style={{ marginTop: 10 }}>Paying in by bank transfer is coming.</p>
          </section>
        </>
      )}
    </>
  );
}
