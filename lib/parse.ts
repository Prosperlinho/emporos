// Deterministic parser for plain-language purchase requests. Used directly when no
// LLM is configured, and to validate/fill gaps in LLM output.
import type { ParsedRequest, PurchaseRequest } from "./types.ts";

const UNIT_WORDS =
  "bags?|sacks?|cartons?|boxes?|crates?|packs?|packets?|pieces?|pcs|units?|bottles?|tins?|cans?|kegs?|jerrycans?|litres?|liters?|kg|tubers?|tonnes?|tons?|dozens?";

const MULTIPLIERS: Record<string, bigint> = {
  k: 1_000n,
  thousand: 1_000n,
  m: 1_000_000n,
  mn: 1_000_000n,
  million: 1_000_000n,
  b: 1_000_000_000n,
  bn: 1_000_000_000n,
  billion: 1_000_000_000n,
};

/** Parse "₦2m", "2.5 million naira", "N 1,200,000", "500k" into a naira decimal string. */
export function parseNairaAmount(text: string): string | null {
  const pattern =
    /(?:₦|\bN(?=\s?\d)|\bNGN\s?|\bcNGN\s?)?\s*(\d{1,3}(?:,\d{3})+|\d+(?:\.\d+)?)\s*(k|thousand|mn|m|million|bn|b|billion)?\b\s*(?:naira|ngn|cngn)?/i;
  const match = text.match(pattern);
  if (!match?.[1]) return null;
  const raw = match[1].replace(/,/g, "");
  const suffix = match[2]?.toLowerCase();
  const multiplier = suffix ? (MULTIPLIERS[suffix] ?? 1n) : 1n;
  const [whole = "0", fraction = ""] = raw.split(".");
  // Work in kobo-scaled integers to avoid float rounding: value * multiplier * 100.
  const scale = 10n ** BigInt(fraction.length);
  const scaled = BigInt(whole + fraction);
  const kobo = (scaled * multiplier * 100n) / scale;
  if (kobo <= 0n) return null;
  const nairaWhole = kobo / 100n;
  const nairaFraction = kobo % 100n;
  return nairaFraction === 0n ? nairaWhole.toString() : `${nairaWhole}.${nairaFraction.toString().padStart(2, "0")}`;
}

function findBudget(text: string): string | null {
  // 1. An amount explicitly marked as naira wins.
  const currency = text.match(
    /(?:₦|\bN(?=\s?\d)|\bNGN\s?)\s*[\d.,]+\s*(?:k|thousand|mn|m|million|bn|b|billion)?\b|[\d.,]+\s*(?:k|thousand|mn|m|million|bn|b|billion)?\s*(?:naira|ngn)\b/i,
  );
  if (currency?.[0]) {
    const amount = parseNairaAmount(currency[0]);
    if (amount) return amount;
  }
  // 2. Otherwise an amount after a budget cue, unless it is a duration or a quantity.
  const cue =
    /(?:under|below|max(?:imum)?|budget(?:\s+of)?|up\s+to|not\s+more\s+than|no\s+more\s+than|less\s+than)\s*[:=]?\s*([\d.,]+\s*(?:k|thousand|mn|m|million|bn|b|billion)?)\b(?!\s*(?:days?|weeks?|hours?|bags?|cartons?|units?))/i;
  const cueMatch = text.match(cue);
  return cueMatch?.[1] ? parseNairaAmount(cueMatch[1]) : null;
}

const KNOWN_AREAS = [
  "Lagos", "Abuja", "Ibadan", "Kano", "Port Harcourt", "Benin City", "Kaduna", "Enugu", "Onitsha",
  "Aba", "Jos", "Ilorin", "Owerri", "Abeokuta", "Warri", "Uyo", "Calabar", "Akure", "Ikeja",
  "Lekki", "Surulere", "Yaba", "Ikorodu", "Ajah", "Accra", "Kumasi", "Nairobi",
];

function findArea(text: string): string | null {
  const lower = text.toLowerCase();
  const known = KNOWN_AREAS.find((area) => new RegExp(`\\b${area.toLowerCase()}\\b`).test(lower));
  if (known) return known;
  const prepositional = text.match(/\b(?:in|to|at|deliver(?:ed)?\s+to)\s+([A-Z][A-Za-z.'-]+(?:\s+[A-Z][A-Za-z.'-]+)?)/);
  return prepositional?.[1]?.trim() ?? null;
}

function findDeadline(text: string): number | null {
  const days = text.match(/\b(\d{1,3})\s*(?:working\s+|business\s+)?days?\b/i);
  if (days?.[1]) return Number(days[1]);
  const weeks = text.match(/\b(\d{1,2}|a|one|two)\s*weeks?\b/i);
  if (weeks?.[1]) {
    const n = /^\d+$/.test(weeks[1]) ? Number(weeks[1]) : weeks[1].toLowerCase() === "two" ? 2 : 1;
    return n * 7;
  }
  if (/\btomorrow\b/i.test(text)) return 1;
  if (/\btoday\b/i.test(text)) return 0;
  return null;
}

function findQuantityAndItem(text: string): { quantity: number | null; item: string | null } {
  const unitPattern = new RegExp(
    `\\b(\\d{1,6})\\s*(?:x\\s*)?((?:\\d+\\s*(?:kg|g|l|ml|litres?|liters?)\\s+)?(?:${UNIT_WORDS})\\b(?:\\s+of)?\\s+)?([A-Za-z0-9][A-Za-z0-9 \\-'/]*?)(?=\\s*(?:,|;|\\.(?!\\d)|\\bunder\\b|\\bbelow\\b|\\bfor\\b|\\bwithin\\b|\\bin\\b|\\bto\\b|\\bbudget\\b|\\bmax\\b|\\bby\\b|\\bdelivered\\b|\\bdelivery\\b|\\bneeded\\b|₦|$))`,
    "i",
  );
  const match = text.match(unitPattern);
  if (match?.[1] && match[3]) {
    const unit = match[2]?.trim().replace(/\s+of$/i, "") ?? "";
    const noun = match[3].trim().replace(/^of\s+/i, "");
    const item = unit ? `${noun} (${unit})` : noun;
    return { quantity: Number(match[1]), item };
  }
  return { quantity: null, item: null };
}

export function parseRequestText(text: string): ParsedRequest {
  // Remove the budget phrase before hunting for quantity so "₦2m" is never read as "2 m".
  const budget = findBudget(text);
  const { quantity, item } = findQuantityAndItem(
    text.replace(/(?:₦|\bN(?=\s?\d)|\bNGN\s?)\s*[\d.,]+\s*(?:k|thousand|mn|m|million|bn|b|billion)?\b/gi, " "),
  );
  const deliveryArea = findArea(text);
  const deadlineDays = findDeadline(text);

  const request: Partial<PurchaseRequest> = {};
  if (item) request.item = item;
  if (quantity) request.quantity = quantity;
  if (budget) request.maxBudget = budget;
  if (deliveryArea) request.deliveryArea = deliveryArea;
  if (deadlineDays !== null) request.deadlineDays = deadlineDays;

  return { request, missing: missingFields(request), source: "rules" };
}

export function missingFields(request: Partial<PurchaseRequest>): (keyof PurchaseRequest)[] {
  const missing: (keyof PurchaseRequest)[] = [];
  if (!request.item?.trim()) missing.push("item");
  if (!request.quantity || request.quantity <= 0) missing.push("quantity");
  if (!request.maxBudget) missing.push("maxBudget");
  if (!request.deliveryArea?.trim()) missing.push("deliveryArea");
  if (request.deadlineDays === undefined || request.deadlineDays < 0) missing.push("deadlineDays");
  return missing;
}

export function isCompleteRequest(request: Partial<PurchaseRequest>): request is PurchaseRequest {
  return missingFields(request).length === 0;
}
