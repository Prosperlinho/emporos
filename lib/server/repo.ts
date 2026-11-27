// Server-side data access. Every write is validated here and scoped to the signed-in user;
// this replaces database row-level security.
import "server-only";
import { getAddress, isAddress } from "viem";
import { z } from "zod";
import { isNaira } from "../money.ts";
import type { Business, Order, Product, Supplier } from "../types.ts";
import { db, type DbRow } from "./db.ts";
import { HttpError, type SessionUser } from "./session.ts";

const naira = z.string().trim().refine(isNaira, "must be a naira amount with at most 2 decimals");
const address = z.string().trim().refine((v) => isAddress(v), "must be a valid wallet address").transform((v) => getAddress(v));
const optionalAddress = z.union([z.literal(""), address]);

const RulesSchema = z.object({
  maxPerOrder: naira,
  periodCap: naira,
  period: z.enum(["daily", "weekly"]),
  requireApprovedSupplier: z.boolean(),
  approvedSupplierIds: z.array(z.string().max(80)).max(500),
});

const AgentSchema = z.object({
  provider: z.enum(["local-session-key", "altana"]),
  address,
  spendCap: naira,
  spent: naira,
  allowlist: z.array(address).max(500),
  createdAt: z.string().max(40),
  expiresAt: z.string().max(40),
  revokedAt: z.string().max(40).optional(),
  sessionPublicKey: z.string().regex(/^0x[0-9a-fA-F]{2,600}$/).optional(),
  period: z.enum(["day", "week"]).optional(),
  grantTx: z.string().regex(/^0x[0-9a-fA-F]{64}$/).optional(),
});

const BusinessSchema = z.object({
  name: z.string().trim().min(1).max(120),
  location: z.string().trim().max(120),
  ownerWallet: address.optional(),
  altanaWallet: address.optional(),
  agentId: z.string().regex(/^\d{1,78}$/).optional(),
  agentRegistrationTx: z.string().regex(/^0x[0-9a-fA-F]{64}$/).optional(),
  agentRegistry: address.optional(),
  listed: z.boolean().optional(),
  rulesSavedAt: z.string().max(40).optional(),
  rules: RulesSchema,
  agent: AgentSchema.optional(),
});

const SupplierSchema = z.object({
  name: z.string().trim().min(1).max(120),
  location: z.string().trim().max(120),
  walletAddress: optionalAddress,
  currency: z.enum(["cNGN", "USDT"]),
  contact: z.string().trim().max(160).optional(),
});

const ProductSchema = z.object({
  supplierId: z.string().uuid(),
  name: z.string().trim().min(1).max(160),
  unit: z.string().trim().min(1).max(40),
  unitPrice: naira,
  deliveryFee: naira,
  stock: z.number().int().min(0).max(100_000_000),
  deliveryDays: z.number().int().min(0).max(365),
  deliveryAreas: z.array(z.string().trim().min(1).max(60)).min(1).max(50),
});

const ORDER_STATUSES = ["quoted", "awaiting_approval", "paying", "paid", "delivered", "failed", "cancelled"] as const;
// Orders are stored as a JSON document; validate the fields the server relies on and cap the size.
const OrderSchema = z.looseObject({
  status: z.enum(ORDER_STATUSES),
  amount: naira,
  request: z.looseObject({}),
  chosen: z.looseObject({}),
  alternatives: z.array(z.unknown()).max(200),
  reasons: z.array(z.string().max(500)).max(50),
  ruleCheck: z.object({ withinRules: z.boolean(), violations: z.array(z.string().max(300)).max(20) }),
});
const OrderPatchSchema = z.strictObject({
  status: z.enum(ORDER_STATUSES).optional(),
  paymentTxHash: z.string().regex(/^0x[0-9a-fA-F]{64}$/).optional(),
  paidBy: z.enum(["agent", "owner"]).optional(),
  payer: z.string().max(80).optional(),
  fx: z.looseObject({}).optional(),
  error: z.string().max(1000).optional(),
  simulated: z.boolean().optional(),
  paidAt: z.string().max(40).optional(),
  deliveredAt: z.string().max(40).optional(),
});

function parse<T>(schema: z.ZodType<T>, input: unknown): T {
  const result = schema.safeParse(input);
  if (!result.success) {
    throw new HttpError(400, result.error.issues.map((i) => `${i.path.join(".") || "input"}: ${i.message}`).join("; "));
  }
  return result.data;
}

// Strip undefined so stored JSON matches the optional-field types.
function clean<T extends object>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

/* Mapping ------------------------------------------------------------------- */

const toSupplier = (r: DbRow): Supplier => ({
  id: r.id as string,
  name: r.name as string,
  location: r.location as string,
  walletAddress: r.wallet_address as Supplier["walletAddress"],
  currency: r.currency as Supplier["currency"],
  verified: r.verified as boolean,
  ...(r.contact ? { contact: r.contact as string } : {}),
  ...(r.owner_id ? { ownerId: r.owner_id as string } : {}),
});

const toProduct = (r: DbRow): Product => ({
  id: r.id as string,
  supplierId: r.supplier_id as string,
  name: r.name as string,
  unit: r.unit as string,
  unitPrice: r.unit_price as string,
  deliveryFee: r.delivery_fee as string,
  stock: r.stock as number,
  deliveryDays: r.delivery_days as number,
  deliveryAreas: (r.delivery_areas as string[] | null) ?? [],
  updatedAt: new Date(r.updated_at as string).toISOString(),
});

const toOrder = (r: DbRow): Order => ({
  ...(r.doc as Omit<Order, "id" | "businessId" | "createdAt" | "status">),
  id: r.id as string,
  businessId: r.business_id as string,
  createdAt: new Date(r.created_at as string).toISOString(),
  status: r.status as Order["status"],
});

/* Business ------------------------------------------------------------------ */

async function businessRow(user: SessionUser): Promise<DbRow | null> {
  const sql = await db();
  const [row] = await sql`select id, doc from businesses where owner_id = ${user.id}`;
  return row ?? null;
}

export async function getBusiness(user: SessionUser): Promise<Business | null> {
  const row = await businessRow(user);
  return row ? { ...(row.doc as Omit<Business, "id">), id: row.id as string } : null;
}

export async function saveBusiness(user: SessionUser, input: unknown): Promise<Business> {
  const data = clean({ ...parse(BusinessSchema, input), defaultCurrency: "cNGN" as const });
  const sql = await db();
  const [row] = await sql`
    insert into businesses (owner_id, doc) values (${user.id}, ${JSON.stringify(data)}::jsonb)
    on conflict (owner_id) do update set doc = excluded.doc, updated_at = now()
    returning id, doc`;
  if (!row) throw new HttpError(500, "Could not save the business.");
  return { ...(row.doc as Omit<Business, "id">), id: row.id as string };
}

async function requireBusinessId(user: SessionUser): Promise<string> {
  const row = await businessRow(user);
  if (!row) throw new HttpError(400, "Set up your business profile first.");
  return row.id as string;
}

/* Suppliers ----------------------------------------------------------------- */

export async function listSuppliers(): Promise<Supplier[]> {
  const sql = await db();
  return (await sql`select * from suppliers order by name`).map(toSupplier);
}

export async function listMySuppliers(user: SessionUser): Promise<Supplier[]> {
  const sql = await db();
  return (await sql`select * from suppliers where owner_id = ${user.id} order by name`).map(toSupplier);
}

async function assertCanEditSupplier(user: SessionUser, supplierId: string): Promise<void> {
  const sql = await db();
  const [row] = await sql`select owner_id from suppliers where id = ${supplierId}`;
  if (!row) throw new HttpError(404, "Supplier not found.");
  if (row.owner_id !== user.id && !user.isAdmin) throw new HttpError(403, "You can only edit suppliers you manage.");
}

export async function createSupplier(user: SessionUser, input: unknown): Promise<Supplier> {
  const s = parse(SupplierSchema, input);
  const sql = await db();
  const [row] = await sql`
    insert into suppliers (owner_id, name, location, wallet_address, currency, contact)
    values (${user.id}, ${s.name}, ${s.location}, ${s.walletAddress}, ${s.currency}, ${s.contact ?? null})
    returning *`;
  if (!row) throw new HttpError(500, "Could not save the supplier.");
  return toSupplier(row);
}

export async function updateSupplier(user: SessionUser, id: string, input: unknown): Promise<Supplier> {
  await assertCanEditSupplier(user, id);
  const s = parse(SupplierSchema, input);
  const sql = await db();
  const [row] = await sql`
    update suppliers set name = ${s.name}, location = ${s.location}, wallet_address = ${s.walletAddress},
      currency = ${s.currency}, contact = ${s.contact ?? null}
    where id = ${id} returning *`;
  if (!row) throw new HttpError(404, "Supplier not found.");
  return toSupplier(row);
}

export async function deleteSupplier(user: SessionUser, id: string): Promise<void> {
  await assertCanEditSupplier(user, id);
  const sql = await db();
  await sql`delete from suppliers where id = ${id}`;
}

export async function setSupplierVerified(user: SessionUser, id: string, verified: boolean): Promise<Supplier> {
  if (!user.isAdmin) throw new HttpError(403, "Only admins can verify suppliers.");
  const sql = await db();
  const [row] = await sql`update suppliers set verified = ${verified} where id = ${id} returning *`;
  if (!row) throw new HttpError(404, "Supplier not found.");
  return toSupplier(row);
}

/* Products ------------------------------------------------------------------ */

export async function listProducts(supplierId?: string): Promise<Product[]> {
  const sql = await db();
  const rows = supplierId
    ? await sql`select * from products where supplier_id = ${supplierId} order by updated_at desc`
    : await sql`select * from products order by updated_at desc`;
  return rows.map(toProduct);
}

export async function saveProduct(user: SessionUser, id: string | null, input: unknown): Promise<Product> {
  const p = parse(ProductSchema, input);
  await assertCanEditSupplier(user, p.supplierId);
  const sql = await db();
  if (id) {
    const [existing] = await sql`select supplier_id from products where id = ${id}`;
    if (!existing) throw new HttpError(404, "Product not found.");
    await assertCanEditSupplier(user, existing.supplier_id as string);
  }
  const [row] = id
    ? await sql`
        update products set supplier_id = ${p.supplierId}, name = ${p.name}, unit = ${p.unit}, unit_price = ${p.unitPrice},
          delivery_fee = ${p.deliveryFee}, stock = ${p.stock}, delivery_days = ${p.deliveryDays},
          delivery_areas = ${p.deliveryAreas}, updated_at = now()
        where id = ${id} returning *`
    : await sql`
        insert into products (supplier_id, name, unit, unit_price, delivery_fee, stock, delivery_days, delivery_areas)
        values (${p.supplierId}, ${p.name}, ${p.unit}, ${p.unitPrice}, ${p.deliveryFee}, ${p.stock}, ${p.deliveryDays}, ${p.deliveryAreas})
        returning *`;
  if (!row) throw new HttpError(500, "Could not save the product.");
  return toProduct(row);
}

export async function deleteProduct(user: SessionUser, id: string): Promise<void> {
  const sql = await db();
  const [existing] = await sql`select supplier_id from products where id = ${id}`;
  if (!existing) return;
  await assertCanEditSupplier(user, existing.supplier_id as string);
  await sql`delete from products where id = ${id}`;
}

/* Orders -------------------------------------------------------------------- */

export async function listOrders(user: SessionUser): Promise<Order[]> {
  const businessId = await requireBusinessId(user);
  const sql = await db();
  return (await sql`select * from orders where business_id = ${businessId} order by created_at desc limit 500`).map(toOrder);
}

async function orderRow(user: SessionUser, id: string): Promise<DbRow> {
  const businessId = await requireBusinessId(user);
  const sql = await db();
  const [row] = await sql`select * from orders where id = ${id} and business_id = ${businessId}`;
  if (!row) throw new HttpError(404, "Order not found.");
  return row;
}

export async function getOrder(user: SessionUser, id: string): Promise<Order> {
  return toOrder(await orderRow(user, id));
}

export async function createOrder(user: SessionUser, input: unknown): Promise<Order> {
  const order = parse(OrderSchema, input);
  const doc = JSON.stringify(order);
  if (doc.length > 200_000) throw new HttpError(413, "Order is too large.");
  const businessId = await requireBusinessId(user);
  const sql = await db();
  const [row] = await sql`
    insert into orders (business_id, status, doc) values (${businessId}, ${order.status}, ${doc}::jsonb) returning *`;
  if (!row) throw new HttpError(500, "Could not save the order.");
  return toOrder(row);
}

export async function updateOrder(user: SessionUser, id: string, input: unknown): Promise<Order> {
  const patch = parse(OrderPatchSchema, input);
  const current = toOrder(await orderRow(user, id));
  const next = { ...current, ...patch };
  const { id: _id, businessId: _b, createdAt: _c, status, ...doc } = next;
  const sql = await db();
  const [row] = await sql`
    update orders set status = ${status}, doc = ${JSON.stringify(doc)}::jsonb where id = ${id} returning *`;
  if (!row) throw new HttpError(404, "Order not found.");
  return toOrder(row);
}

/* Public agent directory ----------------------------------------------------- */

export interface PublicAgent {
  businessId: string;
  name: string;
  location: string;
  agentId: string;
  registrationTx?: string;
  /** The wallet the agent pays from, if it has an active agent wallet. */
  agentWallet?: string;
  walletType?: "altana" | "session-key";
  active: boolean;
  listedSince: string;
}

/** Opted-in businesses with an ERC-8004 agent ID. Only public, non-sensitive fields. */
export async function listPublicAgents(): Promise<PublicAgent[]> {
  const sql = await db();
  const rows = await sql`
    select id, doc, updated_at from businesses
    where doc->>'listed' = 'true' and doc ? 'agentId'
    order by updated_at desc
    limit 500`;
  const now = Date.now();
  return rows.map((r) => {
    const doc = r.doc as Business;
    const agent = doc.agent;
    const active = Boolean(agent && !agent.revokedAt && new Date(agent.expiresAt).getTime() > now);
    return {
      businessId: r.id as string,
      name: doc.name,
      location: doc.location,
      agentId: doc.agentId!,
      ...(doc.agentRegistrationTx ? { registrationTx: doc.agentRegistrationTx } : {}),
      ...(agent && active ? { agentWallet: agent.address, walletType: agent.provider === "altana" ? "altana" as const : "session-key" as const } : {}),
      active,
      listedSince: new Date(r.updated_at as string).toISOString(),
    };
  });
}
