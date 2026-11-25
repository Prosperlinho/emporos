"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { getAddress, isAddress } from "viem";
import { useApp } from "@/components/AppContext.tsx";
import { errorText } from "@/components/ui.tsx";
import { addressUrl, shortAddress } from "@/lib/chain/config.ts";
import type { Business, Product, Supplier, TokenSymbol } from "@/lib/types.ts";

export default function SuppliersPage() {
  const { store, business, setBusiness, mode, user } = useApp();
  // Demo users can try verification; in live mode only admins (ADMIN_WALLETS / ADMIN_EMAILS) can.
  const canVerify = mode === "demo" || Boolean(user?.isAdmin);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [message, setMessage] = useState<{ text: string; error?: boolean } | null>(null);
  const [form, setForm] = useState({ name: "", location: "", walletAddress: "", currency: "cNGN" as TokenSymbol, contact: "" });

  const load = useCallback(async () => {
    try {
      const [s, p] = await Promise.all([store.listSuppliers(), store.listProducts()]);
      setSuppliers(s);
      setProducts(p);
    } catch (e) {
      setMessage({ text: errorText(e), error: true });
    }
  }, [store]);

  useEffect(() => { void load(); }, [load]);

  async function saveBusiness(next: Business, text: string) {
    try {
      setBusiness(await store.saveBusiness(next));
      setMessage({ text });
    } catch (e) {
      setMessage({ text: errorText(e), error: true });
    }
  }

  async function toggleVerified(supplier: Supplier) {
    try {
      await store.setSupplierVerified(supplier.id, !supplier.verified);
      setMessage({ text: `${supplier.name} ${supplier.verified ? "unverified" : "verified"}.` });
      await load();
    } catch (e) {
      setMessage({ text: errorText(e), error: true });
    }
  }

  async function toggleApproved(supplier: Supplier) {
    if (!business) return;
    const ids = new Set(business.rules.approvedSupplierIds);
    const approving = !ids.has(supplier.id);
    if (approving) ids.add(supplier.id); else ids.delete(supplier.id);
    await saveBusiness({ ...business, rules: { ...business.rules, approvedSupplierIds: [...ids] } }, approving ? `${supplier.name} approved.` : `${supplier.name} removed from approved list.`);
  }

  async function toggleAllowlist(supplier: Supplier) {
    if (!business?.agent || !supplier.walletAddress) return;
    const wallet = supplier.walletAddress.toLowerCase();
    const has = business.agent.allowlist.some((a) => a.toLowerCase() === wallet);
    const allowlist = has
      ? business.agent.allowlist.filter((a) => a.toLowerCase() !== wallet)
      : [...business.agent.allowlist, supplier.walletAddress as `0x${string}`];
    await saveBusiness({ ...business, agent: { ...business.agent, allowlist } }, has ? "Removed from agent allowlist." : "Added to agent allowlist.");
  }

  async function addSupplier(e: React.FormEvent) {
    e.preventDefault();
    setMessage(null);
    try {
      if (!form.name.trim()) throw new Error("Supplier name is required.");
      if (form.walletAddress && !isAddress(form.walletAddress)) throw new Error("That wallet address is not valid.");
      await store.saveSupplier({
        name: form.name.trim(),
        location: form.location.trim(),
        walletAddress: form.walletAddress ? getAddress(form.walletAddress) : "",
        currency: form.currency,
        ...(form.contact.trim() ? { contact: form.contact.trim() } : {}),
      });
      setForm({ name: "", location: "", walletAddress: "", currency: "cNGN", contact: "" });
      setMessage({ text: "Supplier added. Confirm their wallet before approving." });
      await load();
    } catch (e) {
      setMessage({ text: errorText(e), error: true });
    }
  }

  const approved = new Set(business?.rules.approvedSupplierIds ?? []);
  const allow = new Set((business?.agent?.allowlist ?? []).map((a) => a.toLowerCase()));

  return (
    <>
      <section className="page-head">
        <h1>Suppliers</h1>
        <p>Approved suppliers can be auto-paid.</p>
      </section>
      {message && <div className={`notice ${message.error ? "error" : "ok"}`}>{message.text}</div>}

      <ul className="list" style={{ marginTop: 14 }}>
        {suppliers.map((s) => {
          const count = products.filter((p) => p.supplierId === s.id).length;
          const onAllowlist = Boolean(s.walletAddress && allow.has(s.walletAddress.toLowerCase()));
          return (
            <li key={s.id} className="item">
              <div className="row between">
                <span className="item-title">{s.name}</span>
                {s.verified ? <span className="badge green">✓ Verified</span> : <span className="badge amber">Unverified</span>}
              </div>
              <div className="small muted">
                {s.location || "—"} · {s.currency} · {count} product{count === 1 ? "" : "s"}
                {s.contact ? ` · ${s.contact}` : ""}
              </div>
              <div className="small mono" style={{ marginTop: 4 }}>
                {s.walletAddress ? (
                  mode === "demo" ? `${shortAddress(s.walletAddress)} (placeholder)` : <a href={addressUrl(s.walletAddress)} target="_blank" rel="noreferrer">{shortAddress(s.walletAddress)} ↗</a>
                ) : (
                  <span style={{ color: "var(--amber)" }}>No payout wallet yet</span>
                )}
              </div>
              {business && (
                <div className="row" style={{ marginTop: 10 }}>
                  <label className="check small">
                    <input type="checkbox" checked={approved.has(s.id)} onChange={() => void toggleApproved(s)} />
                    Approved supplier
                  </label>
                  {business.agent && s.walletAddress && (
                    <label className="check small">
                      <input type="checkbox" checked={onAllowlist} onChange={() => void toggleAllowlist(s)} />
                      Agent may pay
                    </label>
                  )}
                  {canVerify && (
                    <label className="check small">
                      <input type="checkbox" checked={s.verified} onChange={() => void toggleVerified(s)} />
                      Verified (admin)
                    </label>
                  )}
                </div>
              )}
            </li>
          );
        })}
      </ul>

      <section className="panel">
        <h2>Add a supplier</h2>
        <p className="sub">
          Or send suppliers to <Link href="/supplier">the supplier portal</Link> to list their own products and prices.
        </p>
        <form className="stack" onSubmit={(e) => void addSupplier(e)}>
          <div className="grid-2">
            <label className="field"><span>Name</span><input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required /></label>
            <label className="field"><span>Location</span><input value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} placeholder="Lagos" /></label>
          </div>
          <label className="field"><span>Payout wallet (Celo)</span><input value={form.walletAddress} onChange={(e) => setForm({ ...form, walletAddress: e.target.value.trim() })} placeholder="0x…" className="mono" /></label>
          <div className="grid-2">
            <label className="field">
              <span>Currency</span>
              <select value={form.currency} onChange={(e) => setForm({ ...form, currency: e.target.value as TokenSymbol })}>
                <option value="cNGN">cNGN</option>
                <option value="USDT" disabled>USD₮ (payouts not supported yet)</option>
              </select>
            </label>
            <label className="field"><span>Contact</span><input value={form.contact} onChange={(e) => setForm({ ...form, contact: e.target.value })} placeholder="Phone or email" /></label>
          </div>
          <button className="btn primary block" type="submit">Add supplier</button>
          <p className="small muted">New suppliers start unverified.</p>
        </form>
      </section>
    </>
  );
}
