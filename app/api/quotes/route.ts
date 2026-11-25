import { NextResponse } from "next/server";
import { z } from "zod";
import { isNaira } from "@/lib/money.ts";
import { recommend } from "@/lib/ranking.ts";
import { DEMO_PRODUCTS, DEMO_SUPPLIERS } from "@/lib/seed.ts";
import { dbConfigured } from "@/lib/server/db.ts";
import { listProducts, listSuppliers } from "@/lib/server/repo.ts";
import type { Product, Supplier } from "@/lib/types.ts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const RequestSchema = z.object({
  item: z.string().trim().min(1).max(120),
  quantity: z.number().int().positive().max(1_000_000),
  maxBudget: z.string().refine(isNaira, "naira amount, max 2 dp"),
  deliveryArea: z.string().trim().min(1).max(80),
  deadlineDays: z.number().int().min(0).max(365),
});

/**
 * POST /api/quotes — rank live supplier quotes for a structured request.
 * Public so other agents can call it; add an x402 paywall here if you want to charge per call.
 * `?demo=1` uses the fictional demo catalog.
 */
export async function POST(request: Request) {
  const parsed = RequestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`) }, { status: 400 });

  const demo = new URL(request.url).searchParams.get("demo") === "1";
  let suppliers: Supplier[] = DEMO_SUPPLIERS;
  let products: Product[] = DEMO_PRODUCTS;
  if (!demo) {
    if (!dbConfigured) return NextResponse.json({ error: "No database connected; use ?demo=1." }, { status: 503 });
    try {
      [suppliers, products] = await Promise.all([listSuppliers(), listProducts()]);
    } catch {
      return NextResponse.json({ error: "Could not load supplier quotes." }, { status: 502 });
    }
  }
  return NextResponse.json(recommend(parsed.data, products, suppliers));
}
