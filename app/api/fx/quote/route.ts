import { NextResponse } from "next/server";
import { isAddress, getAddress } from "viem";
import { CNGN_ADDRESS, USDT_ADDRESS } from "@/lib/chain/config.ts";
import { getFxQuote } from "@/lib/fx/server.ts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/fx/quote?buyAmount=<cNGN base units>&decimals=<cNGN decimals>&taker=<0x..>[&demo=1] */
export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const buyAmount = params.get("buyAmount") ?? "";
  const decimals = Number(params.get("decimals"));
  const taker = params.get("taker") ?? "";
  const demo = params.get("demo") === "1";

  if (!/^[1-9]\d{0,40}$/.test(buyAmount)) return NextResponse.json({ error: "buyAmount must be a positive integer." }, { status: 400 });
  if (!Number.isInteger(decimals) || decimals < 0 || decimals > 36) return NextResponse.json({ error: "Invalid decimals." }, { status: 400 });
  if (!isAddress(taker)) return NextResponse.json({ error: "Invalid taker address." }, { status: 400 });
  if (!CNGN_ADDRESS && !demo) return NextResponse.json({ error: "NEXT_PUBLIC_CNGN_ADDRESS is not set." }, { status: 503 });

  try {
    const quote = await getFxQuote(
      {
        sellToken: USDT_ADDRESS,
        buyToken: CNGN_ADDRESS ?? "0x0000000000000000000000000000000000000000",
        buyTokenDecimals: decimals,
        buyAmount: BigInt(buyAmount),
        taker: getAddress(taker),
      },
      demo,
    );
    return NextResponse.json(quote);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "FX quote failed." }, { status: 502 });
  }
}
