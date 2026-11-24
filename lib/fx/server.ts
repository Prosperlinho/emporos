// Server-only FX providers for USD₮ → cNGN. Keep API keys here, never in NEXT_PUBLIC_*.
import "server-only";
import { formatUnits, getAddress, type Address } from "viem";
import type { FxQuote } from "./types.ts";

const USDT_DECIMALS = 6;

export interface FxRequest {
  sellToken: Address;
  buyToken: Address;
  buyTokenDecimals: number;
  /** cNGN base units the taker must end up with. */
  buyAmount: bigint;
  taker: Address;
}

interface FxProvider {
  name: FxQuote["provider"];
  configured(): boolean;
  quote(request: FxRequest): Promise<FxQuote>;
}

function rateOf(sell: bigint, buy: bigint, buyDecimals: number): string {
  if (sell === 0n) return "0";
  // cNGN per USD₮ with 4 decimals of precision.
  const scaled = (buy * 10n ** BigInt(USDT_DECIMALS) * 10_000n) / (sell * 10n ** BigInt(buyDecimals));
  return formatUnits(scaled, 4);
}

/**
 * Textile FX. Its public API was not documented when this was written, so this adapter is a
 * placeholder: it reports "not configured" and the app falls back to another provider.
 * To finish it, implement `quote()` against Textile's spec and return a transaction whose
 * calldata can be suffixed with the ERC-8021 attribution tag (the client appends it).
 */
const textile: FxProvider = {
  name: "textile",
  configured: () => false,
  async quote() {
    throw new Error("Textile FX adapter is not implemented yet. Add Textile's API spec to enable it.");
  },
};

/** 0x Swap API v2 (AllowanceHolder). 0x supports Celo; cNGN liquidity depends on its sources. */
const zeroX: FxProvider = {
  name: "0x",
  configured: () => Boolean(process.env.ZEROX_API_KEY),
  async quote(request) {
    const headers = { "0x-api-key": process.env.ZEROX_API_KEY ?? "", "0x-version": "v2" };
    const base = "https://api.0x.org/swap/allowance-holder";
    const params = (sellAmount: bigint, kind: "price" | "quote") =>
      `${base}/${kind}?` +
      new URLSearchParams({
        chainId: "42220",
        sellToken: request.sellToken,
        buyToken: request.buyToken,
        sellAmount: sellAmount.toString(),
        taker: request.taker,
        slippageBps: "50",
      }).toString();

    // 0x quotes by sell amount, so price 1 USD₮ first, then size the sell side with a 1% buffer.
    const probe = await fetchJson(params(10n ** BigInt(USDT_DECIMALS), "price"), headers);
    if (!probe.liquidityAvailable || !probe.buyAmount) throw new Error("0x reports no USD₮→cNGN liquidity right now.");
    const perUsdt = BigInt(probe.buyAmount);
    let sellAmount = (request.buyAmount * 10n ** BigInt(USDT_DECIMALS) * 101n) / (perUsdt * 100n) + 1n;

    for (let attempt = 0; attempt < 2; attempt += 1) {
      const quote = await fetchJson(params(sellAmount, "quote"), headers);
      if (!quote.liquidityAvailable || !quote.transaction) throw new Error("0x could not build a USD₮→cNGN swap.");
      const minBuy = BigInt(quote.minBuyAmount);
      if (minBuy >= request.buyAmount) {
        return {
          provider: "0x",
          executable: true,
          sellToken: request.sellToken,
          buyToken: request.buyToken,
          sellAmount: String(quote.sellAmount),
          buyAmount: String(quote.buyAmount),
          minBuyAmount: String(quote.minBuyAmount),
          rate: rateOf(BigInt(quote.sellAmount), BigInt(quote.buyAmount), request.buyTokenDecimals),
          ...(quote.issues?.allowance?.spender ? { allowanceTarget: getAddress(quote.issues.allowance.spender) } : {}),
          transaction: {
            to: getAddress(quote.transaction.to),
            data: quote.transaction.data,
            value: String(quote.transaction.value ?? "0"),
          },
        };
      }
      // Scale up by the shortfall ratio plus 1% and try once more.
      sellAmount = (sellAmount * request.buyAmount * 101n) / (minBuy * 100n) + 1n;
    }
    throw new Error("0x quote kept coming in below the amount needed; try again shortly.");
  },
};

/** Indicative only. Lets the demo show an FX step; never executable. */
const demo: FxProvider = {
  name: "demo",
  configured: () => true,
  async quote(request) {
    const rate = process.env.FX_DEMO_RATE ?? "1450";
    const [whole = "0", fraction = ""] = rate.split(".");
    const rate4 = BigInt(whole) * 10_000n + BigInt(fraction.padEnd(4, "0").slice(0, 4));
    const sellAmount =
      (request.buyAmount * 10n ** BigInt(USDT_DECIMALS) * 10_000n) / (rate4 * 10n ** BigInt(request.buyTokenDecimals)) + 1n;
    return {
      provider: "demo",
      executable: false,
      sellToken: request.sellToken,
      buyToken: request.buyToken,
      sellAmount: sellAmount.toString(),
      buyAmount: request.buyAmount.toString(),
      minBuyAmount: request.buyAmount.toString(),
      rate,
      note: "Indicative demo rate, not a live market quote.",
    };
  },
};

async function fetchJson(url: string, headers: Record<string, string>) {
  const response = await fetch(url, { headers, signal: AbortSignal.timeout(10_000), cache: "no-store" });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const reason = body?.message ?? body?.name ?? response.statusText;
    throw new Error(`FX provider error (${response.status}): ${reason}`);
  }
  return body;
}

export function pickProvider(preferDemo: boolean): FxProvider {
  if (preferDemo) return demo;
  const wanted = process.env.FX_PROVIDER;
  const order = [textile, zeroX];
  const named = order.find((provider) => provider.name === wanted);
  if (named?.configured()) return named;
  return order.find((provider) => provider.configured()) ?? demo;
}

export async function getFxQuote(request: FxRequest, preferDemo = false): Promise<FxQuote> {
  return pickProvider(preferDemo).quote(request);
}
