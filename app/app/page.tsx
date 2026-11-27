"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useApp } from "@/components/AppContext.tsx";
import { errorText, SetupChecklist, StepList } from "@/components/ui.tsx";
import { setupSteps } from "@/lib/setup.ts";
import { usePayOrder } from "@/components/usePayOrder.ts";
import { liveReadiness } from "@/lib/chain/config.ts";
import { formatNaira, isNaira } from "@/lib/money.ts";
import { isCompleteRequest, missingFields } from "@/lib/parse.ts";
import { recommend } from "@/lib/ranking.ts";
import { checkRules } from "@/lib/rules.ts";
import type { Order, ParsedRequest, PurchaseRequest, Recommendation, RuleCheck } from "@/lib/types.ts";

const EXAMPLES = [
  "50 bags of rice, under ₦2m, Lagos, 5 days",
  "20 cartons of noodles to Lagos within 3 days, budget ₦300k",
  "30 jerrycans of groundnut oil, max ₦1.5m, Lagos, 2 days",
];

const FIELD_LABEL: Record<keyof PurchaseRequest, string> = {
  item: "Item",
  quantity: "Quantity",
  maxBudget: "Budget (₦)",
  deliveryArea: "Deliver to",
  deadlineDays: "Within (days)",
};

const AUTO_PAY_SECONDS = 5;

export default function AgentPage() {
  const { mode, store, business } = useApp();
  const { pay, steps, running, ownerConnected } = usePayOrder();

  const [text, setText] = useState("");
  const [parsing, setParsing] = useState(false);
  const [parseSource, setParseSource] = useState<ParsedRequest["source"] | null>(null);
  const [fields, setFields] = useState<Partial<PurchaseRequest> | null>(null);
  const [rec, setRec] = useState<Recommendation | null>(null);
  const [ruleCheck, setRuleCheck] = useState<RuleCheck | null>(null);
  const [order, setOrder] = useState<Order | null>(null);
  const [countdown, setCountdown] = useState<number | null>(null);
  const [error, setError] = useState("");
  const [showAll, setShowAll] = useState(false);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  const readiness = mode === "live" ? liveReadiness() : [];
  const setup = setupSteps(business);
  // Live shops can search before setup is done, but nothing is paid until all four steps are complete.
  const setupDone = mode === "demo" || setup.every((s) => s.done);

  useEffect(() => () => { if (timer.current) clearInterval(timer.current); }, []);

  function reset() {
    if (timer.current) clearInterval(timer.current);
    setCountdown(null);
    setRec(null);
    setRuleCheck(null);
    setOrder(null);
    setError("");
  }

  async function understand(input = text) {
    reset();
    setFields(null);
    if (!input.trim()) return setError("Describe what you need: item, quantity, budget, where and how soon.");
    setParsing(true);
    try {
      const response = await fetch("/api/parse", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ text: input }) });
      const body = (await response.json()) as ParsedRequest & { error?: string };
      if (!response.ok) throw new Error(body.error ?? "Could not read that request.");
      setParseSource(body.source);
      setFields(body.request);
      if (isCompleteRequest(body.request)) await findSuppliers(body.request);
    } catch (e) {
      setError(errorText(e));
    } finally {
      setParsing(false);
    }
  }

  async function findSuppliers(request: PurchaseRequest) {
    reset();
    if (!business) return setError("Set up your business profile in Settings first.");
    try {
      const [products, suppliers, orders] = await Promise.all([store.listProducts(), store.listSuppliers(), store.listOrders()]);
      const recommendation = recommend(request, products, suppliers);
      setRec(recommendation);
      if (!recommendation.best) return;

      const check = checkRules({ quote: recommendation.best, rules: business.rules, orders, agent: business.agent });
      setRuleCheck(check);
      const created = await store.createOrder({
        status: check.withinRules ? "quoted" : "awaiting_approval",
        request,
        chosen: recommendation.best,
        alternatives: recommendation.ranked.filter((q) => q.productId !== recommendation.best!.productId),
        reasons: recommendation.reasons,
        ruleCheck: check,
        amount: recommendation.best.total,
      });
      setOrder(created);
      if (check.withinRules && readiness.length === 0 && setupDone) startAutoPay(created);
    } catch (e) {
      setError(errorText(e));
    }
  }

  function startAutoPay(target: Order) {
    setCountdown(AUTO_PAY_SECONDS);
    let left = AUTO_PAY_SECONDS;
    timer.current = setInterval(() => {
      left -= 1;
      setCountdown(left);
      if (left <= 0) {
        clearInterval(timer.current!);
        timer.current = null;
        setCountdown(null);
        void runPayment(target, "agent");
      }
    }, 1000);
  }

  async function cancelAutoPay() {
    if (timer.current) clearInterval(timer.current);
    timer.current = null;
    setCountdown(null);
    if (order) setOrder(await store.updateOrder(order.id, { status: "awaiting_approval" }));
  }

  async function runPayment(target: Order, by: "agent" | "owner") {
    setError("");
    try {
      setOrder(await pay(target, by));
    } catch (e) {
      setError(errorText(e));
      setOrder(await store.getOrder(target.id));
    }
  }

  const missing = fields ? missingFields(fields) : [];
  const best = rec?.best ?? null;
  const visible = rec ? (showAll ? rec.ranked : rec.ranked.slice(0, 4)) : [];

  return (
    <>
      <section className="page-head">
        <h1>What do you need?</h1>
        <p>Item, quantity, budget, place, deadline.</p>
      </section>

      {mode === "live" && <SetupChecklist steps={setup} />}
      {readiness.length > 0 && (
        <div className="notice warn" style={{ marginTop: 12 }}>
          Payments are off until configured: {readiness.join("; ")}.
        </div>
      )}

      <section className="panel accent">
        <form onSubmit={(e) => { e.preventDefault(); void understand(); }} className="stack">
          <label className="field">
            <span>Request</span>
            <textarea value={text} onChange={(e) => setText(e.target.value)} placeholder={EXAMPLES[0]} maxLength={600} />
          </label>
          <button className="btn primary block" type="submit" disabled={parsing}>
            {parsing ? "Reading…" : "Find supplier →"}
          </button>
          <div className="chips">
            {EXAMPLES.map((example) => (
              <button key={example} type="button" className="chip" onClick={() => { setText(example); void understand(example); }}>
                {example}
              </button>
            ))}
          </div>
        </form>
      </section>

      {error && <div className="notice error" style={{ marginTop: 12 }}>{error}</div>}

      {fields && (
        <section className="panel">
          <div className="row between">
            <h2>Understood</h2>
            {parseSource && <span className="badge">{parseSource === "llm" ? "AI parsed" : "Rule parsed"}</span>}
          </div>
          
          <form
            className="grid-2"
            onSubmit={(e) => {
              e.preventDefault();
              if (isCompleteRequest(fields)) void findSuppliers(fields);
            }}
          >
            {(Object.keys(FIELD_LABEL) as (keyof PurchaseRequest)[]).map((key) => (
              <label key={key} className="field">
                <span>
                  {FIELD_LABEL[key]} {missing.includes(key) && <span style={{ color: "var(--amber)" }}>· needed</span>}
                </span>
                <input
                  value={fields[key] ?? ""}
                  inputMode={key === "item" || key === "deliveryArea" ? "text" : "numeric"}
                  onChange={(e) => {
                    const v = e.target.value;
                    const next = { ...fields };
                    if (key === "quantity" || key === "deadlineDays") {
                      if (v === "") delete next[key];
                      else next[key] = Number(v.replace(/\D/g, ""));
                    } else if (key === "maxBudget") {
                      const cleaned = v.replace(/[\u20A6,\s]/g, "");
                      if (cleaned === "" || !isNaira(cleaned)) delete next.maxBudget;
                      else next.maxBudget = cleaned;
                    } else next[key] = v;
                    setFields(next);
                  }}
                />
              </label>
            ))}
            <button className="btn block" type="submit" disabled={missing.length > 0}>
              {missing.length ? `Add ${missing.map((m) => FIELD_LABEL[m].toLowerCase()).join(", ")}` : "Search again"}
            </button>
          </form>
        </section>
      )}

      {rec && (
        <section className="panel">
          <h2>{best ? "Recommendation" : "No supplier fits yet"}</h2>
          {best && (
            <div className="item best" style={{ marginTop: 10 }}>
              <div className="row between">
                <div>
                  <div className="item-title">{best.supplierName}</div>
                  <div className="small muted">{best.itemName}</div>
                </div>
                <div className="big">{formatNaira(best.total)}</div>
              </div>
              <div className="row small muted" style={{ marginTop: 6 }}>
                <span>{best.deliveryDays} day(s)</span>·<span>{best.stock} in stock</span>·
                {best.supplierVerified ? <span className="badge green">Verified</span> : <span className="badge amber">Unverified</span>}
              </div>
            </div>
          )}
          <ul className="reasons">
            {rec.reasons.map((reason) => <li key={reason}>{reason}</li>)}
          </ul>

          {rec.ranked.length > 0 && (
            <>
              <h3 className="small muted" style={{ margin: "16px 0 8px" }}>All quotes ({rec.ranked.length})</h3>
              <ul className="list">
                {visible.map((q) => (
                  <li key={q.productId} className={`item ${q.eligible ? "" : "out"}`}>
                    <div className="row between">
                      <span className="item-title">{q.supplierName}</span>
                      <strong>{formatNaira(q.total)}</strong>
                    </div>
                    <div className="small muted">
                      {q.deliveryDays}d · {q.stock} in stock · {formatNaira(q.unitPrice)}/{q.unit}
                      {q.eligible ? ` · score ${q.score}` : ""}
                    </div>
                    {!q.eligible && <div className="small" style={{ color: "var(--danger)" }}>{q.failures.join("; ")}</div>}
                  </li>
                ))}
              </ul>
              {rec.ranked.length > 4 && (
                <button className="link-btn small" type="button" onClick={() => setShowAll(!showAll)} style={{ marginTop: 8 }}>
                  {showAll ? "Show fewer" : `Show all ${rec.ranked.length}`}
                </button>
              )}
            </>
          )}
        </section>
      )}

      {order && ruleCheck && (
        <section className={`panel ${order.status === "failed" ? "error" : ruleCheck.withinRules ? "accent" : "warn"}`}>
          {order.status === "paid" || order.status === "delivered" ? (
            <>
              <h2>Paid {formatNaira(order.amount)} to {order.chosen.supplierName}</h2>
              <p className="sub">
                {order.paidBy === "agent" ? "Paid automatically, within your limit." : "You approved this payment."}
                {order.simulated ? " (Sample, no real payment.)" : ""}
              </p>
              <StepList steps={steps} simulated={order.simulated} />
              <div className="row" style={{ marginTop: 14 }}>
                <Link className="btn primary" href={`/app/orders/${order.id}`}>View receipt</Link>
                <button className="btn" type="button" onClick={() => { setText(""); setFields(null); reset(); }}>New request</button>
              </div>
            </>
          ) : running || order.status === "paying" ? (
            <>
              <h2>Paying {order.chosen.supplierName}…</h2>
              <p className="sub">{order.paidBy === "owner" ? "Confirm with your fingerprint or wallet." : "This takes a few seconds."}</p>
              <StepList steps={steps} simulated={mode === "demo"} />
            </>
          ) : ruleCheck.withinRules && countdown !== null ? (
            <>
              <h2>Paying automatically in {countdown}s</h2>
              <p className="sub">{formatNaira(order.amount)} cNGN to {order.chosen.supplierName}.</p>
              <button className="btn block" type="button" onClick={() => void cancelAutoPay()}>Stop</button>
            </>
          ) : (
            <>
              <h2>{ruleCheck.withinRules ? "Ready to pay" : "Emporos needs your OK"}</h2>
              {ruleCheck.violations.length > 0 && (
                <ul className="reasons">
                  {ruleCheck.violations.map((v) => <li key={v}>{v.charAt(0).toUpperCase() + v.slice(1)}</li>)}
                </ul>
              )}
              {order.error && <div className="notice error" style={{ margin: "10px 0" }}>{order.error}</div>}
              {order.status === "failed" && steps.some((s) => s.status !== "pending") && <StepList steps={steps} simulated={mode === "demo"} />}
              <div className="stack" style={{ marginTop: 12 }}>
                <button
                  className="btn primary block"
                  type="button"
                  disabled={readiness.length > 0 || !setupDone || (mode === "live" && !ownerConnected)}
                  onClick={() => void runPayment(order, "owner")}
                >
                  Approve &amp; pay {formatNaira(order.amount)}
                </button>
                {!setupDone && <p className="small muted">Finish setup above to unlock payments.</p>}
                {setupDone && mode === "live" && !ownerConnected && <p className="small muted">Connect your wallet to approve.</p>}
                <Link className="btn block" href={`/app/orders/${order.id}`}>Save for later</Link>
              </div>
            </>
          )}
        </section>
      )}
    </>
  );
}
