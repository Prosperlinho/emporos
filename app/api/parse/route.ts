import { NextResponse } from "next/server";
import { llmConfigured, parseWithLlm } from "@/lib/llm.ts";
import { parseRequestText } from "@/lib/parse.ts";

export const runtime = "nodejs";

// Best-effort per-IP limit on LLM calls (per server instance). Over the limit, the request is
// still parsed, just by the free rule-based parser, so nobody can run up the LLM bill.
const WINDOW_MS = 10 * 60_000;
const MAX_LLM_CALLS = 20;
const hits = new Map<string, number[]>();

function allowLlm(ip: string): boolean {
  const now = Date.now();
  const recent = (hits.get(ip) ?? []).filter((t) => now - t < WINDOW_MS);
  if (recent.length >= MAX_LLM_CALLS) {
    hits.set(ip, recent);
    return false;
  }
  recent.push(now);
  hits.set(ip, recent);
  if (hits.size > 5000) hits.clear();
  return true;
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as { text?: unknown } | null;
  const text = typeof body?.text === "string" ? body.text.trim() : "";
  if (!text) return NextResponse.json({ error: "Describe what you need." }, { status: 400 });
  if (text.length > 600) return NextResponse.json({ error: "Keep the request under 600 characters." }, { status: 400 });

  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || request.headers.get("x-real-ip") || "unknown";
  const parsed = allowLlm(ip) ? await parseWithLlm(text) : { ...parseRequestText(text), llmError: "rate limited" };
  return NextResponse.json({ ...parsed, llmConfigured: llmConfigured() });
}
