import { NextResponse } from "next/server";
import { isAddress, getAddress } from "viem";
import { IDENTITY_REGISTRY } from "@/lib/chain/config.ts";
import { dbConfigured } from "@/lib/server/db.ts";
import { findAgentByWallet } from "@/lib/server/repo.ts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * ERC-8004 registration-v1 document for an Emporos agent (the agent's tokenURI).
 * GET /api/agent-registration?wallet=0x..[&agentId=123][&name=..]
 * The agent ID is unknown when the URI is first written, so it is filled in from Emporos
 * records once the registration has been saved.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const wallet = url.searchParams.get("wallet") ?? "";
  if (!isAddress(wallet)) return NextResponse.json({ error: "wallet must be an address" }, { status: 400 });
  const origin = url.origin;

  let agentId = url.searchParams.get("agentId");
  let registry: string = IDENTITY_REGISTRY;
  let name = (url.searchParams.get("name") ?? "Emporos procurement agent").slice(0, 80);
  let location = "";
  if (dbConfigured) {
    const known = await findAgentByWallet(wallet).catch(() => null);
    if (known) {
      agentId ??= known.agentId;
      registry = known.registry ?? registry;
      location = known.location;
      if (!url.searchParams.get("name")) name = `Emporos agent for ${known.name}`;
    }
  }

  return NextResponse.json(
    {
      type: "https://eips.ethereum.org/EIPS/eip-8004#registration-v1",
      name,
      description:
        `Emporos restocks small-shop inventory${location ? ` in ${location}` : ""}: it parses a plain-language request, ranks supplier quotes against the owner's rules, and pays suppliers in cNGN on Celo within owner-set limits.`,
      image: `${origin}/icon.svg`,
      endpoints: [
        { name: "web", endpoint: origin },
        { name: "directory", endpoint: `${origin}/agents` },
        { name: "quotes", endpoint: `${origin}/api/quotes` },
        { name: "agentWallet", endpoint: `eip155:42220:${getAddress(wallet)}` },
      ],
      registrations: agentId && /^\d+$/.test(agentId) ? [{ agentId: Number(agentId), agentRegistry: `eip155:42220:${getAddress(registry)}` }] : [],
      supportedTrust: ["reputation"],
    },
    { headers: { "cache-control": "public, max-age=300" } },
  );
}
