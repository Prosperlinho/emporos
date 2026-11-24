import assert from "node:assert/strict";
import { test } from "node:test";
import { formatNaira, fromKobo, koboToTokenUnits, toKobo } from "./money.ts";
import { parseNairaAmount, parseRequestText } from "./parse.ts";
import { itemMatchScore, recommend } from "./ranking.ts";
import { checkRules, periodStart } from "./rules.ts";
import { DEMO_PRODUCTS, DEMO_SUPPLIERS, demoBusiness } from "./seed.ts";
import type { AgentPolicy, Order, PurchaseRequest } from "./types.ts";

test("money round-trips exactly in kobo", () => {
  assert.equal(toKobo("2000000"), 200_000_000n);
  assert.equal(toKobo("12.5"), 1250n);
  assert.equal(fromKobo(1250n), "12.50");
  assert.equal(formatNaira("1250000.5"), "₦1,250,000.50");
  assert.throws(() => toKobo("1.234"));
  assert.equal(koboToTokenUnits(150n, 6), 1_500_000n);
  assert.equal(koboToTokenUnits(150n, 18), 1_500_000_000_000_000_000n);
});

test("naira amounts with suffixes", () => {
  assert.equal(parseNairaAmount("₦2m"), "2000000");
  assert.equal(parseNairaAmount("2.5 million naira"), "2500000");
  assert.equal(parseNairaAmount("N450,000"), "450000");
  assert.equal(parseNairaAmount("900k"), "900000");
});

test("parses the canonical request", () => {
  const parsed = parseRequestText("50 bags of rice, under ₦2m, Lagos, 5 days");
  assert.deepEqual(parsed.missing, []);
  assert.equal(parsed.request.quantity, 50);
  assert.equal(parsed.request.maxBudget, "2000000");
  assert.equal(parsed.request.deliveryArea, "Lagos");
  assert.equal(parsed.request.deadlineDays, 5);
  assert.match(parsed.request.item ?? "", /rice/);
});

test("a duration after 'within' is not a budget", () => {
  const parsed = parseRequestText("20 cartons of noodles to Ikeja within 3 days");
  assert.equal(parsed.request.deadlineDays, 3);
  assert.equal(parsed.request.maxBudget, undefined);
  assert.ok(parsed.missing.includes("maxBudget"));
});

test("item matching ignores units and plurals", () => {
  assert.equal(itemMatchScore("rice (bags)", "Parboiled rice 50kg bag"), 1);
  assert.equal(itemMatchScore("rice (bags)", "Honey beans 50kg bag"), 0);
});

const rice: PurchaseRequest = { item: "rice (bags)", quantity: 50, maxBudget: "2000000", deliveryArea: "Lagos", deadlineDays: 5 };

test("recommends the best eligible rice quote with reasons", () => {
  const rec = recommend(rice, DEMO_PRODUCTS, DEMO_SUPPLIERS);
  assert.ok(rec.best);
  // Okon is cheapest per unit but Ada wins on total once delivery is included and is faster.
  assert.equal(rec.best.supplierId, "demo-sup-ada");
  assert.equal(rec.best.total, "1840000");
  const sahel = rec.ranked.find((q) => q.supplierId === "demo-sup-sahel");
  assert.equal(sahel?.eligible, false);
  assert.ok(sahel?.failures.some((f) => f.includes("deadline")));
  const delta = rec.ranked.find((q) => q.supplierId === "demo-sup-delta");
  assert.equal(delta?.eligible, false, "Delta has only 40 in stock");
  assert.ok(rec.reasons.some((r) => r.includes("under budget")));
});

test("no matches explains itself", () => {
  const rec = recommend({ ...rice, item: "printer toner" }, DEMO_PRODUCTS, DEMO_SUPPLIERS);
  assert.equal(rec.best, null);
  assert.match(rec.reasons[0] ?? "", /No supplier/);
});

const now = new Date("2026-11-22T12:00:00Z");
const policy = (over: Partial<AgentPolicy> = {}): AgentPolicy => ({
  provider: "local-session-key",
  address: "0x9999999999999999999999999999999999999999",
  spendCap: "3000000",
  spent: "0",
  allowlist: [DEMO_SUPPLIERS[0]!.walletAddress as `0x${string}`],
  createdAt: "2026-11-20T00:00:00Z",
  expiresAt: "2026-12-20T00:00:00Z",
  ...over,
});

test("within rules lets the agent auto-pay", () => {
  const rec = recommend(rice, DEMO_PRODUCTS, DEMO_SUPPLIERS);
  const result = checkRules({ quote: rec.best!, rules: demoBusiness().rules, orders: [], agent: policy(), now });
  assert.deepEqual(result.violations, []);
  assert.equal(result.withinRules, true);
});

test("rule violations require approval", () => {
  const rec = recommend(rice, DEMO_PRODUCTS, DEMO_SUPPLIERS);
  const rules = { ...demoBusiness().rules, maxPerOrder: "1000000" };
  const prior: Order = {
    id: "o1", businessId: "b", createdAt: now.toISOString(), paidAt: now.toISOString(), status: "paid", paidBy: "agent",
    request: rice, chosen: rec.best!, alternatives: [], reasons: [], ruleCheck: { withinRules: true, violations: [] }, amount: "4000000",
  };
  const result = checkRules({ quote: rec.best!, rules, orders: [prior], agent: policy({ expiresAt: "2026-11-21T00:00:00Z" }), now });
  assert.equal(result.withinRules, false);
  assert.equal(result.violations.length, 3, result.violations.join(" | "));
});

test("allowlist and cap on the agent key are enforced", () => {
  const rec = recommend(rice, DEMO_PRODUCTS, DEMO_SUPPLIERS);
  const result = checkRules({ quote: rec.best!, rules: demoBusiness().rules, orders: [], agent: policy({ allowlist: [], spent: "2500000" }), now });
  assert.equal(result.violations.length, 2, result.violations.join(" | "));
});

test("weeks start on Monday", () => {
  assert.equal(periodStart("weekly", new Date(2026, 10, 22, 15)).getDay(), 1); // Sun 22 Nov → Mon 16 Nov
});
