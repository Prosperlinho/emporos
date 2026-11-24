// Turns supplier catalog entries into quotes for a request, ranks them, and explains the pick.
import { formatNaira, fromKobo, toKobo } from "./money.ts";
import type { Product, PurchaseRequest, Quote, RankedQuote, Recommendation, Supplier } from "./types.ts";

const STOP_WORDS = new Set([
  "of", "the", "a", "an", "and", "for", "with", "bag", "bags", "sack", "sacks", "carton", "cartons",
  "box", "boxes", "pack", "packs", "packet", "packets", "piece", "pieces", "unit", "units", "crate",
  "crates", "bottle", "bottles", "tin", "tins", "keg", "kegs", "jerrycan", "jerrycans", "kg", "litre",
  "litres", "liter", "liters", "g", "l", "ml",
]);

function singular(word: string): string {
  if (word.length > 4 && word.endsWith("ies")) return `${word.slice(0, -3)}y`;
  if (word.length > 3 && word.endsWith("es") && /(?:ch|sh|x|s|z|o)es$/.test(word)) return word.slice(0, -2);
  if (word.length > 3 && word.endsWith("s") && !word.endsWith("ss")) return word.slice(0, -1);
  return word;
}

export function tokens(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[()]/g, " ")
    .split(/[^a-z0-9]+/)
    .filter((word) => word && !STOP_WORDS.has(word) && !/^\d+(?:kg|g|l|ml)?$/.test(word))
    .map(singular);
}

/** Share of the request's meaningful words found in the product name (0–1). */
export function itemMatchScore(requestItem: string, productName: string): number {
  const wanted = tokens(requestItem);
  if (wanted.length === 0) return 0;
  const have = new Set(tokens(productName));
  const hits = wanted.filter((word) => have.has(word)).length;
  return hits / wanted.length;
}

export function servesArea(product: Product, area: string): boolean {
  const target = area.trim().toLowerCase();
  return product.deliveryAreas.some((served) => {
    const s = served.trim().toLowerCase();
    return s === "nationwide" || s === target || target.includes(s) || s.includes(target);
  });
}

export const MIN_MATCH = 0.5;

export function buildQuotes(request: PurchaseRequest, products: Product[], suppliers: Supplier[]): Quote[] {
  const byId = new Map(suppliers.map((supplier) => [supplier.id, supplier]));
  const quotes: Quote[] = [];
  for (const product of products) {
    const supplier = byId.get(product.supplierId);
    if (!supplier) continue;
    const matchScore = itemMatchScore(request.item, product.name);
    if (matchScore < MIN_MATCH) continue;
    const total = toKobo(product.unitPrice) * BigInt(request.quantity) + toKobo(product.deliveryFee);
    quotes.push({
      productId: product.id,
      supplierId: supplier.id,
      supplierName: supplier.name,
      supplierWallet: supplier.walletAddress,
      supplierVerified: supplier.verified,
      itemName: product.name,
      unit: product.unit,
      unitPrice: product.unitPrice,
      deliveryFee: product.deliveryFee,
      quantity: request.quantity,
      total: fromKobo(total),
      stock: product.stock,
      deliveryDays: product.deliveryDays,
      matchScore,
    });
  }
  return quotes;
}

function failuresFor(request: PurchaseRequest, quote: Quote, product: Product | undefined): string[] {
  const failures: string[] = [];
  if (quote.stock < request.quantity) failures.push(`only ${quote.stock} in stock (need ${request.quantity})`);
  if (quote.deliveryDays > request.deadlineDays) {
    failures.push(`${quote.deliveryDays}-day delivery misses the ${request.deadlineDays}-day deadline`);
  }
  if (toKobo(quote.total) > toKobo(request.maxBudget)) {
    failures.push(`${formatNaira(quote.total)} is over the ${formatNaira(request.maxBudget)} budget`);
  }
  if (product && !servesArea(product, request.deliveryArea)) failures.push(`does not deliver to ${request.deliveryArea}`);
  if (!quote.supplierWallet) failures.push("supplier has no payout wallet on file");
  return failures;
}

/**
 * Score eligible quotes: price 60%, delivery speed 25%, stock headroom 10%, verified 5%.
 * Each factor is normalised against the other eligible quotes so the best in class gets full marks.
 */
export function rankQuotes(request: PurchaseRequest, quotes: Quote[], products: Product[] = []): RankedQuote[] {
  const productById = new Map(products.map((product) => [product.id, product]));
  const checked = quotes.map((quote) => {
    const failures = failuresFor(request, quote, productById.get(quote.productId));
    return { ...quote, failures, eligible: failures.length === 0, score: 0 };
  });

  const eligible = checked.filter((quote) => quote.eligible);
  if (eligible.length > 0) {
    const totals = eligible.map((quote) => toKobo(quote.total));
    const minTotal = totals.reduce((a, b) => (a < b ? a : b));
    const minDays = Math.min(...eligible.map((quote) => quote.deliveryDays));
    for (const quote of eligible) {
      const total = toKobo(quote.total);
      // Ratio as a float is fine here: it only orders quotes, it never moves money.
      const price = total === 0n ? 1 : Number((minTotal * 10_000n) / total) / 10_000;
      const speed = (minDays + 1) / (quote.deliveryDays + 1);
      const headroom = Math.min(1, (quote.stock - request.quantity) / Math.max(request.quantity, 1));
      const stock = 0.5 + headroom / 2;
      const verified = quote.supplierVerified ? 1 : 0;
      quote.score = Math.round((price * 60 + speed * 25 + stock * 10 + verified * 5) * 10) / 10;
    }
  }

  return checked.sort((a, b) => {
    if (a.eligible !== b.eligible) return a.eligible ? -1 : 1;
    if (a.eligible) return b.score - a.score || compareTotals(a, b);
    return compareTotals(a, b);
  });
}

function compareTotals(a: Quote, b: Quote): number {
  const diff = toKobo(a.total) - toKobo(b.total);
  return diff < 0n ? -1 : diff > 0n ? 1 : 0;
}

export function recommend(request: PurchaseRequest, products: Product[], suppliers: Supplier[]): Recommendation {
  const ranked = rankQuotes(request, buildQuotes(request, products, suppliers), products);
  const best = ranked.find((quote) => quote.eligible) ?? null;
  return { best, ranked, reasons: best ? explain(request, best, ranked) : explainNone(request, ranked) };
}

export function explain(request: PurchaseRequest, best: RankedQuote, ranked: RankedQuote[]): string[] {
  const reasons: string[] = [];
  const others = ranked.filter((quote) => quote.eligible && quote.productId !== best.productId);
  const budgetLeft = toKobo(request.maxBudget) - toKobo(best.total);

  const cheaper = others.filter((quote) => toKobo(quote.total) < toKobo(best.total));
  if (others.length === 0) {
    reasons.push(`Only supplier that meets every requirement (${ranked.length} quote${ranked.length === 1 ? "" : "s"} checked).`);
  } else if (cheaper.length === 0) {
    const next = others.reduce((a, b) => (toKobo(a.total) <= toKobo(b.total) ? a : b));
    const saving = toKobo(next.total) - toKobo(best.total);
    reasons.push(
      saving > 0n
        ? `Cheapest eligible quote: ${formatNaira(saving)} less than ${next.supplierName}.`
        : `Ties ${next.supplierName} on price.`,
    );
  } else {
    const cheapest = cheaper.reduce((a, b) => (toKobo(a.total) <= toKobo(b.total) ? a : b));
    const extra = toKobo(best.total) - toKobo(cheapest.total);
    reasons.push(
      `${formatNaira(extra)} more than ${cheapest.supplierName}, but delivers in ${best.deliveryDays} day(s) vs ${cheapest.deliveryDays}` +
        `${best.supplierVerified && !cheapest.supplierVerified ? " and is verified" : ""}.`,
    );
  }
  reasons.push(`${formatNaira(best.total)} total (${formatNaira(best.unitPrice)} × ${request.quantity} + ${formatNaira(best.deliveryFee)} delivery), ${formatNaira(budgetLeft)} under budget.`);
  reasons.push(`Delivers to ${request.deliveryArea} in ${best.deliveryDays} day(s); your deadline is ${request.deadlineDays}.`);
  reasons.push(`${best.stock} in stock for your ${request.quantity}.`);
  reasons.push(best.supplierVerified ? "Supplier is verified." : "Supplier is not verified yet; check them before paying.");
  const rejected = ranked.filter((quote) => !quote.eligible);
  if (rejected.length > 0) {
    reasons.push(`Ruled out ${rejected.length}: ${rejected.map((q) => `${q.supplierName} (${q.failures[0]})`).join("; ")}.`);
  }
  return reasons;
}

function explainNone(request: PurchaseRequest, ranked: RankedQuote[]): string[] {
  if (ranked.length === 0) return [`No supplier lists anything matching "${request.item}".`];
  return [
    `None of the ${ranked.length} matching quotes meets every requirement.`,
    ...ranked.map((quote) => `${quote.supplierName}: ${quote.failures.join("; ")}.`),
  ];
}
