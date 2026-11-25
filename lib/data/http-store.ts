// Live store: talks to the app's own /api/data routes (Postgres on Vercel).
import type { Business, Order, Product, Supplier } from "../types.ts";
import type { Store } from "./store.ts";

async function api<T>(method: string, path: string, body?: unknown): Promise<T> {
  const response = await fetch(`/api/data/${path}`, {
    method,
    credentials: "same-origin",
    cache: "no-store",
    ...(body === undefined ? {} : { headers: { "content-type": "application/json" }, body: JSON.stringify(body) }),
  });
  const data = (await response.json().catch(() => ({}))) as T & { error?: string };
  if (!response.ok) throw new Error(data.error ?? `Request failed (${response.status}).`);
  return data;
}

function supplierBody(s: Partial<Supplier>) {
  return { name: s.name, location: s.location ?? "", walletAddress: s.walletAddress ?? "", currency: s.currency ?? "cNGN", ...(s.contact ? { contact: s.contact } : {}) };
}

export const httpStore: Store = {
  mode: "live",
  async getBusiness() {
    return (await api<{ business: Business | null }>("GET", "business")).business;
  },
  async saveBusiness(business) {
    const { id: _id, defaultCurrency: _c, ...body } = business as Business;
    return api<Business>("PUT", "business", body);
  },
  listSuppliers: () => api<Supplier[]>("GET", "suppliers"),
  listMySuppliers: () => api<Supplier[]>("GET", "suppliers/mine"),
  saveSupplier: (s) => (s.id ? api<Supplier>("PUT", `suppliers/${s.id}`, supplierBody(s)) : api<Supplier>("POST", "suppliers", supplierBody(s))),
  async deleteSupplier(id) {
    await api("DELETE", `suppliers/${id}`);
  },
  setSupplierVerified: (id, verified) => api<Supplier>("POST", `suppliers/${id}/verify`, { verified }),
  listProducts: (supplierId) => api<Product[]>("GET", supplierId ? `products?supplierId=${encodeURIComponent(supplierId)}` : "products"),
  saveProduct(p) {
    const { id, ...body } = p;
    return id ? api<Product>("PUT", `products/${id}`, body) : api<Product>("POST", "products", body);
  },
  async deleteProduct(id) {
    await api("DELETE", `products/${id}`);
  },
  listOrders: () => api<Order[]>("GET", "orders"),
  async getOrder(id) {
    try {
      return await api<Order>("GET", `orders/${id}`);
    } catch (error) {
      if (error instanceof Error && /not found/i.test(error.message)) return null;
      throw error;
    }
  },
  createOrder: (o) => api<Order>("POST", "orders", o),
  updateOrder: (id, patch) => api<Order>("PATCH", `orders/${id}`, patch),
};
