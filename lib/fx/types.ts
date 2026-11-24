// Shape returned by /api/fx/quote. Amounts are base-unit integer strings (JSON-safe bigints).
export interface FxQuote {
  provider: "textile" | "0x" | "demo";
  /** True only when `transaction` can be signed and sent as-is (before attribution tagging). */
  executable: boolean;
  sellToken: `0x${string}`;
  buyToken: `0x${string}`;
  sellAmount: string;
  buyAmount: string;
  minBuyAmount: string;
  /** cNGN per 1 USD₮, human readable. */
  rate: string;
  /** Spender that needs a USD₮ allowance before the swap, if any. */
  allowanceTarget?: `0x${string}`;
  transaction?: { to: `0x${string}`; data: `0x${string}`; value: string };
  note?: string;
}

export interface FxQuoteError {
  error: string;
  provider?: string;
}
