"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useState } from "react";
import { providerFor } from "@/lib/agent-wallet.ts";
import { PaymentError } from "@/lib/chain/tx.ts";
import { formatUnits } from "viem";
import { fromKobo, koboToTokenUnits, toKobo } from "@/lib/money.ts";
import { initialSteps, payInCngn, type PayStep, type StepId } from "@/lib/payments.ts";
import type { FxQuote } from "@/lib/fx/types.ts";
import type { FxRecord, Order } from "@/lib/types.ts";
import { useApp } from "./AppContext.tsx";
import { useCeloPublicClient, useOwnerSigner } from "./hooks.ts";

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const fakeHash = () =>
  `0x${Array.from(crypto.getRandomValues(new Uint8Array(32)), (b) => b.toString(16).padStart(2, "0")).join("")}` as `0x${string}`;

export function usePayOrder() {
  const { mode, store, business, setBusiness } = useApp();
  const ownerSigner = useOwnerSigner();
  const publicClient = useCeloPublicClient();
  const queryClient = useQueryClient();
  const [steps, setSteps] = useState<PayStep[]>(initialSteps());
  const [running, setRunning] = useState(false);

  const onStep = useCallback((id: StepId, patch: Partial<PayStep>) => {
    setSteps((current) => current.map((step) => (step.id === id ? { ...step, ...patch } : step)));
  }, []);

  const pay = useCallback(
    async (order: Order, by: "agent" | "owner"): Promise<Order> => {
      if (!business) throw new Error("Set up your business profile first.");
      setSteps(initialSteps());
      setRunning(true);
      try {
        if (!order.chosen.supplierWallet) throw new Error("This supplier has no payout wallet.");

        if (mode === "demo") return await simulate(order, by);

        if (!publicClient) throw new Error("Celo RPC is not available.");

        if (by === "agent" && business.agent?.provider === "altana") {
          const agent = business.agent;
          await store.updateOrder(order.id, { status: "paying", paidBy: "agent", payer: agent.address });
          onStep("check", { status: "done", detail: "Altana wallet; limits enforced on-chain" });
          for (const id of ["fx", "approve", "swap"] as const) onStep(id, { status: "skipped", detail: "Paid from cNGN balance" });
          onStep("transfer", { status: "active", detail: "Agent session key signing" });
          try {
            const { payWithAltana } = await import("@/lib/altana.ts");
            const hash = await payWithAltana(business.id, order.chosen.supplierWallet, order.amount);
            onStep("transfer", { status: "done", hash });
            const paid = await store.updateOrder(order.id, { status: "paid", paymentTxHash: hash, paidAt: new Date().toISOString(), error: "" });
            const spent = fromKobo(toKobo(agent.spent) + toKobo(order.amount));
            setBusiness(await store.saveBusiness({ ...business, agent: { ...agent, spent } }));
            return paid;
          } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            onStep("transfer", { status: "error", detail: message });
            // Submitted but unconfirmed: keep "paying" so it is never paid twice.
            const unconfirmed = error instanceof PaymentError && error.code === "unconfirmed";
            await store.updateOrder(order.id, { status: unconfirmed ? "paying" : "failed", error: message });
            throw error;
          }
        }

        // Owner approval from the Emporos balance: confirmed with fingerprint / Face ID.
        if (by === "owner" && business.altanaWallet && !ownerSigner) {
          const wallet = business.altanaWallet;
          await store.updateOrder(order.id, { status: "paying", paidBy: "owner", payer: wallet });
          onStep("check", { status: "done", detail: "Paying from your Emporos balance" });
          for (const id of ["fx", "approve", "swap"] as const) onStep(id, { status: "skipped" });
          onStep("transfer", { status: "active", detail: "Confirm with your fingerprint or Face ID" });
          try {
            const { payAsOwnerWithAltana } = await import("@/lib/altana.ts");
            const hash = await payAsOwnerWithAltana(wallet, order.chosen.supplierWallet, order.amount);
            onStep("transfer", { status: "done", hash });
            return await store.updateOrder(order.id, { status: "paid", paymentTxHash: hash, paidAt: new Date().toISOString(), error: "" });
          } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            onStep("transfer", { status: "error", detail: message });
            const code = error instanceof PaymentError ? error.code : "unknown";
            await store.updateOrder(order.id, { status: code === "unconfirmed" ? "paying" : code === "rejected" ? "awaiting_approval" : "failed", error: message });
            throw error;
          }
        }

        const signer = by === "agent" ? providerFor(business.agent).signer(business.id, business.agent!) : ownerSigner;
        if (!signer) throw new Error("Connect your wallet to approve this payment.");

        let current = await store.updateOrder(order.id, { status: "paying", paidBy: by, payer: signer.account.address });
        let transferStarted = false;
        const track = (id: StepId, patch: Partial<PayStep>) => {
          if (id === "transfer" && patch.status === "active") transferStarted = true;
          onStep(id, patch);
        };
        try {
          const result = await payInCngn({ signer, publicClient, recipient: order.chosen.supplierWallet, amountNaira: order.amount, onStep: track });
          current = await store.updateOrder(order.id, {
            status: "paid",
            paymentTxHash: result.transferHash,
            ...(result.fx ? { fx: result.fx } : {}),
            paidAt: new Date().toISOString(),
            error: "",
          });
          if (by === "agent" && business.agent) {
            const spent = fromKobo(toKobo(business.agent.spent) + toKobo(order.amount));
            setBusiness(await store.saveBusiness({ ...business, agent: { ...business.agent, spent } }));
          }
          return current;
        } catch (error) {
          const pe = error instanceof PaymentError ? error : null;
          // A sent-but-unconfirmed supplier transfer stays "paying" with its hash so it is never paid twice.
          const transferPending = pe?.code === "unconfirmed" && transferStarted && Boolean(pe.hash);
          const patch: Partial<Order> = transferPending
            ? { status: "paying", paymentTxHash: pe!.hash!, error: pe!.message }
            : { status: pe?.code === "rejected" ? "awaiting_approval" : "failed", error: error instanceof Error ? error.message : String(error) };
          await store.updateOrder(order.id, patch);
          throw error;
        }
      } finally {
        setRunning(false);
        void queryClient.invalidateQueries({ queryKey: ["balances"] });
      }

      async function simulate(o: Order, payer: "agent" | "owner"): Promise<Order> {
        const payerAddress = payer === "agent" ? business!.agent?.address ?? "demo-agent" : "demo-owner";
        await store.updateOrder(o.id, { status: "paying", paidBy: payer, payer: payerAddress, simulated: true });
        onStep("check", { status: "active" });
        await wait(500);
        onStep("check", { status: "done", detail: "Demo wallet: 2,000 USD₮, ₦0 cNGN" });
        onStep("fx", { status: "active" });
        const units = koboToTokenUnits(toKobo(o.amount), 6);
        const response = await fetch(`/api/fx/quote?demo=1&decimals=6&buyAmount=${units}&taker=0x${"9".repeat(40)}`);
        const quote = (await response.json()) as FxQuote;
        const fx: FxRecord = {
          provider: "demo",
          rate: quote.rate,
          sellAmountUsdt: formatUnits(BigInt(quote.sellAmount), 6),
          buyAmountCngn: o.amount,
        };
        onStep("fx", { status: "done", detail: `Demo rate: 1 USD₮ ≈ ${quote.rate} cNGN, selling ${fx.sellAmountUsdt} USD₮` });
        for (const id of ["approve", "swap", "transfer"] as const) {
          onStep(id, { status: "active" });
          await wait(650);
          const hash = fakeHash();
          if (id === "approve") fx.approveTxHash = hash;
          if (id === "swap") fx.swapTxHash = hash;
          onStep(id, { status: "done", hash });
          if (id === "transfer") {
            const updated = await store.updateOrder(o.id, { status: "paid", fx, paymentTxHash: hash, paidAt: new Date().toISOString(), simulated: true });
            if (payer === "agent" && business!.agent) {
              const spent = fromKobo(toKobo(business!.agent.spent) + toKobo(o.amount));
              setBusiness(await store.saveBusiness({ ...business!, agent: { ...business!.agent, spent } }));
            }
            return updated;
          }
        }
        throw new Error("unreachable");
      }
    },
    [business, mode, onStep, ownerSigner, publicClient, queryClient, setBusiness, store],
  );

  // The owner can approve with a connected wallet, or with fingerprint from their Emporos balance.
  return { pay, steps, running, ownerConnected: Boolean(ownerSigner || (mode === "live" && business?.altanaWallet)) };
}
