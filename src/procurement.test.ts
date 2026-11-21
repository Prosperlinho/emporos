import assert from "node:assert/strict";
import test from "node:test";
import { compareOffers, parseMoney, validateOffer } from "./procurement.ts";
import type { ProcurementRequest, SupplierOffer } from "./types.ts";

const request: ProcurementRequest = {
  item: "M8 stainless bolts",
  quantity: 100,
  maxBudget: "25.00",
  deadlineDays: 5,
  deliveryArea: "Accra",
};

const offer = (overrides: Partial<SupplierOffer> = {}): SupplierOffer => ({
  id: "local",
  supplier: "Local Supply Co",
  itemDescription: "M8 stainless bolts",
  itemMatches: true,
  availableQuantity: 100,
  unitPrice: "0.20",
  shippingFee: "2.00",
  deliveryDays: 3,
  reliability: 4,
  sourceUrl: "https://supplier.example/quote/1",
  walletAddress: "",
  trackingInfo: "",
  ...overrides,
});

test("compares total cost using integer token units and marks budget/deadline failures", () => {
  const results = compareOffers(request, [
    offer({ id: "late", deliveryDays: 6 }),
    offer({ id: "cheap", unitPrice: "0.19", shippingFee: "2.00" }),
  ]);

  assert.equal(results[0]?.id, "cheap");
  assert.equal(results[0]?.total, 21000000n);
  assert.equal(results[0]?.eligible, true);
  assert.equal(results[1]?.eligible, false);
  assert.match(results[1]?.reasons.join(" ") ?? "", /deadline/);
});

test("rejects amounts that cannot be represented exactly in USDC", () => {
  assert.throws(() => parseMoney("1.0000001", "price"), /at most 6 decimal places/);
  assert.throws(() => parseMoney("-1", "price"), /at most 6 decimal places/);
});

test("requires HTTPS quote provenance before comparing an offer", () => {
  assert.throws(
    () => validateOffer(offer({ sourceUrl: "http://supplier.example/quote" })),
    /HTTPS source URL/,
  );
});

test("rejects malformed HTTPS quote URLs", () => {
  assert.throws(
    () => validateOffer(offer({ sourceUrl: "https://not a valid URL" })),
    /valid HTTPS source URL/,
  );
});

test("does not mark an unconfirmed item match as eligible", () => {
  const [result] = compareOffers(request, [offer({ itemMatches: false })]);

  assert.equal(result?.eligible, false);
  assert.match(result?.reasons.join(" ") ?? "", /item\/SKU/);
});

test("rejects a non-numeric supplier reliability rating", () => {
  assert.throws(
    () => compareOffers(request, [offer({ reliability: Number.NaN })]),
    /reliability must be between 1 and 5/,
  );
});
