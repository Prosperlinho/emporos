"use client";

import { useEffect, useState } from "react";
import { useAccount } from "wagmi";
import { useApp } from "@/components/AppContext.tsx";
import { Balances } from "@/components/Balances.tsx";
import { useCeloPublicClient, useOwnerSigner } from "@/components/hooks.ts";
import { errorText, TxLink } from "@/components/ui.tsx";
import { forgetLocalKey, hasLocalKey, localSessionKeyProvider, providerFor } from "@/lib/agent-wallet.ts";
import { hasAltanaSession } from "@/lib/altana.ts";
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
  const [agentForm, setAgentForm] = useState({ spendCap: "500000", days: "30", period: "week" as "day" | "week" });
  const [provider, setProvider] = useState<"altana" | "local-session-key">("altana");
  const useAltana = mode === "live" && provider === "altana";
  const [manualAgentId, setManualAgentId] = useState("");
  const [listOnRegister, setListOnRegister] = useState(true);
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
    await save({ ...business, rules, rulesSavedAt: new Date().toISOString() }, "rules", "Spending rules saved.");
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
      if (useAltana) {
        if (!business.altanaWallet) throw new Error("Create your Altana wallet first.");
        say("agent", "Confirm with your passkey. Writing the agent's limits on-chain…");
        const { grantAltanaSession } = await import("@/lib/altana.ts");
        const policy = await grantAltanaSession(business.id, business.altanaWallet as `0x${string}`, {
          spendCap: agentForm.spendCap,
          period: agentForm.period,
          expiresAt,
          allowlist,
        });
        setBusiness(await store.saveBusiness({ ...business, agent: policy }));
        say("agent", "Agent active. Its cap, allowed contract and expiry are now enforced on-chain.");
        return;
      }
      const policy = mode === "demo"
        ? { provider: "local-session-key" as const, address: `0x${"9".repeat(40)}` as `0x${string}`, spendCap: agentForm.spendCap, spent: "0", allowlist, createdAt: new Date().toISOString(), expiresAt }
        : await localSessionKeyProvider.create(business.id, { spendCap: agentForm.spendCap, allowlist, expiresAt });
      setBusiness(await store.saveBusiness({ ...business, agent: policy }));
      say("agent", mode === "demo" ? "Sample agent wallet created." : "Agent wallet created. Fund it with only what it may spend, plus a little CELO for fees.");
    } catch (e) {
      say("agent", errorText(e), true);
    } finally {
      setBusy(false);
    }
  }

  async function revokeAgent() {
    if (!business?.agent) return;
    const isAltana = business.agent.provider === "altana";
    const prompt = isAltana
      ? "Revoke the agent? Its session key is cancelled on-chain. Funds stay in your Altana wallet."
      : "Revoke the agent? Remaining funds go back to your connected wallet and the session key is deleted.";
    if (!window.confirm(prompt)) return;
    setBusy(true);
    try {
      let hashes: string[] = [];
      if (mode === "live" && isAltana) {
        say("agent", "Confirm with your passkey…");
        const { revokeAltanaSession } = await import("@/lib/altana.ts");
        const hash = await revokeAltanaSession(business.id, business.agent);
        if (hash) hashes = [hash];
      } else if (mode === "live") {
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

  async function createAltanaWallet() {
    if (!business) return say("agent", "Save your business profile first.", true);
    setBusy(true);
    try {
      say("agent", "Follow your device's passkey prompt…");
      const { setUpAltanaWallet } = await import("@/lib/altana.ts");
      const altanaWallet = await setUpAltanaWallet();
      setBusiness(await store.saveBusiness({ ...business, altanaWallet }));
      say("agent", "Altana wallet created. Fund it, then activate the agent.");
    } catch (e) {
      say("agent", errorText(e), true);
    } finally {
      setBusy(false);
    }
  }

  async function recoverAltanaWallet() {
    if (!business) return say("agent", "Save your business profile first.", true);
    setBusy(true);
    try {
      const { setUpAltanaWallet } = await import("@/lib/altana.ts");
      const altanaWallet = await setUpAltanaWallet("recover");
      setBusiness(await store.saveBusiness({ ...business, altanaWallet }));
      say("agent", "Altana wallet found.");
    } catch (e) {
      say("agent", errorText(e), true);
    } finally {
      setBusy(false);
    }
  }

  async function register() {
    if (!business) return;
    setBusy(true);
    try {
      if (mode === "demo") throw new Error("ERC-8004 registration is a real mainnet transaction, so it's off with sample data. Enter an existing ID below instead.");
      if (!ownerSigner || !publicClient) throw new Error("Connect your wallet to register.");
      const wallet = business.agent && !business.agent.revokedAt ? business.agent.address : ownerSigner.account.address;
      const uri = `${window.location.origin}/api/agent-registration?${new URLSearchParams({ wallet, name: `Emporos agent for ${business.name}` })}`;
      if (!uri.startsWith("https://")) throw new Error("Register from your deployed HTTPS site; the registry must be able to fetch the agent document.");
      const { agentId, hash } = await registerAgent(ownerSigner, publicClient, uri);
      setBusiness(await store.saveBusiness({ ...business, agentId, agentRegistrationTx: hash, listed: listOnRegister }));
      say("identity", `Registered as agent #${agentId}.`);
    } catch (e) {
      say("identity", errorText(e), true);
    } finally {
      setBusy(false);
    }
  }

  const agent = business?.agent;
  const active = agentPolicyActive(agent, new Date());
  const altanaReady = business ? hasAltanaSession(business.id) : false;
  const Note = ({ k }: { k: string }) => (msg[k] ? <div className={`notice ${msg[k]!.error ? "error" : "ok"}`} style={{ marginTop: 10 }}>{msg[k]!.text}</div> : null);

  return (
    <>
      <section className="page-head">
        <h1>Account</h1>
        
      </section>

      <section className="panel" id="profile">
        <h2>Your shop</h2>
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

      <section className="panel" id="rules">
        <h2>Spending limit</h2>
        <p className="sub">Emporos pays on its own up to these amounts. Anything more, it asks you first.</p>
        <form className="stack" onSubmit={(e) => void saveRules(e)}>
          <div className="grid-2">
            <label className="field"><span>Max per order (₦)</span><input inputMode="numeric" value={rules.maxPerOrder} onChange={(e) => setRules({ ...rules, maxPerOrder: e.target.value.replace(/[\u20A6,\s]/g, "") })} /></label>
            <label className="field">
              <span>Cap per</span>
              <select value={rules.period} onChange={(e) => setRules({ ...rules, period: e.target.value as SpendingRules["period"] })}>
                <option value="daily">Day</option>
                <option value="weekly">Week</option>
              </select>
            </label>
          </div>
          <label className="field"><span>{rules.period === "daily" ? "Daily" : "Weekly"} cap (₦)</span><input inputMode="numeric" value={rules.periodCap} onChange={(e) => setRules({ ...rules, periodCap: e.target.value.replace(/[\u20A6,\s]/g, "") })} /></label>
          <label className="check">
            <input type="checkbox" checked={rules.requireApprovedSupplier} onChange={(e) => setRules({ ...rules, requireApprovedSupplier: e.target.checked })} />
            Only pay trusted suppliers on its own ({rules.approvedSupplierIds.length} trusted)
          </label>
          <button className="btn primary block" disabled={busy || !business}>Save rules</button>
        </form>
        <Note k="rules" />
      </section>

      <section className="panel" id="agent">
        <div className="row between">
          <h2>Auto-pay</h2>
          {agent && <span className={`badge ${active ? "green" : "red"}`}><span className="dot" />{active ? "Active" : agent.revokedAt ? "Revoked" : "Expired"}</span>}
        </div>
        {agent && !agent.revokedAt ? (
          <>
            <dl className="kv" style={{ marginTop: 10 }}>
              <dt>Account</dt>
              <dd className="mono">{mode === "demo" ? `${shortAddress(agent.address)} (sample)` : <a href={addressUrl(agent.address)} target="_blank" rel="noreferrer">{shortAddress(agent.address)} ↗</a>}</dd>
              <dt>Protection</dt><dd>{agent.provider === "altana" ? "Limits locked on Celo" : "Limits checked by Emporos"}</dd>
              <dt>Spent</dt><dd>{formatNaira(agent.spent)} of {formatNaira(agent.spendCap)} used</dd>
              <dt>Can pay</dt><dd>{agent.allowlist.length} trusted supplier(s)</dd>
              <dt>Renew by</dt><dd>{new Date(agent.expiresAt).toLocaleDateString("en-NG", { day: "numeric", month: "short", year: "numeric" })}</dd>
            </dl>
            {mode === "live" && (
              <>
                <h3 className="small muted" style={{ margin: "14px 0 6px" }}>Agent balances</h3>
                <Balances address={agent.address} />
                {agent.provider === "altana" ? (
                  <>
                    <p className="small muted" style={{ marginTop: 8 }}>
                      Limits on-chain: cNGN transfers only, up to {formatNaira(agent.spendCap)} per {agent.period ?? "period"}. Fund it with cNGN, plus a little USD₮ for fees.
                    </p>
                    {!altanaReady && <div className="notice warn">This device doesn&apos;t hold the agent&apos;s session key. Revoke and activate it again here.</div>}
                  </>
                ) : (
                  <>
                    <p className="small muted" style={{ marginTop: 8 }}>
                      Fund it with cNGN (or USD₮ to swap) plus about 0.05 CELO for fees. Its balance is a hard ceiling.
                    </p>
                    {!hasLocalKey(business!.id) && <div className="notice warn">This device doesn&apos;t hold the agent key. Revoke and recreate it here.</div>}
                  </>
                )}
              </>
            )}
            <button className="btn danger block" style={{ marginTop: 12 }} disabled={busy} onClick={() => void revokeAgent()}>Turn off auto-pay</button>
            
          </>
        ) : (
          <>
            <p className="sub">Let Emporos pay trusted suppliers on its own, up to your limit.</p>
            <div className="stack">
              {mode === "live" && (
                <label className="field">
                  <span>Provider</span>
                  <select value={provider} onChange={(e) => setProvider(e.target.value as typeof provider)}>
                    <option value="altana">Altana: limits enforced on-chain (recommended)</option>
                    <option value="local-session-key">Session key in this browser</option>
                  </select>
                </label>
              )}

              {useAltana && !business?.altanaWallet ? (
                <>
                  <p className="small muted">Step 1: create your Altana wallet. It&apos;s secured by your device&apos;s passkey (Face ID or fingerprint), no seed phrase.</p>
                  <button className="btn primary block" disabled={busy || !business} onClick={() => void createAltanaWallet()}>Create Altana wallet</button>
                  <button className="link-btn small" disabled={busy || !business} onClick={() => void recoverAltanaWallet()}>I already have one</button>
                </>
              ) : (
                <>
                  {useAltana && business?.altanaWallet && (
                    <>
                      <p className="small muted">
                        Step 2: fund <span className="mono">{business.altanaWallet}</span> with cNGN to spend and a little USD₮ for fees, then activate.
                      </p>
                      <Balances address={business.altanaWallet as `0x${string}`} />
                    </>
                  )}
                  <div className="grid-2">
                    <label className="field">
                      <span>Spend cap (₦){useAltana ? "" : " total"}</span>
                      <input inputMode="numeric" value={agentForm.spendCap} onChange={(e) => setAgentForm({ ...agentForm, spendCap: e.target.value.replace(/[\u20A6,\s]/g, "") })} />
                    </label>
                    {useAltana ? (
                      <label className="field">
                        <span>Per</span>
                        <select value={agentForm.period} onChange={(e) => setAgentForm({ ...agentForm, period: e.target.value as "day" | "week" })}>
                          <option value="day">Day</option>
                          <option value="week">Week</option>
                        </select>
                      </label>
                    ) : null}
                    <label className="field"><span>Expires in (days)</span><input inputMode="numeric" value={agentForm.days} onChange={(e) => setAgentForm({ ...agentForm, days: e.target.value.replace(/\D/g, "") })} /></label>
                  </div>
                  <button className="btn primary block" disabled={busy || !business} onClick={() => void createAgent()}>
                    {useAltana ? "Activate agent" : "Create agent wallet"}
                  </button>
                </>
              )}
            </div>
          </>
        )}
        <Note k="agent" />
      </section>

      <section className="panel" id="identity">
        <h2>Agent ID</h2>
        {business?.agentId ? (
          <>
            <dl className="kv" style={{ marginTop: 10 }}>
              <dt>Agent ID</dt><dd><strong>#{business.agentId}</strong></dd>
              <dt>Registry</dt><dd className="mono"><a href={addressUrl(IDENTITY_REGISTRY)} target="_blank" rel="noreferrer">{shortAddress(IDENTITY_REGISTRY)} ↗</a></dd>
              {business.agentRegistrationTx && <><dt>Registration</dt><dd><TxLink hash={business.agentRegistrationTx} /></dd></>}
            </dl>
            {mode === "live" && (
              <label className="check" style={{ marginTop: 10 }}>
                <input
                  type="checkbox"
                  checked={Boolean(business.listed)}
                  disabled={busy}
                  onChange={(e) => void save({ ...business, listed: e.target.checked }, "identity", e.target.checked ? "Listed in the agent directory." : "Removed from the agent directory.")}
                />
                Show my shop in the <a href="/agents" target="_blank" rel="noreferrer">public agent directory</a>
              </label>
            )}
          </>
        ) : (
          <>
            <p className="sub">A public ID for your shop&apos;s agent, so suppliers can check it&apos;s really you. Registered on Celo (ERC-8004).</p>
            {mode === "live" && (
              <label className="check">
                <input type="checkbox" checked={listOnRegister} onChange={(e) => setListOnRegister(e.target.checked)} />
                Also show my shop name and city in the public agent directory
              </label>
            )}
            <button className="btn primary block" disabled={busy || !business} onClick={() => void register()}>Get my agent ID</button>
            <div className="row" style={{ marginTop: 10 }}>
              <input placeholder="Already registered? Agent ID" inputMode="numeric" value={manualAgentId} onChange={(e) => setManualAgentId(e.target.value.replace(/\D/g, ""))} style={{ flex: 1 }} />
              <button className="btn" disabled={!manualAgentId || !business} onClick={() => void save({ ...business!, agentId: manualAgentId, listed: mode === "live" && listOnRegister }, "identity", `Saved agent #${manualAgentId}.`)}>Save</button>
            </div>
          </>
        )}
        <Note k="identity" />
      </section>

      {user && (
        <section className="panel">
          <h2>Account</h2>
          <p className="small muted">Signed in {user.email ? `as ${user.email}` : user.wallet ? `with wallet ${shortAddress(user.wallet)}` : "with fingerprint / Face ID"}</p>
          <button className="btn block" onClick={() => void signOut().then(() => (window.location.href = "/"))}>Sign out</button>
        </section>
      )}
    </>
  );
}
