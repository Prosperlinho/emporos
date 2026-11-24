"use client";

import { useEffect, useState } from "react";
import { useAccount } from "wagmi";
import { useApp } from "@/components/AppContext.tsx";
import { Balances } from "@/components/Balances.tsx";
import { useCeloPublicClient, useOwnerSigner } from "@/components/hooks.ts";
import { errorText, TxLink } from "@/components/ui.tsx";
import { altanaProvider, forgetLocalKey, hasLocalKey, localSessionKeyProvider, providerFor } from "@/lib/agent-wallet.ts";
import { addressUrl, IDENTITY_REGISTRY, shortAddress } from "@/lib/chain/config.ts";
import { registerAgent } from "@/lib/erc8004.ts";
import { formatNaira, isNaira, toKobo } from "@/lib/money.ts";
import { agentPolicyActive, DEFAULT_RULES } from "@/lib/rules.ts";
import type { Business, SpendingRules, Supplier } from "@/lib/types.ts";

type Msg = { text: string; error?: boolean } | null;

export default function SettingsPage() {
  const { store, business, setBusiness, mode, user, signOut } = useApp();
  const { address: ownerAddress } = useAccount();
  const ownerSigner = useOwnerSigner();
  const publicClient = useCeloPublicClient();

  const [profile, setProfile] = useState({ name: "", location: "" });
  const [rules, setRules] = useState<SpendingRules>(DEFAULT_RULES);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [agentForm, setAgentForm] = useState({ spendCap: "500000", days: "30" });
  const [manualAgentId, setManualAgentId] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<Record<string, Msg>>({});

  useEffect(() => {
    if (business) {
      setProfile({ name: business.name, location: business.location });
      setRules(business.rules);
    }
  }, [business]);
  useEffect(() => { store.listSuppliers().then(setSuppliers, () => setSuppliers([])); }, [store]);

  const say = (key: string, text: string, error = false) => setMsg((m) => ({ ...m, [key]: { text, error } }));

  async function save(next: Omit<Business, "id"> & { id?: string }, key: string, text: string) {
    setBusy(true);
    try {
      setBusiness(await store.saveBusiness(next));
      say(key, text);
    } catch (e) {
      say(key, errorText(e), true);
    } finally {
      setBusy(false);
    }
  }

  function base(): Omit<Business, "id"> & { id?: string } {
    return business ?? { name: profile.name, location: profile.location, defaultCurrency: "cNGN", rules };
  }

  async function saveProfile(e: React.FormEvent) {
    e.preventDefault();
    if (!profile.name.trim()) return say("profile", "Business name is required.", true);
    await save(
      { ...base(), name: profile.name.trim(), location: profile.location.trim(), ...(ownerAddress ? { ownerWallet: ownerAddress } : {}) },
      "profile",
      "Business profile saved.",
    );
  }

  async function saveRules(e: React.FormEvent) {
    e.preventDefault();
    if (!isNaira(rules.maxPerOrder) || !isNaira(rules.periodCap)) return say("rules", "Limits must be naira amounts, e.g. 500000.", true);
    if (toKobo(rules.maxPerOrder) > toKobo(rules.periodCap)) return say("rules", `The per-order limit can't be above the ${rules.period} cap.`, true);
    if (!business) return say("rules", "Save your business profile first.", true);
    await save({ ...business, rules }, "rules", "Spending rules saved.");
  }

  async function createAgent() {
    if (!business) return say("agent", "Save your business profile first.", true);
    if (!isNaira(agentForm.spendCap)) return say("agent", "Spend cap must be a naira amount.", true);
    const days = Number(agentForm.days);
    if (!Number.isInteger(days) || days < 1 || days > 365) return say("agent", "Expiry must be 1–365 days.", true);
    const allowlist = suppliers
      .filter((s) => business.rules.approvedSupplierIds.includes(s.id) && s.walletAddress)
      .map((s) => s.walletAddress as `0x${string}`);
    setBusy(true);
    try {
      const expiresAt = new Date(Date.now() + days * 86_400_000).toISOString();
      const policy = mode === "demo"
        ? { provider: "local-session-key" as const, address: `0x${"9".repeat(40)}` as `0x${string}`, spendCap: agentForm.spendCap, spent: "0", allowlist, createdAt: new Date().toISOString(), expiresAt }
        : await localSessionKeyProvider.create(business.id, { spendCap: agentForm.spendCap, allowlist, expiresAt });
      setBusiness(await store.saveBusiness({ ...business, agent: policy }));
      say("agent", mode === "demo" ? "Demo agent wallet created." : "Agent wallet created. Fund it with only what it may spend, plus a little CELO for fees.");
    } catch (e) {
      say("agent", errorText(e), true);
    } finally {
      setBusy(false);
    }
  }

  async function revokeAgent() {
    if (!business?.agent) return;
    if (!window.confirm("Revoke the agent? Remaining funds go back to your connected wallet and the session key is deleted.")) return;
    setBusy(true);
    try {
      let hashes: string[] = [];
      if (mode === "live") {
        if (!ownerAddress || !publicClient) throw new Error("Connect your wallet first so funds can be returned to it.");
        say("agent", "Returning funds to your wallet…");
        hashes = await providerFor(business.agent).revoke(business.id, business.agent, ownerAddress, publicClient);
      } else {
        forgetLocalKey(business.id);
      }
      setBusiness(await store.saveBusiness({ ...business, agent: { ...business.agent, revokedAt: new Date().toISOString() } }));
      say("agent", hashes.length ? `Agent revoked. Returned funds in ${hashes.length} transaction(s).` : "Agent revoked.");
    } catch (e) {
      say("agent", `${errorText(e)} The agent is still active.`, true);
    } finally {
      setBusy(false);
    }
  }

  async function register() {
    if (!business) return;
    setBusy(true);
    try {
      if (mode === "demo") throw new Error("ERC-8004 registration is a real mainnet transaction, so it is off in the demo. Enter an existing ID below instead.");
      if (!ownerSigner || !publicClient) throw new Error("Connect your wallet to register.");
      const wallet = business.agent && !business.agent.revokedAt ? business.agent.address : ownerSigner.account.address;
      const uri = `${window.location.origin}/api/agent-registration?${new URLSearchParams({ wallet, name: `Emporos agent for ${business.name}` })}`;
      if (!uri.startsWith("https://")) throw new Error("Register from your deployed HTTPS site; the registry must be able to fetch the agent document.");
      const { agentId, hash } = await registerAgent(ownerSigner, publicClient, uri);
      setBusiness(await store.saveBusiness({ ...business, agentId, agentRegistrationTx: hash }));
      say("identity", `Registered as agent #${agentId}.`);
    } catch (e) {
      say("identity", errorText(e), true);
    } finally {
      setBusy(false);
    }
  }

  const agent = business?.agent;
  const active = agentPolicyActive(agent, new Date());
  const Note = ({ k }: { k: string }) => (msg[k] ? <div className={`notice ${msg[k]!.error ? "error" : "ok"}`} style={{ marginTop: 10 }}>{msg[k]!.text}</div> : null);

  return (
    <>
      <section className="page-head">
        <h1>Settings</h1>
        <p>Your business, the agent&apos;s limits, and its on-chain identity.</p>
      </section>

      <section className="panel">
        <h2>Business profile</h2>
        <form className="stack" onSubmit={(e) => void saveProfile(e)} style={{ marginTop: 10 }}>
          <label className="field"><span>Business name</span><input value={profile.name} onChange={(e) => setProfile({ ...profile, name: e.target.value })} required /></label>
          <label className="field"><span>Location</span><input value={profile.location} onChange={(e) => setProfile({ ...profile, location: e.target.value })} placeholder="Lagos" /></label>
          <label className="field"><span>Default currency</span><input value="cNGN (Nigerian naira stablecoin)" disabled /></label>
          {ownerAddress && <p className="small muted">Owner wallet: <span className="mono">{shortAddress(ownerAddress)}</span></p>}
          <button className="btn primary block" disabled={busy}>Save profile</button>
        </form>
        <Note k="profile" />
        {ownerAddress && mode === "live" && (
          <div style={{ marginTop: 14 }}>
            <h3 className="small muted" style={{ marginBottom: 6 }}>Your wallet on Celo</h3>
            <Balances address={ownerAddress} />
          </div>
        )}
      </section>

      <section className="panel">
        <h2>Spending rules</h2>
        <p className="sub">Within these limits the agent pays on its own. Anything else waits for your one-tap approval.</p>
        <form className="stack" onSubmit={(e) => void saveRules(e)}>
          <div className="grid-2">
            <label className="field"><span>Max per order (₦)</span><input inputMode="numeric" value={rules.maxPerOrder} onChange={(e) => setRules({ ...rules, maxPerOrder: e.target.value.replace(/[₦,\s]/g, "") })} /></label>
            <label className="field">
              <span>Cap per</span>
              <select value={rules.period} onChange={(e) => setRules({ ...rules, period: e.target.value as SpendingRules["period"] })}>
                <option value="daily">Day</option>
                <option value="weekly">Week</option>
              </select>
            </label>
          </div>
          <label className="field"><span>{rules.period === "daily" ? "Daily" : "Weekly"} cap (₦)</span><input inputMode="numeric" value={rules.periodCap} onChange={(e) => setRules({ ...rules, periodCap: e.target.value.replace(/[₦,\s]/g, "") })} /></label>
          <label className="check">
            <input type="checkbox" checked={rules.requireApprovedSupplier} onChange={(e) => setRules({ ...rules, requireApprovedSupplier: e.target.checked })} />
            Only auto-pay approved suppliers ({rules.approvedSupplierIds.length} approved)
          </label>
          <button className="btn primary block" disabled={busy || !business}>Save rules</button>
        </form>
        <Note k="rules" />
      </section>

      <section className="panel">
        <div className="row between">
          <h2>Agent wallet</h2>
          {agent && <span className={`badge ${active ? "green" : "red"}`}><span className="dot" />{active ? "Active" : agent.revokedAt ? "Revoked" : "Expired"}</span>}
        </div>
        {agent && !agent.revokedAt ? (
          <>
            <dl className="kv" style={{ marginTop: 10 }}>
              <dt>Address</dt>
              <dd className="mono">{mode === "demo" ? `${shortAddress(agent.address)} (simulated)` : <a href={addressUrl(agent.address)} target="_blank" rel="noreferrer">{shortAddress(agent.address)} ↗</a>}</dd>
              <dt>Type</dt><dd>{agent.provider === "altana" ? "Altana" : "Session key (this browser)"}</dd>
              <dt>Spend cap</dt><dd>{formatNaira(agent.spent)} of {formatNaira(agent.spendCap)} used</dd>
              <dt>Allowlist</dt><dd>{agent.allowlist.length} supplier wallet(s)</dd>
              <dt>Expires</dt><dd>{new Date(agent.expiresAt).toLocaleDateString("en-NG", { day: "numeric", month: "short", year: "numeric" })}</dd>
            </dl>
            {mode === "live" && (
              <>
                <h3 className="small muted" style={{ margin: "14px 0 6px" }}>Agent balances</h3>
                <Balances address={agent.address} />
                <p className="small muted" style={{ marginTop: 8 }}>
                  To fund it, send cNGN (or USD₮ to swap) plus about 0.05 CELO for fees from your wallet to <span className="mono">{agent.address}</span>.
                  Its balance is a hard ceiling on what it can spend.
                </p>
                {!hasLocalKey(business!.id) && <div className="notice warn">This browser does not hold the session key, so it cannot auto-pay from here. Revoke and recreate it on this device.</div>}
              </>
            )}
            <button className="btn danger block" style={{ marginTop: 12 }} disabled={busy} onClick={() => void revokeAgent()}>Revoke agent</button>
            <p className="small muted" style={{ marginTop: 6 }}>Manage which suppliers it may pay on the Suppliers page.</p>
          </>
        ) : (
          <>
            <p className="sub">A separate wallet the agent signs with. It can only pay allowlisted suppliers, up to its cap, until it expires.</p>
            <div className="stack">
              <label className="field">
                <span>Provider</span>
                <select defaultValue="local-session-key">
                  <option value="local-session-key">Session key in this browser</option>
                  <option value="altana" disabled={!altanaProvider.available}>Altana (on-chain limits): not connected yet</option>
                </select>
              </label>
              <div className="grid-2">
                <label className="field"><span>Spend cap (₦)</span><input inputMode="numeric" value={agentForm.spendCap} onChange={(e) => setAgentForm({ ...agentForm, spendCap: e.target.value.replace(/[₦,\s]/g, "") })} /></label>
                <label className="field"><span>Expires in (days)</span><input inputMode="numeric" value={agentForm.days} onChange={(e) => setAgentForm({ ...agentForm, days: e.target.value.replace(/\D/g, "") })} /></label>
              </div>
              <p className="small muted">The allowlist starts with your approved suppliers that have a wallet.</p>
              <button className="btn primary block" disabled={busy || !business} onClick={() => void createAgent()}>Create agent wallet</button>
            </div>
          </>
        )}
        <Note k="agent" />
      </section>

      <section className="panel">
        <h2>Agent identity (ERC-8004)</h2>
        {business?.agentId ? (
          <dl className="kv" style={{ marginTop: 10 }}>
            <dt>Agent ID</dt><dd><strong>#{business.agentId}</strong></dd>
            <dt>Registry</dt><dd className="mono"><a href={addressUrl(IDENTITY_REGISTRY)} target="_blank" rel="noreferrer">{shortAddress(IDENTITY_REGISTRY)} ↗</a></dd>
            {business.agentRegistrationTx && <><dt>Registration</dt><dd><TxLink hash={business.agentRegistrationTx} /></dd></>}
          </dl>
        ) : (
          <>
            <p className="sub">Publish the agent in the Celo Identity Registry so other apps and suppliers can look it up. Your wallet becomes its owner.</p>
            <button className="btn primary block" disabled={busy || !business} onClick={() => void register()}>Register agent on Celo</button>
            <div className="row" style={{ marginTop: 10 }}>
              <input placeholder="Already registered? Agent ID" inputMode="numeric" value={manualAgentId} onChange={(e) => setManualAgentId(e.target.value.replace(/\D/g, ""))} style={{ flex: 1 }} />
              <button className="btn" disabled={!manualAgentId || !business} onClick={() => void save({ ...business!, agentId: manualAgentId }, "identity", `Saved agent #${manualAgentId}.`)}>Save</button>
            </div>
          </>
        )}
        <Note k="identity" />
      </section>

      {user && (
        <section className="panel">
          <h2>Account</h2>
          <p className="small muted">Signed in as {user.email ?? (user.wallet ? shortAddress(user.wallet) : user.id)}</p>
          <button className="btn block" onClick={() => void signOut().then(() => (window.location.href = "/"))}>Sign out</button>
        </section>
      )}
    </>
  );
}
