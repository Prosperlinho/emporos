import { NextResponse } from "next/server";
import { dbConfigured } from "@/lib/server/db.ts";
import { listPublicAgents } from "@/lib/server/repo.ts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/agents: the public directory of registered Emporos shop agents (opt-in). */
export async function GET() {
  if (!dbConfigured) return NextResponse.json([]);
  try {
    return NextResponse.json(await listPublicAgents(), { headers: { "cache-control": "public, max-age=60" } });
  } catch {
    return NextResponse.json({ error: "Could not load the directory." }, { status: 502 });
  }
}
