import { toDataSuffix } from "@celo/attribution-tags";
import {
  concat,
  createPublicClient,
  createWalletClient,
  custom,
  encodeFunctionData,
  erc20Abi,
  formatUnits,
  getAddress,
  http,
  isAddress,
} from "viem";
import { celo } from "viem/chains";
import { compareOffers, formatUsdc, validateOffer, validateRequest } from "../src/procurement.ts";
import type { ComparedOffer, ProcurementRequest, PurchaseReceipt, SupplierOffer } from "../src/types.ts";
import "./styles.css";

const USDC_ADDRESS = "0xcebA9300f2b948710d2653dD7B07f33A8B32118C" as const;
const CHAIN_ID = 42220;
const form = document.querySelector<HTMLFormElement>("#procurement-form")!;
const offerList = document.querySelector<HTMLDivElement>("#offer-list")!;
const offerTemplate = document.querySelector<HTMLTemplateElement>("#offer-template")!;
const resultsSection = document.querySelector<HTMLElement>("#results")!;
const shortlist = document.querySelector<HTMLDivElement>("#shortlist")!;
const paymentDialog = document.querySelector<HTMLDialogElement>("#payment-dialog")!;
const paymentForm = document.querySelector<HTMLFormElement>("#payment-form")!;
const paymentStatus = document.querySelector<HTMLParagraphElement>("#payment-status")!;
const submitPayment = document.querySelector<HTMLButtonElement>("#submit-payment")!;
const globalStatus = document.querySelector<HTMLDivElement>("#global-status")!;

interface Eip1193Provider {
  request<T = unknown>(args: { method: string; params?: readonly unknown[] }): Promise<T>;
}

declare global {
  interface Window {
    ethereum?: Eip1193Provider;
  }
}

interface ProcurementState {
  request: ProcurementRequest;
  offers: ComparedOffer[];
}

let state: ProcurementState | null = null;
let selectedOffer: ComparedOffer | null = null;
let currentReceipt: PurchaseReceipt | null = null;
const submittedOfferIds = new Set<string>();

function setStatus(message: string, error = false): void {
  globalStatus.textContent = message;
  globalStatus.hidden = !message;
  globalStatus.classList.toggle("is-error", error);
  paymentStatus.textContent = message;
  paymentStatus.classList.toggle("is-error", error);
}

function addOfferCard(): void {
  if (offerList.children.length >= 10) {
    setStatus("The first version supports up to 10 supplier quotes.", true);
    return;
  }
  const fragment = offerTemplate.content.cloneNode(true) as DocumentFragment;
  const card = fragment.querySelector<HTMLFieldSetElement>(".offer-card")!;
  const count = offerList.children.length + 1;
  card.querySelector<HTMLElement>(".offer-index")!.textContent = `Supplier quote ${count}`;
  card.querySelector<HTMLButtonElement>(".remove-offer")!.addEventListener("click", () => {
    if (offerList.children.length === 1) {
      setStatus("Keep at least one quote. You can clear its fields and start again.", true);
      return;
    }
    card.remove();
    renumberOffers();
  });
  offerList.append(fragment);
}

function renumberOffers(): void {
  Array.from(offerList.children).forEach((card, index) => {
    card.querySelector<HTMLElement>(".offer-index")!.textContent = `Supplier quote ${index + 1}`;
  });
}

function value(card: Element, name: string): string {
  const element = card.querySelector<HTMLInputElement>(`[data-field="${name}"]`);
  if (!element) throw new Error(`Missing supplier quote field: ${name}.`);
  return element.value.trim();
}

function collectRequest(): ProcurementRequest {
  const data = new FormData(form);
  const request: ProcurementRequest = {
    item: String(data.get("item") ?? "").trim(),
    quantity: Number(data.get("quantity")),
    maxBudget: String(data.get("maxBudget") ?? "").trim(),
    deadlineDays: Number(data.get("deadlineDays")),
    deliveryArea: String(data.get("deliveryArea") ?? "").trim(),
  };
  validateRequest(request);
  return request;
}

function collectOffers(): SupplierOffer[] {
  const cards = Array.from(offerList.querySelectorAll<HTMLFieldSetElement>(".offer-card"));
  if (cards.length === 0) throw new Error("Add at least one supplier quote.");

  const seenIds = new Set<string>();
  return cards.map((card, index) => {
    const id = value(card, "id") || `offer-${index + 1}`;
    if (seenIds.has(id)) throw new Error(`Offer reference "${id}" is duplicated.`);
    seenIds.add(id);
    const walletAddress = value(card, "walletAddress");
    if (walletAddress && !isAddress(walletAddress)) {
      throw new Error(`${id} supplier wallet is not a valid EVM address.`);
    }

    const offer: SupplierOffer = {
      id,
      supplier: value(card, "supplier"),
      itemDescription: value(card, "itemDescription"),
      itemMatches: card.querySelector<HTMLInputElement>('[data-field="itemMatches"]')!.checked,
      availableQuantity: Number(value(card, "availableQuantity")),
      unitPrice: value(card, "unitPrice"),
      shippingFee: value(card, "shippingFee"),
      deliveryDays: Number(value(card, "deliveryDays")),
      reliability: Number(value(card, "reliability")),
      sourceUrl: value(card, "sourceUrl"),
      walletAddress: walletAddress ? getAddress(walletAddress) : "",
      trackingInfo: value(card, "trackingInfo"),
    };
    validateOffer(offer);
    return offer;
  });
}

function createTextElement<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className: string,
  text: string,
): HTMLElementTagNameMap[K] {
  const element = document.createElement(tag);
  element.className = className;
  element.textContent = text;
  return element;
}

function renderOffer(offer: ComparedOffer): HTMLElement {
  const article = createTextElement("article", `offer-result${offer.eligible ? " is-eligible" : ""}`, "");
  const top = createTextElement("div", "result-top", "");
  const heading = document.createElement("h3");
  heading.className = "result-name";
  heading.append(document.createTextNode(`${offer.supplier} `));
  heading.append(createTextElement("span", "result-id", `· ${offer.id}`));
  top.append(heading, createTextElement("strong", "result-total", `${formatUsdc(offer.total)} USDC`));

  const meta = createTextElement(
    "div",
    "result-meta",
    `${offer.itemDescription} · ${offer.availableQuantity} available · ${offer.deliveryDays} day(s) · reliability ${offer.reliability}/5`,
  );
  const statusText = offer.eligible
    ? "Meets the item, stock, deadline and budget checks."
    : offer.reasons.join("; ");
  const status = createTextElement(
    "p",
    `result-status${offer.eligible ? "" : " is-ineligible"}`,
    statusText,
  );
  const source = document.createElement("a");
  source.className = "result-source";
  source.href = offer.sourceUrl;
  source.target = "_blank";
  source.rel = "noreferrer";
  source.textContent = "Open supplier quote ↗";
  article.append(top, meta, status, source);

  if (offer.eligible && offer.walletAddress && isAddress(offer.walletAddress)) {
    const alreadySubmitted = submittedOfferIds.has(offer.id);
    const payButton = createTextElement(
      "button",
      "button button-primary",
      alreadySubmitted ? "Payment already submitted" : "Review direct USDC payment",
    );
    payButton.type = "button";
    payButton.disabled = alreadySubmitted;
    payButton.addEventListener("click", () => openPaymentReview(offer));
    article.append(payButton);
  } else if (offer.eligible) {
    article.append(createTextElement("p", "report-note", "No supplier wallet was entered; this quote can be compared but not paid here."));
  }
  return article;
}

function renderShortlist(): void {
  if (!state) return;
  shortlist.replaceChildren(...state.offers.map(renderOffer));
}

function makeReceipt(): PurchaseReceipt {
  if (!state) throw new Error("Compare supplier quotes before creating a decision log.");
  return {
    createdAt: new Date().toISOString(),
    request: state.request,
    offers: state.offers.map((offer) => ({ ...offer, total: formatUsdc(offer.total) })),
    ...(currentReceipt?.paidResearch ? { paidResearch: currentReceipt.paidResearch } : {}),
    ...(currentReceipt?.purchase ? { purchase: currentReceipt.purchase } : {}),
  };
}

function downloadReceipt(): void {
  const receipt = makeReceipt();
  const blob = new Blob([`${JSON.stringify(receipt, null, 2)}\n`], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `emporos-decision-${new Date().toISOString().replace(/[:.]/g, "-")}.json`;
  anchor.click();
  URL.revokeObjectURL(url);
  setStatus("Decision log downloaded.");
}

function openPaymentReview(offer: ComparedOffer): void {
  if (submittedOfferIds.has(offer.id)) {
    setStatus("A transaction for this offer was already submitted. Check Celoscan before taking any further action.", true);
    return;
  }
  selectedOffer = offer;
  const supplier = document.querySelector<HTMLElement>("#payment-supplier")!;
  const recipient = document.querySelector<HTMLElement>("#payment-recipient")!;
  const total = document.querySelector<HTMLElement>("#payment-total")!;
  const hint = document.querySelector<HTMLElement>("#approval-hint")!;
  const confirmation = document.querySelector<HTMLInputElement>("#payment-confirmation")!;

  supplier.textContent = offer.supplier;
  recipient.textContent = offer.walletAddress;
  total.textContent = `${formatUsdc(offer.total)} USDC`;
  const phrase = `PAY ${offer.id} ${formatUsdc(offer.total)}`;
  hint.textContent = `Enter exactly: ${phrase}`;
  confirmation.value = "";
  document.querySelector<HTMLInputElement>("#attribution-code")!.value = "";
  document.querySelector<HTMLInputElement>("#recipient-verified")!.checked = false;
  setStatus("");
  paymentDialog.showModal();
}

function getProvider(): Eip1193Provider {
  if (!window.ethereum) {
    throw new Error("No browser wallet detected. Use a Celo-compatible wallet browser with an injected EVM provider.");
  }
  return window.ethereum;
}

function validateAttributionCode(code: string): void {
  if (!/^[a-z0-9_]{1,32}$/.test(code)) {
    throw new Error("Enter the actual attribution code assigned to this project (1–32 lowercase letters, digits or underscores).");
  }
}

async function submitDirectPayment(event: SubmitEvent): Promise<void> {
  event.preventDefault();
  if (!selectedOffer || !state) {
    setStatus("Select an eligible offer first.", true);
    return;
  }

  const offer = selectedOffer;
  const code = document.querySelector<HTMLInputElement>("#attribution-code")!.value.trim();
  const confirmation = document.querySelector<HTMLInputElement>("#payment-confirmation")!.value.trim();
  const recipientVerified = document.querySelector<HTMLInputElement>("#recipient-verified")!.checked;
  const expectedConfirmation = `PAY ${offer.id} ${formatUsdc(offer.total)}`;

  try {
    validateAttributionCode(code);
    if (!recipientVerified) throw new Error("Confirm that you verified the supplier wallet separately.");
    if (confirmation !== expectedConfirmation) throw new Error(`Approval must exactly match: ${expectedConfirmation}`);
    if (!offer.eligible || !offer.walletAddress || !isAddress(offer.walletAddress)) {
      throw new Error("This quote does not have an eligible offer and valid wallet address.");
    }
    const recipientAddress = getAddress(offer.walletAddress);

    submitPayment.disabled = true;
    setStatus("Connect your wallet and approve the transaction there. Check the recipient and amount carefully.");
    const provider = getProvider();
    const accounts = await provider.request<string[]>({ method: "eth_requestAccounts" });
    const account = accounts[0];
    if (!account || !isAddress(account)) throw new Error("The wallet did not return a valid address.");

    const chainHex = await provider.request<string>({ method: "eth_chainId" });
    if (BigInt(chainHex) !== BigInt(CHAIN_ID)) {
      throw new Error("Switch your wallet to Celo Mainnet (chain ID 42220). No payment was sent.");
    }

    const publicClient = createPublicClient({
      chain: celo,
      transport: http("https://forno.celo.org"),
    });
    const balance = await publicClient.readContract({
      address: USDC_ADDRESS,
      abi: erc20Abi,
      functionName: "balanceOf",
      args: [account],
    });
    if (balance < offer.total) {
      throw new Error(`Insufficient USDC: need ${formatUsdc(offer.total)}, have ${formatUnits(balance, 6)}.`);
    }

    const calldata = encodeFunctionData({
      abi: erc20Abi,
      functionName: "transfer",
      args: [recipientAddress, offer.total],
    });
    const taggedCalldata = concat([calldata, toDataSuffix(code)]);
    const walletClient = createWalletClient({
      account,
      chain: celo,
      transport: custom(provider),
    });
    const hash = await walletClient.sendTransaction({
      account,
      chain: celo,
      to: USDC_ADDRESS,
      data: taggedCalldata,
    });

    submittedOfferIds.add(offer.id);
    renderShortlist();
    setStatus(`Transaction submitted: ${hash}. Waiting for confirmation. Do not retry if this takes a while.`);
    const pendingReceipt: PurchaseReceipt = {
      ...makeReceipt(),
      purchase: {
        offerId: offer.id,
        supplier: offer.supplier,
        amount: formatUsdc(offer.total),
        recipient: recipientAddress,
        transactionHash: hash,
        trackingInfo: offer.trackingInfo,
      },
    };
    currentReceipt = pendingReceipt;
    try {
      const mined = await publicClient.waitForTransactionReceipt({ hash });
      if (mined.status !== "success") {
        throw new Error(`Transaction ${hash} reverted. Check the explorer before attempting anything else.`);
      }
      setStatus(`Payment confirmed. Transaction: ${hash}`);
      paymentDialog.close();
      setStatus("Payment confirmed. View the transaction on Celoscan or download the decision log.");
      const link = document.createElement("a");
      link.href = `https://celoscan.io/tx/${hash}`;
      link.target = "_blank";
      link.rel = "noreferrer";
      link.textContent = "View on Celoscan";
      globalStatus.append(document.createTextNode(" "), link);
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      setStatus(`Transaction was submitted (${hash}) but confirmation is unknown: ${reason}. Check Celoscan before retrying.`, true);
    }
  } catch (error) {
    setStatus(error instanceof Error ? error.message : String(error), true);
  } finally {
    submitPayment.disabled = false;
  }
}

form.addEventListener("submit", (event) => {
  event.preventDefault();
  try {
    const request = collectRequest();
    const offers = compareOffers(request, collectOffers());
    state = { request, offers };
    currentReceipt = null;
    renderShortlist();
    resultsSection.hidden = false;
    setStatus(`${offers.length} quote(s) compared. Review eligibility before taking any action.`);
    resultsSection.scrollIntoView({ behavior: "smooth", block: "start" });
  } catch (error) {
    setStatus(error instanceof Error ? error.message : String(error), true);
  }
});

document.querySelector<HTMLButtonElement>("#add-offer")!.addEventListener("click", addOfferCard);
document.querySelector<HTMLButtonElement>("#download-report")!.addEventListener("click", () => {
  try {
    downloadReceipt();
  } catch (error) {
    setStatus(error instanceof Error ? error.message : String(error), true);
  }
});
document.querySelector<HTMLButtonElement>("#close-dialog")!.addEventListener("click", () => paymentDialog.close());
paymentForm.addEventListener("submit", (event) => {
  void submitDirectPayment(event);
});
paymentDialog.addEventListener("close", () => {
  selectedOffer = null;
});

addOfferCard();
