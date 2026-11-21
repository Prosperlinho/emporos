export interface ProcurementRequest {
  item: string;
  quantity: number;
  maxBudget: string;
  deadlineDays: number;
  deliveryArea: string;
}

export interface SupplierOffer {
  id: string;
  supplier: string;
  itemDescription: string;
  itemMatches: boolean;
  availableQuantity: number;
  unitPrice: string;
  shippingFee: string;
  deliveryDays: number;
  reliability: number;
  sourceUrl: string;
  walletAddress: `0x${string}` | "";
  trackingInfo: string;
}

export interface ComparedOffer extends SupplierOffer {
  total: bigint;
  eligible: boolean;
  reasons: string[];
}

export interface PurchaseReceipt {
  createdAt: string;
  request: ProcurementRequest;
  offers: Array<Omit<ComparedOffer, "total"> & { total: string }>;
  paidResearch?: {
    network: "sandbox" | "mainnet";
    response?: string;
  };
  purchase?: {
    offerId: string;
    supplier: string;
    amount: string;
    recipient: string;
    transactionHash: `0x${string}`;
    trackingInfo: string;
  };
}
