import { NextResponse } from "next/server";
import { llmConfigured, parseWithLlm } from "@/lib/llm.ts";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as { text?: unknown } | null;
  const text = typeof body?.text === "string" ? body.text.trim() : "";
  if (!text) return NextResponse.json({ error: "Describe what you need." }, { status: 400 });
  if (text.length > 600) return NextResponse.json({ error: "Keep the request under 600 characters." }, { status: 400 });
  const parsed = await parseWithLlm(text);
  return NextResponse.json({ ...parsed, llmConfigured: llmConfigured() });
}
