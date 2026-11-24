"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { getAddress, isAddress } from "viem";
import { useApp } from "@/components/AppContext.tsx";
import { errorText } from "@/components/ui.tsx";
import { formatNaira, isNaira } from "@/lib/money.ts";
import type { Product, Supplier } from "@/lib/types.ts";

const emptyProduct = { name: "", unit: "", unitPrice: "", deliveryFee: "0", stock: "", deliveryDays: "", deliveryAreas: "" };

export default function SupplierPortal() {
  const { ready, mode, user, store } = useApp();
  const [mine, setMine] = useState<Supplier[]>([]);
  const [selected, setSelected] = useState<string>("");
  const [products, setProducts] = useState<Product[]>([]);
  const [profile, setProfile] = useState({ name: "", location: "", walletAddress: "", contact: "" });
  const [form, setForm] = useState(emptyProduct);
  const [editing, setEditing] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ text: string; error?: boolean } | null>(null);

  const needsLogin = mode === "live" && !user;

  const load = useCallback(async () => {
    if (needsLogin) return;
    const list = await store.listMySuppliers();
    setMine(list);
    const id = selected && list.some((s) => s.id === selected) ? selected : list[0]?.id ?? "";
    setSelected(id);
    setProducts(id ? await store.listProducts(id) : []);
  }, [needsLogin, selected, store]);

  useEffect(() => { if (ready) load().catch((e) => setMsg({ text: errorText(e), error: true })); }, [ready, load]);

  const current = mine.find((s) => s.id === selected);
  useEffect(() => {
    if (current) setProfile({ name: current.name, location: current.location, walletAddress: current.walletAddress, contact: current.contact ?? "" });
  }, [current]);

  async function saveProfile(e: React.FormEvent) {
    e.preventDefault();
    try {
      if (!profile.name.trim()) throw new Error("Business name is required.");
      if (profile.walletAddress && !isAddress(profile.walletAddress)) throw new Error("Wallet address is not valid.");
      const saved = await store.saveSupplier({
        ...(current ? { id: current.id } : {}),
        name: profile.name.trim(),
        location: profile.location.trim(),
        walletAddress: profile.walletAddress ? getAddress(profile.walletAddress) : "",
        currency: "cNGN",
        ...(profile.contact.trim() ? { contact: profile.contact.trim() } : {}),
      });
      setSelected(saved.id);
      setMsg({ text: "Supplier profile saved." });
      await load();
    } catch (e) {
      setMsg({ text: errorText(e), error: true });
    }
  }

  async function saveProduct(e: React.FormEvent) {
    e.preventDefault();
    try {
      if (!current) throw new Error("Save your supplier profile first.");
      const unitPrice = form.unitPrice.replace(/[₦,\s]/g, "");
      const deliveryFee = (form.deliveryFee || "0").replace(/[₦,\s]/g, "");
      if (!form.name.trim()) throw new Error("Product name is required.");
      if (!isNaira(unitPrice) || !isNaira(deliveryFee)) throw new Error("Prices must be naira amounts, e.g. 36500.");
      const stock = Number(form.stock);
      const deliveryDays = Number(form.deliveryDays);
      if (!Number.isInteger(stock) || stock < 0) throw new Error("Stock must be a whole number.");
      if (!Number.isInteger(deliveryDays) || deliveryDays < 0) throw new Error("Delivery days must be a whole number.");
      const deliveryAreas = form.deliveryAreas.split(",").map((a) => a.trim()).filter(Boolean);
      if (deliveryAreas.length === 0) throw new Error('Add at least one delivery area, or "nationwide".');
      await store.saveProduct({
        ...(editing ? { id: editing } : {}),
        supplierId: current.id,
        name: form.name.trim(),
        unit: form.unit.trim() || "unit",
        unitPrice,
        deliveryFee,
        stock,
        deliveryDays,
        deliveryAreas,
      });
      setForm(emptyProduct);
      setEditing(null);
      setMsg({ text: editing ? "Product updated." : "Product listed. Buyers' agents will see it in their next search." });
      await load();
    } catch (e) {
      setMsg({ text: errorText(e), error: true });
    }
  }

  function edit(p: Product) {
    setEditing(p.id);
    setForm({ name: p.name, unit: p.unit, unitPrice: p.unitPrice, deliveryFee: p.deliveryFee, stock: String(p.stock), deliveryDays: String(p.deliveryDays), deliveryAreas: p.deliveryAreas.join(", ") });
    window.scrollTo({ top: document.body.scrollHeight, behavior: "smooth" });
  }

  return (
    <>
      <header className="topbar">
        <Link className="brand" href="/"><span className="brand-mark">E</span><span>emporos</span></Link>
        <span className="badge">Supplier portal{mode === "demo" ? " · demo" : ""}</span>
      </header>
      <main className="shell">
        <section className="page-head">
          <h1>Sell to shops through Emporos</h1>
          <p>List what you stock, your price and how fast you deliver. Buyers&apos; agents compare you automatically and pay you in cNGN.</p>
        </section>

        {needsLogin ? (
          <section className="panel">
            <p>Sign in to manage your listings.</p>
            <Link className="btn primary block" href="/login?next=/supplier">Sign in</Link>
          </section>
        ) : (
          <>
            {msg && <div className={`notice ${msg.error ? "error" : "ok"}`}>{msg.text}</div>}

            {mine.length > 1 && (
              <label className="field" style={{ marginTop: 14 }}>
                <span>Business</span>
                <select value={selected} onChange={(e) => setSelected(e.target.value)}>
                  {mine.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </label>
            )}

            <section className="panel">
              <div className="row between">
                <h2>{current ? "Your supplier profile" : "Create your supplier profile"}</h2>
                {current && (current.verified ? <span className="badge green">✓ Verified</span> : <span className="badge amber">Awaiting verification</span>)}
              </div>
              <form className="stack" onSubmit={(e) => void saveProfile(e)} style={{ marginTop: 10 }}>
                <div className="grid-2">
                  <label className="field"><span>Business name</span><input value={profile.name} onChange={(e) => setProfile({ ...profile, name: e.target.value })} required /></label>
                  <label className="field"><span>Location</span><input value={profile.location} onChange={(e) => setProfile({ ...profile, location: e.target.value })} placeholder="Lagos" /></label>
                </div>
                <label className="field"><span>cNGN payout wallet (Celo)</span><input className="mono" value={profile.walletAddress} onChange={(e) => setProfile({ ...profile, walletAddress: e.target.value.trim() })} placeholder="0x…" /></label>
                <label className="field"><span>Contact</span><input value={profile.contact} onChange={(e) => setProfile({ ...profile, contact: e.target.value })} placeholder="Phone or email for buyers" /></label>
                <button className="btn primary block">Save profile</button>
                <p className="small muted">Double-check your wallet. Payments to a wrong address cannot be reversed.</p>
              </form>
            </section>

            {current && (
              <>
                <section className="panel">
                  <h2>Your products ({products.length})</h2>
                  <ul className="list" style={{ marginTop: 10 }}>
                    {products.map((p) => (
                      <li key={p.id} className="item">
                        <div className="row between">
                          <span className="item-title">{p.name}</span>
                          <strong>{formatNaira(p.unitPrice)}<span className="small muted">/{p.unit}</span></strong>
                        </div>
                        <div className="small muted">{p.stock} in stock · {p.deliveryDays}d · {formatNaira(p.deliveryFee)} delivery · {p.deliveryAreas.join(", ")}</div>
                        <div className="row" style={{ marginTop: 8 }}>
                          <button className="btn small" onClick={() => edit(p)}>Edit</button>
                          <button className="btn small danger" onClick={() => void store.deleteProduct(p.id).then(load)}>Remove</button>
                        </div>
                      </li>
                    ))}
                    {products.length === 0 && <li className="muted small">No products yet.</li>}
                  </ul>
                </section>

                <section className="panel">
                  <h2>{editing ? "Edit product" : "Add a product"}</h2>
                  <form className="stack" onSubmit={(e) => void saveProduct(e)} style={{ marginTop: 10 }}>
                    <label className="field"><span>Product</span><input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Parboiled rice 50kg bag" required /></label>
                    <div className="grid-2">
                      <label className="field"><span>Unit</span><input value={form.unit} onChange={(e) => setForm({ ...form, unit: e.target.value })} placeholder="50kg bag" /></label>
                      <label className="field"><span>Price per unit (₦)</span><input inputMode="decimal" value={form.unitPrice} onChange={(e) => setForm({ ...form, unitPrice: e.target.value })} placeholder="36500" required /></label>
                      <label className="field"><span>In stock</span><input inputMode="numeric" value={form.stock} onChange={(e) => setForm({ ...form, stock: e.target.value })} placeholder="120" required /></label>
                      <label className="field"><span>Delivery days</span><input inputMode="numeric" value={form.deliveryDays} onChange={(e) => setForm({ ...form, deliveryDays: e.target.value })} placeholder="2" required /></label>
                      <label className="field"><span>Delivery fee per order (₦)</span><input inputMode="decimal" value={form.deliveryFee} onChange={(e) => setForm({ ...form, deliveryFee: e.target.value })} /></label>
                      <label className="field"><span>Delivers to</span><input value={form.deliveryAreas} onChange={(e) => setForm({ ...form, deliveryAreas: e.target.value })} placeholder="Lagos, Ogun or nationwide" /></label>
                    </div>
                    <button className="btn primary block">{editing ? "Save changes" : "List product"}</button>
                    {editing && <button type="button" className="btn block" onClick={() => { setEditing(null); setForm(emptyProduct); }}>Cancel edit</button>}
                  </form>
                </section>
              </>
            )}
          </>
        )}
      </main>
    </>
  );
}
