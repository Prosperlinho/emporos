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
    { id: "profile", label: "Your shop", hint: "Name and location", done: Boolean(business), href: "/app/settings#profile" },
    { id: "rules", label: "Spending rules", hint: "Per-order limit and cap", done: Boolean(business?.rulesSavedAt), href: "/app/settings#rules" },
    { id: "agent", label: "Agent wallet", hint: "Create, fund, activate", done: agentPolicyActive(business?.agent, now), href: "/app/settings#agent" },
    { id: "identity", label: "Register on Celo", hint: "Agent ID + directory", done: Boolean(business?.agentId), href: "/app/settings#identity" },
  ];
}

export function setupComplete(business: Business | null): boolean {
  return setupSteps(business).every((step) => step.done);
}
