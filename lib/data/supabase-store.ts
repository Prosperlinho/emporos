import type { SupabaseClient } from "@supabase/supabase-js";
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

function check<T>(result: { data: T; error: { message: string } | null }): T {
  if (result.error) throw new Error(result.error.message);
  return result.data;
}

async function userId(db: SupabaseClient): Promise<string> {
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
      const row = check(await db.from("businesses").select("*").eq("owner_id", uid).maybeSingle());
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
      const saved = check(await db.from("businesses").upsert(row, { onConflict: "owner_id" }).select("*").single());
      businessId = saved.id;
      return toBusiness(saved);
    },
    async listSuppliers() {
      return check(await db.from("suppliers").select("*").order("name")).map(toSupplier);
    },
    async listMySuppliers() {
      const uid = await userId(db);
      return check(await db.from("suppliers").select("*").eq("owner_id", uid).order("name")).map(toSupplier);
    },
    async saveSupplier(s) {
      const fields = { name: s.name, location: s.location, wallet_address: s.walletAddress, currency: s.currency, contact: s.contact ?? null };
      const row = s.id
        ? check(await db.from("suppliers").update(fields).eq("id", s.id).select("*").single())
        : check(await db.from("suppliers").insert({ ...fields, owner_id: await userId(db) }).select("*").single());
      return toSupplier(row);
    },
    async deleteSupplier(id) {
      check(await db.from("suppliers").delete().eq("id", id));
    },
    async listProducts(supplierId) {
      let query = db.from("products").select("*").order("updated_at", { ascending: false });
      if (supplierId) query = query.eq("supplier_id", supplierId);
      return check(await query).map(toProduct);
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
        ? check(await db.from("products").update(fields).eq("id", p.id).select("*").single())
        : check(await db.from("products").insert(fields).select("*").single());
      return toProduct(row);
    },
    async deleteProduct(id) {
      check(await db.from("products").delete().eq("id", id));
    },
    async listOrders() {
      const id = await requireBusinessId();
      return check(await db.from("orders").select("*").eq("business_id", id).order("created_at", { ascending: false })).map(toOrder);
    },
    async getOrder(id) {
      const row = check(await db.from("orders").select("*").eq("id", id).maybeSingle());
      return row ? toOrder(row) : null;
    },
    async createOrder(o) {
      const row = check(await db.from("orders").insert({ ...orderRow(o), business_id: await requireBusinessId() }).select("*").single());
      return toOrder(row);
    },
    async updateOrder(id, patch) {
      return toOrder(check(await db.from("orders").update(orderRow(patch)).eq("id", id).select("*").single()));
    },
  };
  return store;
}
