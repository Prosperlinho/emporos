// Browser-only demo store seeded with fictional suppliers. Everything stays in localStorage.
import { DEMO_PRODUCTS, DEMO_SUPPLIERS, demoBusiness } from "../seed.ts";
import type { Business, Order, Product, Supplier } from "../types.ts";
import { newId, type Store } from "./store.ts";

const KEY = "emporos.demo.v1";

interface DemoState {
  business: Business;
  suppliers: Supplier[];
  products: Product[];
  orders: Order[];
}

function load(): DemoState {
  const raw = localStorage.getItem(KEY);
  if (raw) {
    try {
      return JSON.parse(raw) as DemoState;
    } catch {
      // fall through to a fresh seed
    }
  }
  const fresh: DemoState = { business: demoBusiness(), suppliers: DEMO_SUPPLIERS, products: DEMO_PRODUCTS, orders: [] };
  save(fresh);
  return fresh;
}

function save(state: DemoState): void {
  localStorage.setItem(KEY, JSON.stringify(state));
}

function mutate<T>(fn: (state: DemoState) => T): T {
  const state = load();
  const result = fn(state);
  save(state);
  return result;
}

export function resetDemo(): void {
  localStorage.removeItem(KEY);
}

export const demoStore: Store = {
  mode: "demo",
  async getBusiness() {
    return load().business;
  },
  async saveBusiness(business) {
    return mutate((state) => (state.business = { ...business, id: state.business.id }));
  },
  async listSuppliers() {
    return load().suppliers;
  },
  async listMySuppliers() {
    return load().suppliers;
  },
  async saveSupplier(input) {
    return mutate((state) => {
      const existing = input.id ? state.suppliers.find((s) => s.id === input.id) : undefined;
      const supplier: Supplier = { ...input, id: existing?.id ?? newId("sup"), verified: existing?.verified ?? false };
      state.suppliers = existing ? state.suppliers.map((s) => (s.id === supplier.id ? supplier : s)) : [...state.suppliers, supplier];
      return supplier;
    });
  },
  async deleteSupplier(id) {
    mutate((state) => {
      state.suppliers = state.suppliers.filter((s) => s.id !== id);
      state.products = state.products.filter((p) => p.supplierId !== id);
    });
  },
  async listProducts(supplierId) {
    const products = load().products;
    return supplierId ? products.filter((p) => p.supplierId === supplierId) : products;
  },
  async saveProduct(input) {
    return mutate((state) => {
      const product: Product = { ...input, id: input.id ?? newId("prd"), updatedAt: new Date().toISOString() };
      const exists = state.products.some((p) => p.id === product.id);
      state.products = exists ? state.products.map((p) => (p.id === product.id ? product : p)) : [...state.products, product];
      return product;
    });
  },
  async deleteProduct(id) {
    mutate((state) => {
      state.products = state.products.filter((p) => p.id !== id);
    });
  },
  async listOrders() {
    return [...load().orders].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  },
  async getOrder(id) {
    return load().orders.find((o) => o.id === id) ?? null;
  },
  async createOrder(input) {
    return mutate((state) => {
      const order: Order = { ...input, id: newId("ord"), createdAt: new Date().toISOString(), businessId: state.business.id };
      state.orders.push(order);
      return order;
    });
  },
  async updateOrder(id, patch) {
    return mutate((state) => {
      const index = state.orders.findIndex((o) => o.id === id);
      if (index < 0) throw new Error("Order not found.");
      const updated = { ...state.orders[index]!, ...patch, id };
      state.orders[index] = updated;
      return updated;
    });
  },
};
