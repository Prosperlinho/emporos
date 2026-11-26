"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { shortAddress, txUrl } from "@/lib/chain/config.ts";
import type { PayStep } from "@/lib/payments.ts";
import type { SetupStep } from "@/lib/setup.ts";
import type { OrderStatus } from "@/lib/types.ts";

export function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function TxLink({ hash, simulated, label }: { hash?: string | undefined; simulated?: boolean | undefined; label?: string }) {
  if (!hash) return <span className="muted">—</span>;
  if (simulated) return <span className="mono muted" title="Sample data; not on-chain">{shortAddress(hash)} (sample)</span>;
  return (
    <a className="mono" href={txUrl(hash)} target="_blank" rel="noreferrer">
      {label ?? shortAddress(hash)} ↗
    </a>
  );
}

const STATUS_LABEL: Record<OrderStatus, string> = {
  quoted: "Quoted",
  awaiting_approval: "Needs approval",
  paying: "Paying",
  paid: "Paid",
  delivered: "Delivered",
  failed: "Failed",
  cancelled: "Cancelled",
};

export function StatusBadge({ status }: { status: OrderStatus }) {
  return (
    <span className={`badge status-${status}`}>
      <span className="dot" /> {STATUS_LABEL[status]}
    </span>
  );
}

/** quoted → paid → delivered progress bar. */
export function OrderTimeline({ status }: { status: OrderStatus }) {
  const level = status === "delivered" ? 3 : status === "paid" ? 2 : status === "failed" || status === "cancelled" ? 0 : 1;
  return (
    <div className="timeline" aria-label={`Progress: ${STATUS_LABEL[status]}`}>
      <span className={level >= 1 ? "on" : ""} />
      <span className={level >= 2 ? "on" : ""} />
      <span className={level >= 3 ? "on" : ""} />
    </div>
  );
}

const STEP_ICON: Record<PayStep["status"], string> = { pending: "", active: "…", done: "✓", skipped: "–", error: "!" };

export function StepList({ steps, simulated }: { steps: PayStep[]; simulated?: boolean }) {
  return (
    <ol className="steps">
      {steps.map((step) => (
        <li key={step.id} data-status={step.status}>
          <span className="s-icon" aria-hidden="true">{STEP_ICON[step.status]}</span>
          <div>
            <div>{step.label}</div>
            {step.detail && <div className="small muted">{step.detail}</div>}
            {step.hash && <div className="small"><TxLink hash={step.hash} simulated={simulated} /></div>}
          </div>
        </li>
      ))}
    </ol>
  );
}

export function Empty({ children, action }: { children: ReactNode; action?: { href: string; label: string } }) {
  return (
    <div className="panel">
      <p className="muted" style={{ marginBottom: action ? 12 : 0 }}>{children}</p>
      {action && <Link className="btn" href={action.href}>{action.label}</Link>}
    </div>
  );
}

/** Setup progress shown until a live shop has finished all four steps. */
export function SetupChecklist({ steps }: { steps: SetupStep[] }) {
  const done = steps.filter((s) => s.done).length;
  if (done === steps.length) return null;
  const next = steps.find((s) => !s.done)!;
  return (
    <section className="panel accent setup">
      <div className="row between">
        <h2>Finish setting up</h2>
        <span className="badge">{done} of {steps.length}</span>
      </div>
      <p className="sub">You can search and compare now. Payments unlock when all four steps are done.</p>
      <div className="timeline">{steps.map((s) => <span key={s.id} className={s.done ? "on" : ""} />)}</div>
      <ol className="setup-steps">
        {steps.map((s) => (
          <li key={s.id} className={s.done ? "done" : s.id === next.id ? "next" : ""}>
            <Link href={s.href}>
              <span className="setup-icon" aria-hidden="true">{s.done ? "✓" : ""}</span>
              <span><b>{s.label}</b><small>{s.hint}</small></span>
              {!s.done && s.id === next.id && <span className="setup-go">Next →</span>}
            </Link>
          </li>
        ))}
      </ol>
    </section>
  );
}
