"use client";

import { formatUnits } from "viem";
import { CNGN_ADDRESS } from "@/lib/chain/config.ts";
import { useBalances } from "./hooks.ts";

function fmt(value: bigint, decimals: number, maxFraction = 2): string {
  const n = Number(formatUnits(value, decimals));
  return n.toLocaleString("en-NG", { maximumFractionDigits: maxFraction });
}

/** USD₮ and cNGN balances for an address on Celo mainnet. */
export function Balances({ address, compact }: { address: `0x${string}` | undefined; compact?: boolean }) {
  const { data, isLoading, error } = useBalances(address);
  if (!address) return null;
  if (isLoading) return <span className="badge">Loading balances…</span>;
  if (error || !data) return <span className="badge red">Balance unavailable</span>;

  const cngn = data.cngn === null ? "set cNGN address" : `₦${fmt(data.cngn, data.cngnDecimals ?? 18)}`;
  if (compact) {
    return (
      <span className="badge green" title="Wallet balances on Celo mainnet">
        {fmt(data.usdt, 6)} USD₮ · {cngn}
      </span>
    );
  }
  return (
    <dl className="kv">
      <dt>USD₮</dt>
      <dd>{fmt(data.usdt, 6)}</dd>
      <dt>cNGN</dt>
      <dd>{cngn}{!CNGN_ADDRESS && <span className="small muted"> (not configured)</span>}</dd>
      <dt>CELO (gas)</dt>
      <dd>{fmt(data.celo, 18, 4)}</dd>
    </dl>
  );
}
