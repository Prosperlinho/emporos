import { NextResponse } from "next/server";
import { isAddress, getAddress } from "viem";
import { IDENTITY_REGISTRY } from "@/lib/chain/config.ts";

export const runtime = "nodejs";

/**
 * ERC-8004 registration-v1 document for an Emporos agent.
 * GET /api/agent-registration?wallet=0x..[&agentId=123][&name=..]
 * Check the field set against https://docs.celo.org/build/agents/8004 before registering.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const wallet = url.searchParams.get("wallet") ?? "";
  if (!isAddress(wallet)) return NextResponse.json({ error: "wallet must be an address" }, { status: 400 });
  const agentId = url.searchParams.get("agentId");
  const name = (url.searchParams.get("name") ?? "Emporos procurement agent").slice(0, 80);
  const origin = url.origin;

  return NextResponse.json(
    {
      type: "https://eips.ethereum.org/EIPS/eip-8004#registration-v1",
      name,
      description:
        "Emporos restocks small-shop inventory: it parses a plain-language request, ranks supplier quotes against the owner's rules, and pays suppliers in cNGN on Celo within owner-set limits.",
      image: `${origin}/icon.svg`,
      endpoints: [
        { name: "web", endpoint: origin },
        { name: "quotes", endpoint: `${origin}/api/quotes` },
        { name: "agentWallet", endpoint: `eip155:42220:${getAddress(wallet)}` },
      ],
      registrations: agentId && /^\d+$/.test(agentId) ? [{ agentId: Number(agentId), agentRegistry: `eip155:42220:${IDENTITY_REGISTRY}` }] : [],
      supportedTrust: ["reputation"],
    },
    { headers: { "cache-control": "public, max-age=300" } },
  );
}
