import { agentPolicyActive } from "./rules.ts";
import type { Business } from "./types.ts";

export interface SetupStep {
  id: "profile" | "rules" | "agent" | "identity";
  label: string;
  hint: string;
  done: boolean;
  href: string;
}

/** The four steps a live shop completes before any payment can go out. */
export function setupSteps(business: Business | null, now = new Date()): SetupStep[] {
  return [
    { id: "profile", label: "Your shop", hint: "Name and area", done: Boolean(business), href: "/app/settings#profile" },
    { id: "rules", label: "Weekly limit", hint: "How much Emporos can spend without asking", done: Boolean(business?.rulesSavedAt), href: "/app/settings#rules" },
    { id: "agent", label: "Create your balance", hint: "Where your money for supplies lives. Then add money", done: Boolean(business?.altanaWallet) || agentPolicyActive(business?.agent, now), href: "/app/add-money" },
    { id: "identity", label: "Turn on auto-pay", hint: "One tap. Also gives your shop its public agent ID", done: agentPolicyActive(business?.agent, now) && Boolean(business?.agentId), href: "/app/settings#agent" },
  ];
}

export function setupComplete(business: Business | null): boolean {
  return setupSteps(business).every((step) => step.done);
}
