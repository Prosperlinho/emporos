"use client";

import { useMemo, useState } from "react";
import { addressUrl, CELOSCAN, IDENTITY_REGISTRY, shortAddress, txUrl } from "@/lib/chain/config.ts";
import type { PublicAgent } from "@/lib/server/repo.ts";

export function AgentSearch({ agents }: { agents: PublicAgent[] }) {
  const [query, setQuery] = useState("");
  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return agents;
    return agents.filter((a) => `${a.name} ${a.location} ${a.agentId}`.toLowerCase().includes(q));
  }, [agents, query]);

  return (
    <>
      <input
        className="lx-search"
        type="search"
        placeholder="Search by shop, city or agent ID"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        aria-label="Search agents"
      />
      <p className="lx-dir-count">{shown.length} agent{shown.length === 1 ? "" : "s"}</p>

      {agents.length === 0 ? (
        <p className="lx-dir-empty">No agents listed yet. Register yours from Settings → Agent identity after signing in.</p>
      ) : shown.length === 0 ? (
        <p className="lx-dir-empty">No agents match “{query}”.</p>
      ) : (
        <ul className="lx-agents">
          {shown.map((a) => (
            <li key={a.businessId} className="lx-agent">
              <div className="lx-agent-top">
                <div>
                  <h3>{a.name}</h3>
                  <span>{a.location || "Nigeria"}</span>
                </div>
                <span className={`lx-status ${a.active ? "on" : ""}`}>{a.active ? "Active" : "Inactive"}</span>
              </div>
              <dl>
                <dt>Agent ID</dt>
                <dd>
                  <a href={`${CELOSCAN}/nft/${IDENTITY_REGISTRY}/${a.agentId}`} target="_blank" rel="noreferrer">#{a.agentId}</a>
                </dd>
                {a.agentWallet && (
                  <>
                    <dt>Pays from</dt>
                    <dd>
                      <a href={addressUrl(a.agentWallet)} target="_blank" rel="noreferrer">{shortAddress(a.agentWallet)}</a>
                      <small>{a.walletType === "altana" ? " · limits on-chain" : " · session key"}</small>
                    </dd>
                  </>
                )}
                {a.registrationTx && (
                  <>
                    <dt>Registered</dt>
                    <dd><a href={txUrl(a.registrationTx)} target="_blank" rel="noreferrer">View on Celoscan</a></dd>
                  </>
                )}
              </dl>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
