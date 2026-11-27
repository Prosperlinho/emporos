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
    { id: "agent", label: "Turn on auto-pay", hint: "Create your Emporos balance and switch on auto-pay", done: agentPolicyActive(business?.agent, now), href: "/app/settings#agent" },
    { id: "identity", label: "Get your agent ID", hint: "So suppliers can look your shop up", done: Boolean(business?.agentId), href: "/app/settings#identity" },
  ];
}

export function setupComplete(business: Business | null): boolean {
  return setupSteps(business).every((step) => step.done);
}
