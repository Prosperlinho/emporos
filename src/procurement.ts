import { formatUnits, isAddress, parseUnits } from "viem";
import type { ComparedOffer, ProcurementRequest, SupplierOffer } from "./types.ts";

const TOKEN_DECIMALS = 6;

export function parseMoney(value: string, label: string): bigint {
  if (!/^(0|[1-9]\d*)(\.\d{1,6})?$/.test(value)) {
    throw new Error(`${label} must be a non-negative amount with at most 6 decimal places.`);
  }

  return parseUnits(value, TOKEN_DECIMALS);
}

export function compareOffers(
  request: ProcurementRequest,
  offers: SupplierOffer[],
): ComparedOffer[] {
  const budget = parseMoney(request.maxBudget, "Maximum budget");

  if (!Number.isSafeInteger(request.quantity) || request.quantity <= 0) {
    throw new Error("Quantity must be a positive whole number.");
  }
  if (!Number.isSafeInteger(request.deadlineDays) || request.deadlineDays < 0) {
    throw new Error("Deadline must be a non-negative whole number of days.");
  }

  return offers.map((offer) => {
    const unitPrice = parseMoney(offer.unitPrice, `${offer.id} unit price`);
    const shippingFee = parseMoney(offer.shippingFee, `${offer.id} shipping fee`);
    const total = unitPrice * BigInt(request.quantity) + shippingFee;
    const reasons: string[] = [];

    if (!offer.itemMatches) {
      reasons.push("operator did not confirm the quoted item matches the requested item/SKU");
    }
    if (offer.availableQuantity < request.quantity) {
      reasons.push(`only ${offer.availableQuantity} available`);
    }
    if (offer.deliveryDays > request.deadlineDays) {
      reasons.push(`${offer.deliveryDays}-day delivery misses deadline`);
    }
    if (total > budget) {
      reasons.push(`total ${formatUnits(total, TOKEN_DECIMALS)} USDC exceeds budget`);
    }
    if (!Number.isFinite(offer.reliability) || offer.reliability < 1 || offer.reliability > 5) {
      throw new Error(`${offer.id} reliability must be between 1 and 5.`);
    }
    if (!Number.isSafeInteger(offer.deliveryDays) || offer.deliveryDays < 0) {
      throw new Error(`${offer.id} delivery time must be a non-negative whole number of days.`);
    }
    if (!Number.isSafeInteger(offer.availableQuantity) || offer.availableQuantity < 0) {
      throw new Error(`${offer.id} available quantity must be a non-negative whole number.`);
    }
    if (offer.walletAddress !== "" && !isAddress(offer.walletAddress)) {
      throw new Error(`${offer.id} supplier wallet is not a valid EVM address.`);
    }

    return {
      ...offer,
      total,
      eligible: reasons.length === 0,
      reasons,
    };
  }).sort((left, right) => {
    if (left.eligible !== right.eligible) {
      return left.eligible ? -1 : 1;
    }
    if (left.total !== right.total) {
      return left.total < right.total ? -1 : 1;
    }
    return right.reliability - left.reliability;
  });
}

export function formatUsdc(amount: bigint): string {
  return formatUnits(amount, TOKEN_DECIMALS);
}

export function validateRequest(request: ProcurementRequest): void {
  if (!request.item.trim()) throw new Error("Item is required.");
  if (!request.deliveryArea.trim()) throw new Error("Delivery area is required.");
  parseMoney(request.maxBudget, "Maximum budget");
  if (!Number.isSafeInteger(request.quantity) || request.quantity <= 0) {
    throw new Error("Quantity must be a positive whole number.");
  }
  if (!Number.isSafeInteger(request.deadlineDays) || request.deadlineDays < 0) {
    throw new Error("Deadline must be a non-negative whole number of days.");
  }
}

export function validateOffer(offer: SupplierOffer): void {
  if (!offer.id.trim() || !offer.supplier.trim() || !offer.itemDescription.trim()) {
    throw new Error("Every offer needs an ID, supplier name, and item description.");
  }
  if (!/^https:\/\//i.test(offer.sourceUrl)) {
    throw new Error(`${offer.id} must include an HTTPS source URL for the supplier quote.`);
  }
  parseMoney(offer.unitPrice, `${offer.id} unit price`);
  parseMoney(offer.shippingFee, `${offer.id} shipping fee`);
  if (typeof offer.itemMatches !== "boolean") {
    throw new Error(`${offer.id} must include an item/SKU match confirmation.`);
  }
}
