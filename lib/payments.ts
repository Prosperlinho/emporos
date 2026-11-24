// Client-side payment: top up cNGN from USD₮ if needed, then pay the supplier in cNGN.
// Every transaction carries the attribution suffix. Nothing is retried automatically.
import { encodeFunctionData, erc20Abi, formatUnits, getAddress, isAddress, type Address, type Hex, type PublicClient } from "viem";
import { CNGN_ADDRESS, USDT_ADDRESS } from "./chain/config.ts";
import { assertCelo, PaymentError, requireAttribution, sendTagged, type Signer } from "./chain/tx.ts";
import type { FxQuote, FxQuoteError } from "./fx/types.ts";
import { koboToTokenUnits, toKobo } from "./money.ts";
import type { FxRecord } from "./types.ts";

export type StepId = "check" | "fx" | "approve" | "swap" | "transfer";
export type StepStatus = "pending" | "active" | "done" | "skipped" | "error";

export interface PayStep {
  id: StepId;
  label: string;
  status: StepStatus;
  detail?: string;
  hash?: Hex;
}

export function initialSteps(): PayStep[] {
  return [
    { id: "check", label: "Check balances", status: "pending" },
    { id: "fx", label: "Get USD₮ → cNGN quote", status: "pending" },
    { id: "approve", label: "Allow swap to use USD₮", status: "pending" },
    { id: "swap", label: "Swap USD₮ → cNGN", status: "pending" },
    { id: "transfer", label: "Pay supplier in cNGN", status: "pending" },
  ];
}

export interface PaymentResult {
  transferHash: Hex;
  fx?: FxRecord;
}

export interface WalletBalances {
  celo: bigint;
  usdt: bigint;
  cngn: bigint | null;
  cngnDecimals: number | null;
}

export async function readBalances(publicClient: PublicClient, owner: Address): Promise<WalletBalances> {
  const reads = [
    publicClient.getBalance({ address: owner }),
    publicClient.readContract({ address: USDT_ADDRESS, abi: erc20Abi, functionName: "balanceOf", args: [owner] }),
  ] as const;
  const [celo, usdt] = await Promise.all(reads);
  if (!CNGN_ADDRESS) return { celo, usdt, cngn: null, cngnDecimals: null };
  const [cngn, cngnDecimals] = await Promise.all([
    publicClient.readContract({ address: CNGN_ADDRESS, abi: erc20Abi, functionName: "balanceOf", args: [owner] }),
    publicClient.readContract({ address: CNGN_ADDRESS, abi: erc20Abi, functionName: "decimals" }),
  ]);
  return { celo, usdt, cngn, cngnDecimals };
}

export async function payInCngn(args: {
  signer: Signer;
  publicClient: PublicClient;
  recipient: string;
  amountNaira: string;
  onStep: (id: StepId, patch: Partial<PayStep>) => void;
}): Promise<PaymentResult> {
  const { signer, publicClient, onStep } = args;
  const step = (id: StepId, status: StepStatus, extra: Partial<PayStep> = {}) => onStep(id, { status, ...extra });

  requireAttribution();
  if (!CNGN_ADDRESS) throw new PaymentError("config", "Set NEXT_PUBLIC_CNGN_ADDRESS to the verified cNGN contract. Nothing was sent.");
  if (!isAddress(args.recipient)) throw new PaymentError("config", "The supplier has no valid wallet address.");
  const recipient = getAddress(args.recipient);
  const payer = signer.account.address;

  step("check", "active");
  await assertCelo(signer);
  const balances = await readBalances(publicClient, payer);
  const decimals = balances.cngnDecimals ?? 18;
  const need = koboToTokenUnits(toKobo(args.amountNaira), decimals);
  if (balances.celo === 0n) {
    step("check", "error");
    throw new PaymentError("no_gas", `${payer} has no CELO for network fees. Add a small amount of CELO first.`);
  }
  step("check", "done", { detail: `${formatUnits(balances.cngn ?? 0n, decimals)} cNGN, ${formatUnits(balances.usdt, 6)} USD₮` });

  let fx: FxRecord | undefined;
  const shortfall = need - (balances.cngn ?? 0n);
  if (shortfall <= 0n) {
    for (const id of ["fx", "approve", "swap"] as const) step(id, "skipped", { detail: "Enough cNGN already" });
  } else {
    step("fx", "active");
    const quote = await fetchFxQuote(shortfall, decimals, payer);
    if (!quote.executable || !quote.transaction) {
      step("fx", "error", { detail: quote.note ?? `${quote.provider} quote is not executable` });
      throw new PaymentError(
        "fx_unavailable",
        `No live USD₮→cNGN route is configured (${quote.provider}). Top up cNGN directly or configure an FX provider.`,
      );
    }
    const sellAmount = BigInt(quote.sellAmount);
    step("fx", "done", { detail: `${quote.provider}: 1 USD₮ ≈ ${quote.rate} cNGN, selling ${formatUnits(sellAmount, 6)} USD₮` });
    if (balances.usdt < sellAmount) {
      throw new PaymentError(
        "low_balance",
        `Not enough USD₮: the swap needs ${formatUnits(sellAmount, 6)} but the wallet has ${formatUnits(balances.usdt, 6)}.`,
      );
    }
    fx = {
      provider: quote.provider,
      rate: quote.rate,
      sellAmountUsdt: formatUnits(sellAmount, 6),
      buyAmountCngn: formatUnits(BigInt(quote.buyAmount), decimals),
    };

    if (quote.allowanceTarget) {
      const allowance = await publicClient.readContract({
        address: USDT_ADDRESS,
        abi: erc20Abi,
        functionName: "allowance",
        args: [payer, quote.allowanceTarget],
      });
      if (allowance < sellAmount) {
        step("approve", "active", { detail: "Confirm in wallet" });
        // Approve exactly the sell amount, never unlimited.
        const approveHash = await withStep("approve", onStep, () =>
          sendTagged(signer, publicClient, {
            to: USDT_ADDRESS,
            data: encodeFunctionData({ abi: erc20Abi, functionName: "approve", args: [quote.allowanceTarget!, sellAmount] }),
          }),
        );
        fx.approveTxHash = approveHash;
        step("approve", "done", { hash: approveHash });
      } else {
        step("approve", "skipped", { detail: "Allowance already set" });
      }
    } else {
      step("approve", "skipped");
    }

    step("swap", "active", { detail: "Confirm in wallet" });
    const swapHash = await withStep("swap", onStep, () =>
      sendTagged(signer, publicClient, {
        to: quote.transaction!.to,
        data: quote.transaction!.data,
        value: BigInt(quote.transaction!.value),
      }),
    ).catch((error: unknown) => {
      if (error instanceof PaymentError && error.code !== "rejected") {
        throw new PaymentError("swap_failed", `The USD₮→cNGN swap failed: ${error.message} No supplier payment was sent.`, error.hash);
      }
      throw error;
    });
    fx.swapTxHash = swapHash;
    step("swap", "done", { hash: swapHash });

    const after = await publicClient.readContract({ address: CNGN_ADDRESS, abi: erc20Abi, functionName: "balanceOf", args: [payer] });
    if (after < need) {
      throw new PaymentError(
        "swap_failed",
        `The swap left ${formatUnits(after, decimals)} cNGN, short of the ${formatUnits(need, decimals)} needed. No supplier payment was sent.`,
        swapHash,
      );
    }
  }

  step("transfer", "active", { detail: "Confirm in wallet" });
  const transferHash = await withStep("transfer", onStep, () =>
    sendTagged(signer, publicClient, {
      to: CNGN_ADDRESS!,
      data: encodeFunctionData({ abi: erc20Abi, functionName: "transfer", args: [recipient, need] }),
    }),
  );
  step("transfer", "done", { hash: transferHash });
  return fx ? { transferHash, fx } : { transferHash };
}

async function withStep<T>(id: StepId, onStep: (id: StepId, patch: Partial<PayStep>) => void, run: () => Promise<T>): Promise<T> {
  try {
    return await run();
  } catch (error) {
    const hash = error instanceof PaymentError ? error.hash : undefined;
    onStep(id, { status: "error", detail: error instanceof Error ? error.message : String(error), ...(hash ? { hash } : {}) });
    throw error;
  }
}

async function fetchFxQuote(buyAmount: bigint, decimals: number, taker: Address): Promise<FxQuote> {
  const query = new URLSearchParams({ buyAmount: buyAmount.toString(), decimals: String(decimals), taker });
  const response = await fetch(`/api/fx/quote?${query}`, { cache: "no-store" });
  const body = (await response.json()) as FxQuote | FxQuoteError;
  if (!response.ok || "error" in body) {
    throw new PaymentError("fx_unavailable", "error" in body ? body.error : "FX quote failed.");
  }
  return body;
}
