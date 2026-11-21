import "dotenv/config";
import { mkdir, writeFile } from "node:fs/promises";
import { createInterface } from "node:readline/promises";
import { stdin, stdout } from "node:process";
import { formatUsdc, compareOffers, validateOffer, validateRequest } from "./procurement.ts";
import { paySupplier, procurementWalletAddress, registerAgent } from "./chain.ts";
import { configuredResearchNetwork, paidResearchReview } from "./research.ts";
import type { ComparedOffer, ProcurementRequest, PurchaseReceipt, SupplierOffer } from "./types.ts";

const input = createInterface({ input: stdin, output: stdout });

async function ask(question: string): Promise<string> {
  return (await input.question(question)).trim();
}

async function askInteger(question: string, minimum: number): Promise<number> {
  const value = Number(await ask(question));
  if (!Number.isSafeInteger(value) || value < minimum) {
    throw new Error(`Enter a whole number greater than or equal to ${minimum}.`);
  }
  return value;
}

async function collectRequest(): Promise<ProcurementRequest> {
  const request: ProcurementRequest = {
    item: await ask("Item / SKU to restock: "),
    quantity: await askInteger("Quantity: ", 1),
    maxBudget: await ask("Maximum total budget in USDC (including shipping): "),
    deadlineDays: await askInteger("Must arrive within how many days? ", 0),
    deliveryArea: await ask("Delivery town/area (no street address): "),
  };
  validateRequest(request);
  return request;
}

async function collectOffers(): Promise<SupplierOffer[]> {
  const count = await askInteger("How many supplier quotes are you comparing? ", 1);
  if (count > 10) throw new Error("Enter no more than 10 quotes in this first version.");
  const offers: SupplierOffer[] = [];

  for (let index = 0; index < count; index += 1) {
    console.log(`\nSupplier quote ${index + 1} (enter facts from a quote you trust):`);
    const id = await ask(`Offer ID [offer-${index + 1}]: `) || `offer-${index + 1}`;
    const walletAddress = await ask("Supplier USDC wallet (0x...; blank means no on-chain payment): ");
    const itemMatchAnswer = (await ask("Does this quote match the requested item/SKU/specification? (yes/no): ")).toLowerCase();
    if (itemMatchAnswer !== "yes" && itemMatchAnswer !== "no") {
      throw new Error("Answer yes or no for the item/SKU match check.");
    }
    const offer: SupplierOffer = {
      id,
      supplier: await ask("Supplier name: "),
      itemDescription: await ask("Quoted item / SKU: "),
      itemMatches: itemMatchAnswer === "yes",
      availableQuantity: await askInteger("Quantity supplier confirms available: ", 0),
      unitPrice: await ask("Unit price in USDC: "),
      shippingFee: await ask("Shipping fee in USDC: "),
      deliveryDays: await askInteger("Delivery time in days: ", 0),
      reliability: Number(await ask("Reliability rating based on your records (1-5): ")),
      sourceUrl: await ask("HTTPS quote or supplier URL: "),
      walletAddress: walletAddress as SupplierOffer["walletAddress"],
      trackingInfo: await ask("Existing tracking / fulfillment note (optional): "),
    };
    validateOffer(offer);
    if (offers.some((existing) => existing.id === offer.id)) {
      throw new Error(`Offer ID "${offer.id}" is already in use.`);
    }
    offers.push(offer);
  }
  return offers;
}

function showShortlist(offers: ComparedOffer[]): void {
  console.log("\nSupplier shortlist (USDC; eligibility uses exact six-decimal arithmetic):");
  for (const offer of offers) {
    const status = offer.eligible ? "ELIGIBLE" : `NOT ELIGIBLE: ${offer.reasons.join("; ")}`;
    console.log(
      `- ${offer.id}: ${offer.supplier} | total ${formatUsdc(offer.total)} | ` +
      `${offer.availableQuantity} available | ${offer.deliveryDays} day(s) | ` +
      `operator reliability rating ${offer.reliability}/5 | ${status}`,
    );
    console.log(`  Source: ${offer.sourceUrl}`);
  }
}

async function approveResearch(): Promise<boolean> {
  console.log(`\nThis review costs at most ${process.env.BUY_RESEARCH_NETWORK === "mainnet" ? "0.01 USDC on Celo mainnet" : "0.01 test USDC on Celo Sepolia"}.`);
  console.log("The x402 result is advisory; it does not verify supplier claims.");
  return (await ask("Type PAY RESEARCH to authorize this one paid call: ")) === "PAY RESEARCH";
}

async function saveReceipt(receipt: PurchaseReceipt): Promise<string> {
  await mkdir("receipts", { recursive: true });
  const stamp = receipt.createdAt.replace(/[:.]/g, "-");
  const path = `receipts/procurement-${stamp}.json`;
  await writeFile(path, `${JSON.stringify(receipt, null, 2)}\n`, { flag: "wx" });
  return path;
}

async function procure(): Promise<void> {
  console.log("Emporos — shop inventory restock\n");
  console.log("Enter supplier quotes you have independently obtained. Never rely on a wallet address sent only by an unsolicited message.");
  const request = await collectRequest();
  const suppliedOffers = await collectOffers();
  const offers = compareOffers(request, suppliedOffers);
  showShortlist(offers);

  let paidResearch: PurchaseReceipt["paidResearch"] = {
    network: configuredResearchNetwork(),
  };
  if (
    offers.some((offer) => offer.eligible) &&
    (await ask("\nRequest an optional paid supplier-risk review through buy? (yes/no): ")).toLowerCase() === "yes"
  ) {
    paidResearch = await paidResearchReview(request, offers, approveResearch);
  } else {
    console.log("\nNo paid advisory requested (or no quote meets the constraints).");
  }
  if (paidResearch.response) {
    console.log("\nPaid supplier-risk advisory (unverified text; do not treat as proof):\n");
    console.log(paidResearch.response);
  } else {
    console.log("\nNo paid advisory was authorized.");
  }

  const eligible = offers.filter((offer) => offer.eligible);
  const selectedId = await ask("\nChoose an eligible offer ID to proceed, or press Enter to stop: ");
  const selected = eligible.find((offer) => offer.id === selectedId);
  if (!selected) {
    const receipt: PurchaseReceipt = {
      createdAt: new Date().toISOString(),
      request,
      offers: offers.map((offer) => ({ ...offer, total: formatUsdc(offer.total) })),
      paidResearch,
    };
    console.log(`\nNo purchase made. Decision log: ${await saveReceipt(receipt)}`);
    return;
  }
  if (!selected.walletAddress) {
    throw new Error("This offer has no supplier wallet address; no payment was attempted.");
  }

  const exactAmount = formatUsdc(selected.total);
  console.log("\nMAINNET PAYMENT REVIEW");
  console.log(`Supplier: ${selected.supplier}`);
  console.log(`USDC recipient: ${selected.walletAddress}`);
  console.log(`Exact amount: ${exactAmount} USDC`);
  console.log(`Maximum request budget: ${request.maxBudget} USDC`);
  console.log("Token transfer is irreversible. Verify the supplier wallet with the supplier using a separate trusted channel.");
  const confirmation = await ask(`Type PAY ${selected.id} ${exactAmount} to submit this tagged Celo mainnet transfer: `);
  if (confirmation !== `PAY ${selected.id} ${exactAmount}`) {
    console.log("Approval did not match; no supplier payment was made.");
    const receipt: PurchaseReceipt = {
      createdAt: new Date().toISOString(),
      request,
      offers: offers.map((offer) => ({ ...offer, total: formatUsdc(offer.total) })),
      paidResearch,
    };
    console.log(`Decision log: ${await saveReceipt(receipt)}`);
    return;
  }

  console.log(`Submitting from procurement wallet ${procurementWalletAddress()}...`);
  const transactionHash = await paySupplier(selected);
  console.log("\nPayment confirmed.");
  console.log(`Transaction: https://celoscan.io/tx/${transactionHash}`);
  const receipt: PurchaseReceipt = {
    createdAt: new Date().toISOString(),
    request,
    offers: offers.map((offer) => ({ ...offer, total: formatUsdc(offer.total) })),
    paidResearch,
    purchase: {
      offerId: selected.id,
      supplier: selected.supplier,
      amount: exactAmount,
      recipient: selected.walletAddress,
      transactionHash,
      trackingInfo: selected.trackingInfo,
    },
  };
  const receiptPath = await saveReceipt(receipt);
  console.log(`Supplier-provided fulfillment info: ${selected.trackingInfo || "not provided"}`);
  console.log(`Decision log: ${receiptPath}`);
  console.log("This on-chain receipt is proof of payment only; it is not proof of shipment or delivery.");
}

async function register(): Promise<void> {
  const agentUri = process.env.AGENT_URI;
  if (!agentUri) throw new Error("Set AGENT_URI to the public registration JSON URL before running register.");
  console.log(`Registering ${procurementWalletAddress()} as an ERC-8004 agent on Celo mainnet.`);
  console.log("The registration transaction includes the configured ERC-8021 attribution code.");
  if (await ask("Type REGISTER MAINNET to submit this irreversible registration: ") !== "REGISTER MAINNET") {
    console.log("Registration cancelled.");
    return;
  }
  const result = await registerAgent(agentUri);
  console.log(`Registered agent ID ${result.agentId.toString()}.`);
  console.log(`Transaction: https://celoscan.io/tx/${result.hash}`);
}

async function main(): Promise<void> {
  const command = process.argv[2] ?? "procure";
  if (command === "procure") {
    await procure();
  } else if (command === "register") {
    await register();
  } else {
    throw new Error(`Unknown command "${command}". Use "procure" or "register".`);
  }
}

main()
  .catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  })
  .finally(() => input.close());
