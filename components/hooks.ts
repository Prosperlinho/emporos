"use client";

import { useQuery } from "@tanstack/react-query";
import type { PublicClient } from "viem";
import { useAccount, usePublicClient, useWalletClient } from "wagmi";
import type { Signer } from "@/lib/chain/tx.ts";
import { readBalances } from "@/lib/payments.ts";

export function useCeloPublicClient(): PublicClient | undefined {
  return usePublicClient({ chainId: 42220 }) as PublicClient | undefined;
}

/** The connected owner wallet as a viem signer, if connected. */
export function useOwnerSigner(): Signer | undefined {
  const { data } = useWalletClient();
  return data as Signer | undefined;
}

export function useBalances(address: `0x${string}` | undefined) {
  const publicClient = useCeloPublicClient();
  return useQuery({
    queryKey: ["balances", address],
    enabled: Boolean(address && publicClient),
    refetchInterval: 30_000,
    queryFn: () => readBalances(publicClient!, address!),
  });
}

export function useOwnerAddress(): `0x${string}` | undefined {
  return useAccount().address;
}
