// Agent wallet. Two providers behind one interface:
//
//  • "local-session-key" (fallback, works today): a fresh key generated in this browser.
//    The owner funds it with only what the agent may spend. Spend cap, supplier allowlist
//    and expiry are enforced by Emporos before every payment, and the key's balance is a
//    hard ceiling. Revoking sweeps the remaining funds back to the owner and deletes the key.
//    The key lives in this browser's localStorage, so keep balances small.
//
//  • "altana" (placeholder): Altana registers limits on-chain so they are enforced by the
//    wallet itself. Its Celo SDK/API was not available when this was written; implement
//    `altanaProvider` against Altana's docs to switch over.
import { createWalletClient, encodeFunctionData, erc20Abi, http, type Address, type Hex, type PublicClient } from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { celo } from "viem/chains";
import { CNGN_ADDRESS, USDT_ADDRESS } from "./chain/config.ts";
import { sendTagged, type Signer } from "./chain/tx.ts";
import type { AgentPolicy } from "./types.ts";

const keyName = (businessId: string) => `emporos.agentKey.${businessId}`;

export interface AgentWalletProvider {
  id: AgentPolicy["provider"];
  available: boolean;
  create(businessId: string, limits: Pick<AgentPolicy, "spendCap" | "allowlist" | "expiresAt">): Promise<AgentPolicy>;
  signer(businessId: string, policy: AgentPolicy): Signer;
  revoke(businessId: string, policy: AgentPolicy, owner: Address, publicClient: PublicClient): Promise<Hex[]>;
}

export const localSessionKeyProvider: AgentWalletProvider = {
  id: "local-session-key",
  available: true,
  async create(businessId, limits) {
    const key = generatePrivateKey();
    const account = privateKeyToAccount(key);
    localStorage.setItem(keyName(businessId), key);
    return {
      provider: "local-session-key",
      address: account.address,
      spendCap: limits.spendCap,
      spent: "0",
      allowlist: limits.allowlist,
      createdAt: new Date().toISOString(),
      expiresAt: limits.expiresAt,
    };
  },
  signer(businessId, policy) {
    const key = localStorage.getItem(keyName(businessId)) as Hex | null;
    if (!key) throw new Error("This browser does not hold the agent's session key. Revoke it and create a new one here.");
    const account = privateKeyToAccount(key);
    if (account.address.toLowerCase() !== policy.address.toLowerCase()) {
      throw new Error("The stored session key does not match the agent wallet on file.");
    }
    return createWalletClient({ account, chain: celo, transport: http(process.env.NEXT_PUBLIC_CELO_RPC_URL || undefined) });
  },
  async revoke(businessId, policy, owner, publicClient) {
    const hashes: Hex[] = [];
    const key = localStorage.getItem(keyName(businessId)) as Hex | null;
    if (key) {
      const signer = this.signer(businessId, policy);
      const agent = signer.account.address;
      // Sweep tokens first (they need gas), then CELO minus the fee.
      for (const token of [CNGN_ADDRESS, USDT_ADDRESS].filter(Boolean) as Address[]) {
        const balance = await publicClient.readContract({ address: token, abi: erc20Abi, functionName: "balanceOf", args: [agent] });
        if (balance > 0n) {
          hashes.push(
            await sendTagged(signer, publicClient, {
              to: token,
              data: encodeFunctionData({ abi: erc20Abi, functionName: "transfer", args: [owner, balance] }),
            }),
          );
        }
      }
      const celoBalance = await publicClient.getBalance({ address: agent });
      const gasPrice = await publicClient.getGasPrice();
      // Tagged calldata costs a little over 21k gas; leave a margin.
      const fee = 40_000n * gasPrice * 2n;
      if (celoBalance > fee) {
        hashes.push(await sendTagged(signer, publicClient, { to: owner, data: "0x", value: celoBalance - fee }));
      }
      localStorage.removeItem(keyName(businessId));
    }
    return hashes;
  },
};

export const altanaProvider: AgentWalletProvider = {
  id: "altana",
  available: false,
  async create() {
    throw new Error("Altana agent wallets are not wired up yet. Add Altana's Celo SDK to enable on-chain limits.");
  },
  signer() {
    throw new Error("Altana agent wallets are not wired up yet.");
  },
  async revoke() {
    throw new Error("Altana agent wallets are not wired up yet.");
  },
};

export function providerFor(policy: AgentPolicy | undefined): AgentWalletProvider {
  return policy?.provider === "altana" ? altanaProvider : localSessionKeyProvider;
}

export function hasLocalKey(businessId: string): boolean {
  return typeof localStorage !== "undefined" && localStorage.getItem(keyName(businessId)) !== null;
}

/** Demo mode only: forget a simulated agent without touching the chain. */
export function forgetLocalKey(businessId: string): void {
  localStorage.removeItem(keyName(businessId));
}
