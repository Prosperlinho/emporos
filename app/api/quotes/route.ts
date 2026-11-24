import { NextResponse } from "next/server";
import { z } from "zod";
import { isNaira } from "@/lib/money.ts";
import { recommend } from "@/lib/ranking.ts";
import { DEMO_PRODUCTS, DEMO_SUPPLIERS } from "@/lib/seed.ts";
import { getServerSupabase } from "@/lib/supabase.ts";
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
    const db = getServerSupabase();
    if (!db) return NextResponse.json({ error: "Supabase is not configured; use ?demo=1." }, { status: 503 });
    const [s, p] = await Promise.all([db.from("suppliers").select("*"), db.from("products").select("*")]);
    if (s.error || p.error) return NextResponse.json({ error: (s.error ?? p.error)!.message }, { status: 502 });
    suppliers = s.data.map((r) => ({ id: r.id, name: r.name, location: r.location, walletAddress: r.wallet_address, currency: r.currency, verified: r.verified }));
    products = p.data.map((r) => ({
      id: r.id, supplierId: r.supplier_id, name: r.name, unit: r.unit, unitPrice: r.unit_price, deliveryFee: r.delivery_fee,
      stock: r.stock, deliveryDays: r.delivery_days, deliveryAreas: r.delivery_areas ?? [], updatedAt: r.updated_at,
    }));
  }
  return NextResponse.json(recommend(parsed.data, products, suppliers));
}
