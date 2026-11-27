// Altana agent wallet (browser). On-chain enforced agent limits on Celo mainnet:
//
//  • The owner's Altana smart wallet is controlled by a passkey (Face ID / fingerprint).
//  • The agent gets a session key whose permissions live on-chain: it may only call
//    cNGN.transfer, up to a cNGN cap per day/week, until it expires. Calls outside that
//    revert at validation, even if this browser is compromised.
//  • Which supplier receives the money is still checked by Emporos before every payment
//    (Altana restricts contract + function, not the recipient).
//  • Revoking is one on-chain transaction; funds stay in the owner's Altana wallet.
//
// The SDK is loaded on demand so it never weighs on pages that don't use it.
import { encodeFunctionData, erc20Abi, getAddress, type Hex } from "viem";
import { ATTRIBUTION_CODE, CNGN_ADDRESS, USDT_ADDRESS } from "./chain/config.ts";
import { PaymentError } from "./chain/tx.ts";
import { koboToTokenUnits, toKobo } from "./money.ts";
import type { AgentPolicy } from "./types.ts";

const CNGN_DECIMALS = 6; // verified on-chain for 0xF6829D…271a4f
const sessionKeyName = (businessId: string) => `emporos.altana.sessionKey.${businessId}`;
const sessionName = (businessId: string) => `emporos.altana.session.${businessId}`;

type Sdk = typeof import("@altananetwork/sdk");
let sdkPromise: Promise<Sdk> | null = null;
const sdk = () => (sdkPromise ??= import("@altananetwork/sdk"));

async function client() {
  const s = await sdk();
  // agentIdentity off: Emporos registers its ERC-8004 identity itself (Settings → Agent identity).
  return s.createClient({ chains: [s.CELO], agentIdentity: false, ...(ATTRIBUTION_CODE ? { appCode: ATTRIBUTION_CODE } : {}) });
}

function requireCngn() {
  if (!CNGN_ADDRESS) throw new PaymentError("config", "Set NEXT_PUBLIC_CNGN_ADDRESS first.");
  if (!ATTRIBUTION_CODE) throw new PaymentError("config", "Set NEXT_PUBLIC_ATTRIBUTION_CODE first.");
  return CNGN_ADDRESS;
}

function friendly(error: unknown): Error {
  const message = error instanceof Error ? error.message : String(error);
  if (/NotAllowed|abort|cancel/i.test(message)) return new Error("Cancelled. Tap the button to try again.");
  return new Error(message.slice(0, 400));
}

/** Step 1: create (or recover) the owner's passkey-secured Altana wallet. Returns its address to fund. */
export async function setUpAltanaWallet(existing?: string): Promise<`0x${string}`> {
  try {
    const c = await client();
    const wallet = existing ? await c.recoverFromPasskey() : await c.createPasskeyWallet({ name: "Emporos balance" });
    return getAddress(wallet.address);
  } catch (error) {
    throw friendly(error);
  }
}

/**
 * Step 2: grant the agent's session key, with its cap and expiry written on-chain.
 * Needs the wallet funded (fees are paid by the wallet, in USD₮ when available).
 */
export async function grantAltanaSession(
  businessId: string,
  walletAddress: `0x${string}`,
  limits: { spendCap: string; period: "day" | "week"; expiresAt: string; allowlist: `0x${string}`[] },
): Promise<AgentPolicy> {
  const cngn = requireCngn();
  try {
    const s = await sdk();
    const c = await client();
    const admin = await c.recoverFromPasskey();
    if (admin.address.toLowerCase() !== walletAddress.toLowerCase()) {
      throw new Error("This passkey belongs to a different Altana wallet.");
    }
    const sessionSigner = s.createPrivateKeySigner();
    const expiry = Math.floor(new Date(limits.expiresAt).getTime() / 1000);
    const result = await c.grantSession({
      wallet: admin,
      signer: admin.signer,
      sessionSigner,
      expiry,
      feeToken: [USDT_ADDRESS, cngn],
      permissions: {
        calls: [{ to: cngn, signature: "transfer(address,uint256)" }],
        spend: [{ token: cngn, limit: koboToTokenUnits(toKobo(limits.spendCap), CNGN_DECIMALS), period: limits.period }],
      },
    });
    if (result.status !== "granted") {
      const failed = result.legs.filter((leg) => leg.status === "FAILED").map((leg) => `${leg.kind} on ${leg.chainId}`);
      throw new Error(`Altana could not grant the session (${failed.join(", ") || "unknown step"}). Check the wallet has USD₮ or CELO for fees.`);
    }
    localStorage.setItem(sessionKeyName(businessId), sessionSigner._privateKey);
    localStorage.setItem(sessionName(businessId), JSON.stringify(s.serializeSession(result)));
    return {
      provider: "altana",
      address: getAddress(walletAddress),
      spendCap: limits.spendCap,
      spent: "0",
      allowlist: limits.allowlist,
      createdAt: new Date().toISOString(),
      expiresAt: limits.expiresAt,
      ...(result.transactionHash ? { grantTx: result.transactionHash } : {}),
      sessionPublicKey: result.publicKey,
      period: limits.period,
    };
  } catch (error) {
    throw friendly(error);
  }
}

export function hasAltanaSession(businessId: string): boolean {
  return typeof localStorage !== "undefined" && Boolean(localStorage.getItem(sessionKeyName(businessId)) && localStorage.getItem(sessionName(businessId)));
}

/** Agent payment: cNGN transfer from the Altana wallet, signed by the session key, attribution-tagged by the SDK. */
export async function payWithAltana(businessId: string, recipient: string, amountNaira: string): Promise<Hex> {
  const cngn = requireCngn();
  const key = localStorage.getItem(sessionKeyName(businessId)) as Hex | null;
  const stored = localStorage.getItem(sessionName(businessId));
  if (!key || !stored) throw new PaymentError("config", "This device doesn't hold the Altana session key. Revoke and grant a new one here.");
  const s = await sdk();
  const c = await client();
  const session = s.deserializeSession(JSON.parse(stored), s.signerFromPrivateKey(key));
  const amount = koboToTokenUnits(toKobo(amountNaira), CNGN_DECIMALS);
  let result;
  try {
    result = await c.execute({
      session,
      feeToken: [USDT_ADDRESS, cngn],
      calls: [{ to: cngn, value: 0n, data: encodeFunctionData({ abi: erc20Abi, functionName: "transfer", args: [getAddress(recipient), amount] }) }],
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new PaymentError(/limit|spend|exceed|expired|unauthori/i.test(message) ? "reverted" : "unknown", `Altana refused the payment: ${message.slice(0, 300)}`);
  }
  if (result.status === "FAILED") throw new PaymentError("reverted", "The payment failed on-chain. Nothing was sent.", result.transactionHash);
  if (!result.transactionHash) throw new PaymentError("unconfirmed", `Payment submitted (${result.callsId}) but not confirmed yet. Check the Altana wallet before retrying.`);
  return result.transactionHash;
}

/** Revoke the session on-chain (passkey prompt). Funds stay in the owner's Altana wallet. */
export async function revokeAltanaSession(businessId: string, policy: AgentPolicy): Promise<Hex | undefined> {
  try {
    const c = await client();
    const admin = await c.recoverFromPasskey();
    if (!policy.sessionPublicKey) throw new Error("No session on record to revoke.");
    const result = await c.revokeSession({ wallet: admin, signer: admin.signer, session: policy.sessionPublicKey as Hex, feeToken: USDT_ADDRESS });
    localStorage.removeItem(sessionKeyName(businessId));
    localStorage.removeItem(sessionName(businessId));
    return (result as { transactionHash?: Hex }).transactionHash;
  } catch (error) {
    throw friendly(error);
  }
}


/** The owner's admin handle, unlocked with their fingerprint / Face ID. */
async function unlockAdmin(walletAddress: string) {
  const c = await client();
  const admin = await c.recoverFromPasskey();
  if (admin.address.toLowerCase() !== walletAddress.toLowerCase()) {
    throw new Error("This fingerprint belongs to a different Emporos balance.");
  }
  return { c, admin };
}

/**
 * Register the agent's public ID (ERC-8004) from the Altana wallet. Passkey wallets are not
 * registered automatically, so this asks once. Never throws for "already registered".
 */
export async function registerAltanaAgentId(
  walletAddress: string,
  identity: { name: string; description: string; endpoint: string },
): Promise<{ agentId: string; registry: string; transactionHash?: string } | null> {
  try {
    const { c, admin } = await unlockAdmin(walletAddress);
    const outcome = await c.registerAgentIdentity({ wallet: admin, signer: admin.signer, identity, feeToken: USDT_ADDRESS });
    if (outcome.status === "registered") {
      return { agentId: outcome.agentId, registry: outcome.registry, ...(outcome.transactionHash ? { transactionHash: outcome.transactionHash } : {}) };
    }
    if (outcome.status === "skipped" && outcome.reason === "already-registered") return null;
    throw new Error(outcome.status === "failed" ? outcome.reason : `Agent ID was not created (${outcome.reason}).`);
  } catch (error) {
    throw friendly(error);
  }
}

/** Owner-approved payment from the Emporos balance, confirmed with fingerprint / Face ID. */
export async function payAsOwnerWithAltana(walletAddress: string, recipient: string, amountNaira: string): Promise<Hex> {
  const cngn = requireCngn();
  let result;
  try {
    const { c, admin } = await unlockAdmin(walletAddress);
    const amount = koboToTokenUnits(toKobo(amountNaira), CNGN_DECIMALS);
    result = await c.execute({
      wallet: admin,
      signer: admin.signer,
      feeToken: [USDT_ADDRESS, cngn],
      calls: [{ to: cngn, value: 0n, data: encodeFunctionData({ abi: erc20Abi, functionName: "transfer", args: [getAddress(recipient), amount] }) }],
    });
  } catch (error) {
    const e = friendly(error);
    throw new PaymentError(/cancel/i.test(e.message) ? "rejected" : "unknown", e.message);
  }
  if (result.status === "FAILED") throw new PaymentError("reverted", "The payment failed. Nothing was sent.", result.transactionHash);
  if (!result.transactionHash) throw new PaymentError("unconfirmed", "Payment sent but not confirmed yet. Check your orders before trying again.");
  return result.transactionHash;
}
