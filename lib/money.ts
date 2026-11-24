// Exact naira arithmetic in kobo (1 NGN = 100 kobo). Never use floats for money.

const NAIRA_RE = /^(0|[1-9]\d*)(\.\d{1,2})?$/;

export function isNaira(value: string): boolean {
  return NAIRA_RE.test(value.trim());
}

export function toKobo(value: string, label = "Amount"): bigint {
  const trimmed = value.trim();
  if (!NAIRA_RE.test(trimmed)) {
    throw new Error(`${label} must be a naira amount with at most 2 decimal places.`);
  }
  const [whole = "0", fraction = ""] = trimmed.split(".");
  return BigInt(whole) * 100n + BigInt(fraction.padEnd(2, "0"));
}

export function fromKobo(kobo: bigint): string {
  const negative = kobo < 0n;
  const abs = negative ? -kobo : kobo;
  const whole = abs / 100n;
  const fraction = abs % 100n;
  const text = fraction === 0n ? whole.toString() : `${whole}.${fraction.toString().padStart(2, "0")}`;
  return negative ? `-${text}` : text;
}

/** "₦1,250,000" or "₦1,250,000.50". */
export function formatNaira(value: string | bigint): string {
  const kobo = typeof value === "bigint" ? value : toKobo(value);
  const negative = kobo < 0n;
  const abs = negative ? -kobo : kobo;
  const whole = (abs / 100n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  const fraction = abs % 100n;
  const text = fraction === 0n ? whole : `${whole}.${fraction.toString().padStart(2, "0")}`;
  return `${negative ? "-" : ""}₦${text}`;
}

/** Convert kobo to on-chain token units for a token whose 1.0 equals 1 NGN. */
export function koboToTokenUnits(kobo: bigint, decimals: number): bigint {
  if (decimals >= 2) return kobo * 10n ** BigInt(decimals - 2);
  // Round up so we never under-pay a supplier.
  const divisor = 10n ** BigInt(2 - decimals);
  return (kobo + divisor - 1n) / divisor;
}

export function sumKobo(values: string[]): bigint {
  return values.reduce((total, value) => total + toKobo(value), 0n);
}
