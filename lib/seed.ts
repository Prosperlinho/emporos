// Fictional demo suppliers for the live demo and tests. They are NOT real businesses,
// and their wallets are placeholder addresses that nobody controls. Demo-mode payments
// are simulated; nothing here is ever sent on-chain.
import { DEFAULT_RULES } from "./rules.ts";
import type { Business, Product, Supplier } from "./types.ts";

const placeholder = (digit: string) => `0x${digit.repeat(40)}` as `0x${string}`;

export const DEMO_SUPPLIERS: Supplier[] = [
  { id: "demo-sup-ada", name: "Ada Grains (demo)", location: "Lagos", walletAddress: placeholder("1"), currency: "cNGN", verified: true, contact: "demo only" },
  { id: "demo-sup-okon", name: "Okon Wholesale (demo)", location: "Lagos", walletAddress: placeholder("2"), currency: "cNGN", verified: true, contact: "demo only" },
  { id: "demo-sup-sahel", name: "Sahel Foods (demo)", location: "Kano", walletAddress: placeholder("3"), currency: "cNGN", verified: false, contact: "demo only" },
  { id: "demo-sup-delta", name: "Delta Provisions (demo)", location: "Port Harcourt", walletAddress: placeholder("4"), currency: "cNGN", verified: true, contact: "demo only" },
];

const now = "2026-11-22T00:00:00.000Z";

export const DEMO_PRODUCTS: Product[] = [
  { id: "demo-p-ada-rice", supplierId: "demo-sup-ada", name: "Long grain parboiled rice 50kg bag", unit: "50kg bag", unitPrice: "36500", deliveryFee: "15000", stock: 120, deliveryDays: 2, deliveryAreas: ["Lagos", "Ogun"], updatedAt: now },
  { id: "demo-p-okon-rice", supplierId: "demo-sup-okon", name: "Parboiled rice 50kg bag", unit: "50kg bag", unitPrice: "35800", deliveryFee: "40000", stock: 60, deliveryDays: 4, deliveryAreas: ["Lagos"], updatedAt: now },
  { id: "demo-p-sahel-rice", supplierId: "demo-sup-sahel", name: "Local rice 50kg bag", unit: "50kg bag", unitPrice: "32000", deliveryFee: "90000", stock: 300, deliveryDays: 7, deliveryAreas: ["nationwide"], updatedAt: now },
  { id: "demo-p-delta-rice", supplierId: "demo-sup-delta", name: "Premium rice 50kg bag", unit: "50kg bag", unitPrice: "38000", deliveryFee: "20000", stock: 40, deliveryDays: 3, deliveryAreas: ["Port Harcourt", "Lagos"], updatedAt: now },
  { id: "demo-p-ada-beans", supplierId: "demo-sup-ada", name: "Honey beans 50kg bag", unit: "50kg bag", unitPrice: "52000", deliveryFee: "15000", stock: 45, deliveryDays: 2, deliveryAreas: ["Lagos"], updatedAt: now },
  { id: "demo-p-okon-oil", supplierId: "demo-sup-okon", name: "Groundnut oil 25 litre jerrycan", unit: "25L jerrycan", unitPrice: "48000", deliveryFee: "10000", stock: 80, deliveryDays: 1, deliveryAreas: ["Lagos"], updatedAt: now },
  { id: "demo-p-sahel-oil", supplierId: "demo-sup-sahel", name: "Groundnut oil 25 litre jerrycan", unit: "25L jerrycan", unitPrice: "44000", deliveryFee: "60000", stock: 200, deliveryDays: 6, deliveryAreas: ["nationwide"], updatedAt: now },
  { id: "demo-p-delta-noodles", supplierId: "demo-sup-delta", name: "Instant noodles carton (40 packs)", unit: "carton", unitPrice: "9800", deliveryFee: "8000", stock: 500, deliveryDays: 2, deliveryAreas: ["Port Harcourt", "Lagos"], updatedAt: now },
  { id: "demo-p-okon-noodles", supplierId: "demo-sup-okon", name: "Instant noodles carton (40 packs)", unit: "carton", unitPrice: "10200", deliveryFee: "5000", stock: 150, deliveryDays: 1, deliveryAreas: ["Lagos"], updatedAt: now },
  { id: "demo-p-ada-sugar", supplierId: "demo-sup-ada", name: "Granulated sugar 50kg bag", unit: "50kg bag", unitPrice: "61000", deliveryFee: "15000", stock: 30, deliveryDays: 2, deliveryAreas: ["Lagos"], updatedAt: now },
];

export function demoBusiness(now = new Date()): Business {
  return {
    id: "demo-business",
    name: "Mama Tunde Provisions (demo)",
    location: "Lagos",
    defaultCurrency: "cNGN",
    rules: { ...DEFAULT_RULES, maxPerOrder: "2500000", periodCap: "5000000", approvedSupplierIds: ["demo-sup-ada", "demo-sup-okon"] },
    // Simulated agent wallet so the demo can show auto-pay. No key exists for it.
    agent: {
      provider: "local-session-key",
      address: placeholder("9"),
      spendCap: "4000000",
      spent: "0",
      allowlist: [placeholder("1"), placeholder("2")],
      createdAt: now.toISOString(),
      expiresAt: new Date(now.getTime() + 30 * 86_400_000).toISOString(),
    },
  };
}
