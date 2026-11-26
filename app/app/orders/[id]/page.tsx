"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { useApp } from "@/components/AppContext.tsx";
import { useCeloPublicClient } from "@/components/hooks.ts";
import { errorText, OrderTimeline, StatusBadge, StepList, TxLink } from "@/components/ui.tsx";
import { usePayOrder } from "@/components/usePayOrder.ts";
import { addressUrl, liveReadiness, shortAddress } from "@/lib/chain/config.ts";
import { formatNaira } from "@/lib/money.ts";
import { setupComplete } from "@/lib/setup.ts";
import type { Order } from "@/lib/types.ts";

export default function ReceiptPage() {
  const { id } = useParams<{ id: string }>();
  const { store, mode, business } = useApp();
  const publicClient = useCeloPublicClient();
  const { pay, steps, running, ownerConnected } = usePayOrder();
  const [order, setOrder] = useState<Order | null | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ text: string; error?: boolean } | null>(null);

  useEffect(() => {
    store.getOrder(id).then(setOrder, (e) => setMessage({ text: errorText(e), error: true }));
  }, [id, store]);

  if (order === undefined) return <p className="muted" style={{ marginTop: 24 }}>Loading…</p>;
  if (order === null) return <div className="notice error" style={{ marginTop: 24 }}>Order not found.</div>;

  const o = order;
  const canPay = o.status === "awaiting_approval" || o.status === "quoted" || o.status === "failed";

  async function act(fn: () => Promise<Order>, done: string) {
    setBusy(true);
    setMessage(null);
    try {
      setOrder(await fn());
      setMessage({ text: done });
    } catch (e) {
      setMessage({ text: errorText(e), error: true });
      setOrder(await store.getOrder(o.id));
    } finally {
      setBusy(false);
    }
  }

  async function recheck() {
    if (!publicClient || !o.paymentTxHash) return;
    await act(async () => {
      const receipt = await publicClient.getTransactionReceipt({ hash: o.paymentTxHash as `0x${string}` }).catch(() => null);
      if (!receipt) throw new Error("Still not found on-chain. Check Celoscan before doing anything else.");
      if (receipt.status !== "success") return store.updateOrder(o.id, { status: "failed", error: "The supplier transfer reverted on-chain." });
      return store.updateOrder(o.id, { status: "paid", paidAt: new Date().toISOString(), error: "" });
    }, "Checked on-chain.");
  }

  return (
    <>
      <section className="page-head">
        <Link href="/app/orders" className="small">← Orders</Link>
        <h1 style={{ marginTop: 8 }}>Receipt</h1>
        <div className="row"><StatusBadge status={o.status} /> <span className="small muted mono">{o.id}</span></div>
        <OrderTimeline status={o.status} />
      </section>

      {message && <div className={`notice ${message.error ? "error" : "ok"}`}>{message.text}</div>}
      {o.error && o.status !== "paid" && o.status !== "delivered" && <div className="notice error" style={{ marginTop: 8 }}>{o.error}</div>}
      {o.simulated && <div className="notice warn" style={{ marginTop: 8 }}>Sample order. No real payment was made.</div>}

      <section className="panel">
        <div className="row between">
          <div>
            <div className="item-title">{o.request.quantity} × {o.chosen.itemName}</div>
            <div className="small muted">{o.chosen.supplierName}</div>
          </div>
          <div className="big">{formatNaira(o.amount)}</div>
        </div>
        <dl className="kv" style={{ marginTop: 14 }}>
          <dt>Unit price</dt><dd>{formatNaira(o.chosen.unitPrice)} / {o.chosen.unit}</dd>
          <dt>Delivery fee</dt><dd>{formatNaira(o.chosen.deliveryFee)}</dd>
          <dt>Deliver to</dt><dd>{o.request.deliveryArea}, within {o.request.deadlineDays} day(s)</dd>
          <dt>Promised</dt><dd>{o.chosen.deliveryDays} day(s)</dd>
          <dt>Budget</dt><dd>{formatNaira(o.request.maxBudget)}</dd>
          <dt>Ordered</dt><dd>{new Date(o.createdAt).toLocaleString("en-NG")}</dd>
          {o.paidAt && <><dt>Paid</dt><dd>{new Date(o.paidAt).toLocaleString("en-NG")}</dd></>}
          {o.deliveredAt && <><dt>Delivered</dt><dd>{new Date(o.deliveredAt).toLocaleString("en-NG")}</dd></>}
        </dl>
      </section>

      <section className="panel">
        <h2>Payment</h2>
        <dl className="kv" style={{ marginTop: 10 }}>
          <dt>Paid by</dt><dd>{o.paidBy === "agent" ? "Agent wallet (auto)" : o.paidBy === "owner" ? "You (approved)" : "Not paid"}</dd>
          {o.payer && <><dt>From</dt><dd className="mono">{o.simulated ? o.payer : <a href={addressUrl(o.payer)} target="_blank" rel="noreferrer">{shortAddress(o.payer)} ↗</a>}</dd></>}
          <dt>To</dt><dd className="mono">{o.chosen.supplierWallet ? shortAddress(o.chosen.supplierWallet) : "—"}</dd>
          <dt>cNGN transfer</dt><dd><TxLink hash={o.paymentTxHash} simulated={o.simulated} /></dd>
          {o.fx && (
            <>
              <dt>FX rate</dt><dd>1 USD₮ = {o.fx.rate} cNGN ({o.fx.provider})</dd>
              <dt>Swapped</dt><dd>{o.fx.sellAmountUsdt} USD₮ → {o.fx.buyAmountCngn} cNGN</dd>
              {o.fx.approveTxHash && <><dt>Approve tx</dt><dd><TxLink hash={o.fx.approveTxHash} simulated={o.simulated} /></dd></>}
              {o.fx.swapTxHash && <><dt>Swap tx</dt><dd><TxLink hash={o.fx.swapTxHash} simulated={o.simulated} /></dd></>}
            </>
          )}
        </dl>
        {o.status === "paying" && o.paymentTxHash && !o.simulated && (
          <button className="btn block" style={{ marginTop: 12 }} disabled={busy} onClick={() => void recheck()}>Re-check on Celo</button>
        )}
      </section>

      <section className="panel">
        <h2>Why {o.chosen.supplierName}</h2>
        <ul className="reasons">{o.reasons.map((r) => <li key={r}>{r}</li>)}</ul>
        <h3 className="small muted" style={{ margin: "14px 0 6px" }}>Rule check</h3>
        {o.ruleCheck.withinRules ? (
          <p className="small" style={{ color: "var(--green)" }}>Within all spending rules.</p>
        ) : (
          <ul className="reasons">{o.ruleCheck.violations.map((v) => <li key={v}>{v}</li>)}</ul>
        )}
        {o.alternatives.length > 0 && (
          <>
            <h3 className="small muted" style={{ margin: "14px 0 6px" }}>Other quotes considered</h3>
            <table className="simple">
              <thead><tr><th>Supplier</th><th>Total</th><th>Result</th></tr></thead>
              <tbody>
                {o.alternatives.map((q) => (
                  <tr key={q.productId}>
                    <td>{q.supplierName}</td>
                    <td>{formatNaira(q.total)}</td>
                    <td className="small">{q.eligible ? `eligible, score ${q.score}` : q.failures.join("; ")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        )}
      </section>

      {(running || steps.some((s) => s.status !== "pending")) && (
        <section className="panel"><StepList steps={steps} simulated={mode === "demo"} /></section>
      )}

      <section className="stack" style={{ marginTop: 14 }}>
        {canPay && (
          <>
            <button
              className="btn primary block"
              disabled={busy || running || (mode === "live" && (!ownerConnected || liveReadiness().length > 0 || !setupComplete(business)))}
              onClick={() => void act(() => pay(o, "owner"), "Payment confirmed.")}
            >
              Approve &amp; pay {formatNaira(o.amount)}
            </button>
            {mode === "live" && !ownerConnected && <p className="small muted">Connect your wallet to approve.</p>}
            <button className="btn block" disabled={busy || running} onClick={() => void act(() => store.updateOrder(o.id, { status: "cancelled" }), "Order cancelled.")}>
              Cancel order
            </button>
          </>
        )}
        {o.status === "paid" && (
          <button
            className="btn primary block"
            disabled={busy}
            onClick={() => void act(() => store.updateOrder(o.id, { status: "delivered", deliveredAt: new Date().toISOString() }), "Marked as delivered.")}
          >
            ✓ Mark delivered
          </button>
        )}
        <button className="btn block" onClick={() => window.print()}>Print / save receipt</button>
      </section>
    </>
  );
}
