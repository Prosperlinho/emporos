import type { Business, Order, Product, Supplier } from "../types.ts";

export type StoreMode = "demo" | "live";

export interface Store {
  mode: StoreMode;
  getBusiness(): Promise<Business | null>;
  saveBusiness(business: Omit<Business, "id"> & { id?: string }): Promise<Business>;

  listSuppliers(): Promise<Supplier[]>;
  /** Suppliers the current user manages from the supplier portal. */
  listMySuppliers(): Promise<Supplier[]>;
  saveSupplier(supplier: Omit<Supplier, "id" | "verified"> & { id?: string }): Promise<Supplier>;
  deleteSupplier(id: string): Promise<void>;

  listProducts(supplierId?: string): Promise<Product[]>;
  saveProduct(product: Omit<Product, "id" | "updatedAt"> & { id?: string }): Promise<Product>;
  deleteProduct(id: string): Promise<void>;

  listOrders(): Promise<Order[]>;
  getOrder(id: string): Promise<Order | null>;
  createOrder(order: Omit<Order, "id" | "createdAt" | "businessId">): Promise<Order>;
  updateOrder(id: string, patch: Partial<Order>): Promise<Order>;
}

export function newId(prefix: string): string {
  return `${prefix}-${crypto.randomUUID()}`;
}
