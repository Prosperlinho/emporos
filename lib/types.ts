// Shared domain types. Money is always a decimal string in naira (max 2 dp) at rest,
// and bigint kobo in arithmetic. Token units are derived only at payment time.

export type TokenSymbol = "cNGN" | "USDT";
export type SpendPeriod = "daily" | "weekly";

export interface SpendingRules {
  /** Largest single order the agent may pay without asking, in naira. */
  maxPerOrder: string;
  /** Total the agent may pay per period, in naira. */
  periodCap: string;
  period: SpendPeriod;
  /** When true the agent only auto-pays suppliers listed in approvedSupplierIds. */
  requireApprovedSupplier: boolean;
  approvedSupplierIds: string[];
}

export interface AgentPolicy {
  provider: "local-session-key" | "altana";
  address: `0x${string}`;
  /** Lifetime spend cap for this session key, in naira. */
  spendCap: string;
  /** Naira already spent by this session key. */
  spent: string;
  /** Supplier wallet addresses this key may pay. */
  allowlist: `0x${string}`[];
  createdAt: string;
  expiresAt: string;
  revokedAt?: string;
  /** Altana only: the on-chain session key, its cap period and grant transaction. */
  sessionPublicKey?: string;
  period?: "day" | "week";
  grantTx?: string;
}

export interface Business {
  id: string;
  name: string;
  location: string;
  defaultCurrency: "cNGN";
  ownerWallet?: string;
  /** The owner's passkey-secured Altana smart wallet, once created. */
  altanaWallet?: string;
  /** ERC-8004 agent ID (uint256 as decimal string). */
  agentId?: string;
  agentRegistrationTx?: string;
  /** ERC-8004 registry the agent ID lives in, when not the default. */
  agentRegistry?: string;
  /** Opted in to the public agent directory (/agents). */
  listed?: boolean;
  /** Set when the owner saves their spending rules (setup step 2). */
  rulesSavedAt?: string;
  rules: SpendingRules;
  agent?: AgentPolicy;
}

export interface Supplier {
  id: string;
  name: string;
  location: string;
  walletAddress: `0x${string}` | "";
  currency: TokenSymbol;
  verified: boolean;
  contact?: string;
  ownerId?: string;
}

export interface Product {
  id: string;
  supplierId: string;
  name: string;
  unit: string;
  /** Naira per unit. */
  unitPrice: string;
  /** Flat delivery fee in naira for the order. */
  deliveryFee: string;
  stock: number;
  deliveryDays: number;
  /** Cities/areas served; "nationwide" matches everywhere. */
  deliveryAreas: string[];
  updatedAt: string;
}

export interface PurchaseRequest {
  item: string;
  quantity: number;
  /** Hard budget in naira. */
  maxBudget: string;
  deliveryArea: string;
  deadlineDays: number;
}

export interface ParsedRequest {
  request: Partial<PurchaseRequest>;
  missing: (keyof PurchaseRequest)[];
  source: "llm" | "rules";
}

export interface Quote {
  productId: string;
  supplierId: string;
  supplierName: string;
  supplierWallet: `0x${string}` | "";
  supplierVerified: boolean;
  itemName: string;
  unit: string;
  unitPrice: string;
  deliveryFee: string;
  quantity: number;
  /** Naira total including delivery. */
  total: string;
  stock: number;
  deliveryDays: number;
  matchScore: number;
}

export interface RankedQuote extends Quote {
  eligible: boolean;
  /** Why the quote fails the request (empty when eligible). */
  failures: string[];
  /** 0–100, higher is better; only meaningful for eligible quotes. */
  score: number;
}

export interface Recommendation {
  best: RankedQuote | null;
  ranked: RankedQuote[];
  /** Human-readable reasons the agent chose `best`. */
  reasons: string[];
}

export interface RuleCheck {
  withinRules: boolean;
  violations: string[];
}

export type OrderStatus =
  | "quoted"
  | "awaiting_approval"
  | "paying"
  | "paid"
  | "delivered"
  | "failed"
  | "cancelled";

export interface FxRecord {
  provider: string;
  /** cNGN per 1 USD₮. */
  rate: string;
  sellAmountUsdt: string;
  buyAmountCngn: string;
  approveTxHash?: string;
  swapTxHash?: string;
}

export interface Order {
  id: string;
  businessId: string;
  createdAt: string;
  status: OrderStatus;
  request: PurchaseRequest;
  chosen: RankedQuote;
  alternatives: RankedQuote[];
  reasons: string[];
  ruleCheck: RuleCheck;
  amount: string;
  paidBy?: "agent" | "owner";
  payer?: string;
  fx?: FxRecord;
  paymentTxHash?: string;
  simulated?: boolean;
  error?: string;
  paidAt?: string;
  deliveredAt?: string;
}
