import { toDataSuffix } from "@celo/attribution-tags";
import {
  BaseError,
  concat,
  ContractFunctionRevertedError,
  InsufficientFundsError,
  UserRejectedRequestError,
  type Account,
  type Address,
  type Chain,
  type Hex,
  type PublicClient,
  type Transport,
  type WalletClient,
} from "viem";
import { ATTRIBUTION_CODE, CELO_CHAIN_ID } from "./config.ts";

export type Signer = WalletClient<Transport, Chain, Account>;

export type PaymentErrorCode =
  | "config"
  | "wrong_chain"
  | "rejected"
  | "low_balance"
  | "no_gas"
  | "fx_unavailable"
  | "swap_failed"
  | "reverted"
  | "unconfirmed"
  | "unknown";

export class PaymentError extends Error {
  readonly code: PaymentErrorCode;
  readonly hash: Hex | undefined;
  constructor(code: PaymentErrorCode, message: string, hash?: Hex) {
    super(message);
    this.name = "PaymentError";
    this.code = code;
    this.hash = hash;
  }
}

export function requireAttribution(): string {
  if (!ATTRIBUTION_CODE) {
    throw new PaymentError("config", "Set NEXT_PUBLIC_ATTRIBUTION_CODE to your assigned attribution code. No transaction was sent.");
  }
  return ATTRIBUTION_CODE;
}

export function tag(data: Hex): Hex {
  return concat([data, toDataSuffix(requireAttribution())]);
}

/** Turn wallet/RPC errors into a message a shop owner can act on. */
export function toPaymentError(error: unknown, hash?: Hex): PaymentError {
  if (error instanceof PaymentError) return error;
  if (error instanceof BaseError) {
    if (error.walk((e) => e instanceof UserRejectedRequestError)) {
      return new PaymentError("rejected", "You declined the request in your wallet. Nothing was sent.", hash);
    }
    if (error.walk((e) => e instanceof InsufficientFundsError)) {
      return new PaymentError("no_gas", "Not enough CELO to pay network fees. Add a little CELO and try again.", hash);
    }
    const revert = error.walk((e) => e instanceof ContractFunctionRevertedError);
    if (revert instanceof ContractFunctionRevertedError) {
      return new PaymentError("reverted", `The contract rejected the transaction: ${revert.reason ?? revert.shortMessage}`, hash);
    }
    return new PaymentError("unknown", error.shortMessage, hash);
  }
  return new PaymentError("unknown", error instanceof Error ? error.message : String(error), hash);
}

export async function assertCelo(signer: Signer): Promise<void> {
  const chainId = await signer.getChainId();
  if (chainId !== CELO_CHAIN_ID) {
    throw new PaymentError("wrong_chain", `Switch your wallet to Celo mainnet (chain ${CELO_CHAIN_ID}). Nothing was sent.`);
  }
}

/**
 * Send a transaction with the ERC-8021 attribution suffix and wait for it.
 * Never retried automatically: once a hash exists, a failure says so and carries the hash.
 */
export async function sendTagged(
  signer: Signer,
  publicClient: PublicClient,
  tx: { to: Address; data: Hex; value?: bigint },
): Promise<Hex> {
  const data = tag(tx.data);
  let hash: Hex;
  try {
    hash = await signer.sendTransaction({
      account: signer.account,
      chain: signer.chain,
      to: tx.to,
      data,
      value: tx.value ?? 0n,
    });
  } catch (error) {
    throw toPaymentError(error);
  }
  let receipt;
  try {
    receipt = await publicClient.waitForTransactionReceipt({ hash, timeout: 120_000 });
  } catch {
    throw new PaymentError(
      "unconfirmed",
      `Transaction ${hash} was sent but not confirmed yet. Check it on Celoscan before trying again.`,
      hash,
    );
  }
  if (receipt.status !== "success") {
    throw new PaymentError("reverted", `Transaction ${hash} failed on-chain. Check it on Celoscan before trying again.`, hash);
  }
  return hash;
}
