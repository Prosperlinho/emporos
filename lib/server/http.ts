import "server-only";
import { NextResponse } from "next/server";
import { HttpError } from "./session.ts";

/** Run a handler and turn thrown errors into JSON responses. */
export async function handle(run: () => Promise<unknown>): Promise<NextResponse> {
  try {
    const result = await run();
    return NextResponse.json(result ?? { ok: true });
  } catch (error) {
    if (error instanceof HttpError) return NextResponse.json({ error: error.message }, { status: error.status });
    console.error(error);
    const message = error instanceof Error ? error.message : "Unexpected error.";
    // Surface constraint violations; hide anything else that might leak internals.
    const safe = /violates|duplicate key|invalid input/i.test(message) ? message : "Something went wrong. Try again.";
    return NextResponse.json({ error: safe }, { status: 500 });
  }
}

export async function readJson(request: Request): Promise<unknown> {
  const text = await request.text();
  if (text.length > 250_000) throw new HttpError(413, "Request is too large.");
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    throw new HttpError(400, "Invalid JSON.");
  }
}
