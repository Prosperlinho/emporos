import { getAddress, isAddress, type Address } from "viem";

export const CELO_CHAIN_ID = 42220;
export const CELOSCAN = "https://celoscan.io";

/**
 * Tether USD₮ on Celo mainnet (6 decimals). Verify on Celoscan before funding;
 * override with NEXT_PUBLIC_USDT_ADDRESS if Tether publishes a different address.
 */
export const USDT_ADDRESS: Address = getAddress(
  process.env.NEXT_PUBLIC_USDT_ADDRESS || "0x48065fbBE25f71C9282ddf5e1cD6D6A887483D5e",
);

/**
 * cNGN has no default on purpose: more than one token uses the "cNGN" ticker on Celo.
 * Set NEXT_PUBLIC_CNGN_ADDRESS to the issuer-verified contract. Live payments are disabled until then.
 */
const rawCngn = process.env.NEXT_PUBLIC_CNGN_ADDRESS?.trim();
export const CNGN_ADDRESS: Address | null = rawCngn && isAddress(rawCngn) ? getAddress(rawCngn) : null;

/** ERC-8004 Identity Registry on Celo mainnet. */
export const IDENTITY_REGISTRY: Address = "0x8004A169FB4a3325136EB29fA0ceB6D2e539a432";

const rawCode = process.env.NEXT_PUBLIC_ATTRIBUTION_CODE?.trim() ?? "";
export const ATTRIBUTION_CODE: string | null = /^[a-z0-9_]{1,32}$/.test(rawCode) ? rawCode : null;

export function txUrl(hash: string): string {
  return `${CELOSCAN}/tx/${hash}`;
}

export function addressUrl(address: string): string {
  return `${CELOSCAN}/address/${address}`;
}

export function shortAddress(address: string): string {
  return address.length > 12 ? `${address.slice(0, 6)}…${address.slice(-4)}` : address;
}

/** What is missing before live (mainnet) payments can run. Empty means ready. */
export function liveReadiness(): string[] {
  const missing: string[] = [];
  if (!ATTRIBUTION_CODE) missing.push("NEXT_PUBLIC_ATTRIBUTION_CODE (your assigned attribution code)");
  if (!CNGN_ADDRESS) missing.push("NEXT_PUBLIC_CNGN_ADDRESS (the verified cNGN contract)");
  return missing;
}
