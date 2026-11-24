// Decides whether the agent may pay on its own or must ask the owner.
import { formatNaira, toKobo } from "./money.ts";
import type { AgentPolicy, Order, RankedQuote, RuleCheck, SpendingRules } from "./types.ts";

export const DEFAULT_RULES: SpendingRules = {
  maxPerOrder: "500000",
  periodCap: "2000000",
  period: "weekly",
  requireApprovedSupplier: true,
  approvedSupplierIds: [],
};

export function periodStart(period: SpendingRules["period"], now: Date): Date {
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  if (period === "weekly") {
    // Weeks start on Monday.
    const day = (start.getDay() + 6) % 7;
    start.setDate(start.getDate() - day);
  }
  return start;
}

const SPENT_STATUSES = new Set<Order["status"]>(["paying", "paid", "delivered"]);

export function spentInPeriod(orders: Order[], rules: SpendingRules, now: Date): bigint {
  const start = periodStart(rules.period, now).getTime();
  return orders
    .filter((order) => SPENT_STATUSES.has(order.status) && order.paidBy === "agent")
    .filter((order) => new Date(order.paidAt ?? order.createdAt).getTime() >= start)
    .reduce((total, order) => total + toKobo(order.amount), 0n);
}

export function agentPolicyActive(policy: AgentPolicy | undefined, now: Date): boolean {
  return Boolean(policy && !policy.revokedAt && new Date(policy.expiresAt).getTime() > now.getTime());
}

export function checkRules(args: {
  quote: RankedQuote;
  rules: SpendingRules;
  orders: Order[];
  agent: AgentPolicy | undefined;
  now?: Date;
}): RuleCheck {
  const { quote, rules, orders, agent } = args;
  const now = args.now ?? new Date();
  const amount = toKobo(quote.total);
  const violations: string[] = [];

  if (!quote.eligible) violations.push("the quote does not meet the request");
  if (amount > toKobo(rules.maxPerOrder)) {
    violations.push(`${formatNaira(amount)} is over your ${formatNaira(rules.maxPerOrder)} per-order limit`);
  }
  const spent = spentInPeriod(orders, rules, now);
  if (spent + amount > toKobo(rules.periodCap)) {
    violations.push(
      `would bring ${rules.period} agent spending to ${formatNaira(spent + amount)}, over your ${formatNaira(rules.periodCap)} cap`,
    );
  }
  if (rules.requireApprovedSupplier && !rules.approvedSupplierIds.includes(quote.supplierId)) {
    violations.push(`${quote.supplierName} is not on your approved supplier list`);
  }

  if (!agent || !agentPolicyActive(agent, now)) {
    violations.push(agent?.revokedAt ? "the agent wallet was revoked" : agent ? "the agent session key has expired" : "no agent wallet is set up");
  } else {
    const remaining = toKobo(agent.spendCap) - toKobo(agent.spent);
    if (amount > remaining) {
      violations.push(`agent wallet has ${formatNaira(remaining < 0n ? 0n : remaining)} left of its ${formatNaira(agent.spendCap)} cap`);
    }
    const wallet = quote.supplierWallet.toLowerCase();
    if (!wallet || !agent.allowlist.some((address) => address.toLowerCase() === wallet)) {
      violations.push(`${quote.supplierName}'s wallet is not on the agent's allowlist`);
    }
  }

  return { withinRules: violations.length === 0, violations };
}
