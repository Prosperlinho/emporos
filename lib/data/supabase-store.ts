import type { Db } from "../supabase.ts";
import { getSupabase } from "../supabase.ts";
import type { Business, Order, Product, Supplier } from "../types.ts";
import type { Store } from "./store.ts";

/* eslint-disable @typescript-eslint/no-explicit-any */
type Row = Record<string, any>;

const toBusiness = (r: Row): Business => ({
  id: r.id,
  name: r.name,
  location: r.location,
  defaultCurrency: "cNGN",
  ...(r.owner_wallet ? { ownerWallet: r.owner_wallet } : {}),
  ...(r.agent_id ? { agentId: r.agent_id } : {}),
  ...(r.agent_registration_tx ? { agentRegistrationTx: r.agent_registration_tx } : {}),
  rules: r.rules,
  ...(r.agent ? { agent: r.agent } : {}),
});

const toSupplier = (r: Row): Supplier => ({
  id: r.id,
  name: r.name,
  location: r.location,
  walletAddress: r.wallet_address,
  currency: r.currency,
  verified: r.verified,
  ...(r.contact ? { contact: r.contact } : {}),
  ...(r.owner_id ? { ownerId: r.owner_id } : {}),
});

const toProduct = (r: Row): Product => ({
  id: r.id,
  supplierId: r.supplier_id,
  name: r.name,
  unit: r.unit,
  unitPrice: r.unit_price,
  deliveryFee: r.delivery_fee,
  stock: r.stock,
  deliveryDays: r.delivery_days,
  deliveryAreas: r.delivery_areas ?? [],
  updatedAt: r.updated_at,
});

const toOrder = (r: Row): Order => ({
  id: r.id,
  businessId: r.business_id,
  createdAt: r.created_at,
  status: r.status,
  request: r.request,
  chosen: r.chosen,
  alternatives: r.alternatives,
  reasons: r.reasons,
  ruleCheck: r.rule_check,
  amount: r.amount,
  ...(r.paid_by ? { paidBy: r.paid_by } : {}),
  ...(r.payer ? { payer: r.payer } : {}),
  ...(r.fx ? { fx: r.fx } : {}),
  ...(r.payment_tx_hash ? { paymentTxHash: r.payment_tx_hash } : {}),
  ...(r.simulated ? { simulated: true } : {}),
  ...(r.error ? { error: r.error } : {}),
  ...(r.paid_at ? { paidAt: r.paid_at } : {}),
  ...(r.delivered_at ? { deliveredAt: r.delivered_at } : {}),
});

function orderRow(o: Partial<Order>): Row {
  const map: [keyof Order, string][] = [
    ["status", "status"], ["request", "request"], ["chosen", "chosen"], ["alternatives", "alternatives"],
    ["reasons", "reasons"], ["ruleCheck", "rule_check"], ["amount", "amount"], ["paidBy", "paid_by"],
    ["payer", "payer"], ["fx", "fx"], ["paymentTxHash", "payment_tx_hash"], ["simulated", "simulated"],
    ["error", "error"], ["paidAt", "paid_at"], ["deliveredAt", "delivered_at"],
  ];
  const row: Row = {};
  for (const [key, column] of map) if (key in o) row[column] = o[key] ?? null;
  return row;
}

// Supabase results are read as `unknown` and narrowed here, so these helpers don't depend on
// supabase-js's generic row types (which resolve to `never`/`null` without a generated schema).
type Result = { data: unknown; error: { message: string } | null };

/** A select list. */
function many(result: Result): Row[] {
  if (result.error) throw new Error(result.error.message);
  return Array.isArray(result.data) ? (result.data as Row[]) : [];
}

/** A .single() read or write: the row must exist. */
function one(result: Result): Row {
  if (result.error) throw new Error(result.error.message);
  if (!result.data || typeof result.data !== "object") throw new Error("No data returned.");
  return result.data as Row;
}

/** A .maybeSingle() lookup, where "no row" is a valid answer. */
function checkMaybe(result: Result): Row | null {
  if (result.error) throw new Error(result.error.message);
  return result.data && typeof result.data === "object" ? (result.data as Row) : null;
}

/** Deletes and other writes that return no rows. */
function checkOk(result: { error: { message: string } | null }): void {
  if (result.error) throw new Error(result.error.message);
}

async function userId(db: Db): Promise<string> {
  const { data } = await db.auth.getUser();
  if (!data.user) throw new Error("Sign in to continue.");
  return data.user.id;
}

export function createSupabaseStore(): Store {
  const db = getSupabase();
  let businessId: string | null = null;

  async function requireBusinessId(): Promise<string> {
    if (businessId) return businessId;
    const business = await store.getBusiness();
    if (!business) throw new Error("Set up your business profile first.");
    return business.id;
  }

  const store: Store = {
    mode: "live",
    async getBusiness() {
      const uid = await userId(db);
      const row = checkMaybe(await db.from("businesses").select("*").eq("owner_id", uid).maybeSingle());
      if (!row) return null;
      businessId = row.id;
      return toBusiness(row);
    },
    async saveBusiness(b) {
      const uid = await userId(db);
      const row = {
        owner_id: uid,
        name: b.name,
        location: b.location,
        default_currency: "cNGN",
        owner_wallet: b.ownerWallet ?? null,
        agent_id: b.agentId ?? null,
        agent_registration_tx: b.agentRegistrationTx ?? null,
        rules: b.rules,
        agent: b.agent ?? null,
      };
      const saved = one(await db.from("businesses").upsert(row, { onConflict: "owner_id" }).select("*").single());
      businessId = saved.id;
      return toBusiness(saved);
    },
    async listSuppliers() {
      return many(await db.from("suppliers").select("*").order("name")).map(toSupplier);
    },
    async listMySuppliers() {
      const uid = await userId(db);
      return many(await db.from("suppliers").select("*").eq("owner_id", uid).order("name")).map(toSupplier);
    },
    async saveSupplier(s) {
      const fields = { name: s.name, location: s.location, wallet_address: s.walletAddress, currency: s.currency, contact: s.contact ?? null };
      const row = s.id
        ? one(await db.from("suppliers").update(fields).eq("id", s.id).select("*").single())
        : one(await db.from("suppliers").insert({ ...fields, owner_id: await userId(db) }).select("*").single());
      return toSupplier(row);
    },
    async deleteSupplier(id) {
      checkOk(await db.from("suppliers").delete().eq("id", id));
    },
    async listProducts(supplierId) {
      let query = db.from("products").select("*").order("updated_at", { ascending: false });
      if (supplierId) query = query.eq("supplier_id", supplierId);
      return many(await query).map(toProduct);
    },
    async saveProduct(p) {
      const fields = {
        supplier_id: p.supplierId,
        name: p.name,
        unit: p.unit,
        unit_price: p.unitPrice,
        delivery_fee: p.deliveryFee,
        stock: p.stock,
        delivery_days: p.deliveryDays,
        delivery_areas: p.deliveryAreas,
        updated_at: new Date().toISOString(),
      };
      const row = p.id
        ? one(await db.from("products").update(fields).eq("id", p.id).select("*").single())
        : one(await db.from("products").insert(fields).select("*").single());
      return toProduct(row);
    },
    async deleteProduct(id) {
      checkOk(await db.from("products").delete().eq("id", id));
    },
    async listOrders() {
      const id = await requireBusinessId();
      return many(await db.from("orders").select("*").eq("business_id", id).order("created_at", { ascending: false })).map(toOrder);
    },
    async getOrder(id) {
      const row = checkMaybe(await db.from("orders").select("*").eq("id", id).maybeSingle());
      return row ? toOrder(row) : null;
    },
    async createOrder(o) {
      const row = one(await db.from("orders").insert({ ...orderRow(o), business_id: await requireBusinessId() }).select("*").single());
      return toOrder(row);
    },
    async updateOrder(id, patch) {
      return toOrder(one(await db.from("orders").update(orderRow(patch)).eq("id", id).select("*").single()));
    },
  };
  return store;
}
