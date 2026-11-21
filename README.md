# Emporos

Emporos is a cautious procurement agent for one concrete job: restocking small-shop inventory from supplier quotes. It compares stock, delivery time, operator-rated supplier reliability, total cost, and a hard budget; optionally pays once for a Celo `buy` review; asks for an exact, typed approval; and can send USDC directly to a supplier wallet on Celo mainnet. It writes a local decision and payment receipt.

The public web app is a separate, static, self-custody interface. Quote comparison runs in the browser, and approved USDC transfers are signed by the connected browser wallet. It has no backend, does not fetch supplier data, and does not provide the paid `buy` research flow; use the local CLI for that.

## What works in this starter

- Interactive request intake: item/SKU, quantity, max budget, delivery deadline, and delivery area.
- Supplier offers entered from quotes independently obtained by the operator. Every offer requires an HTTPS source URL; wallet addresses must be checked with the supplier out-of-band.
- Operator confirmation that each quoted item/SKU matches the requested item.
- Exact USDC arithmetic and a shortlist that flags budget, stock, item-match, or deadline failures.
- Optional paid Cencori review through the official `@celo/buy` CLI, capped at 0.01 USDC. Research defaults to Celo Sepolia sandbox.
- Exact-text approval before a real supplier transfer. The app verifies Celo mainnet, USDC balance, CELO gas, and the request budget before sending.
- ERC-8021 attribution suffix on direct supplier transfers and ERC-8004 registration transactions. Missing/invalid attribution codes block these transactions.
- A JSON decision log and Celoscan transaction link after a confirmed payment.
- A VS Code MCP registration for `@celo/buy` in `.vscode/mcp.json`.
- A static web UI deployable to GitHub Pages; quote information stays in the user's browser and payments require an injected Celo-compatible wallet.

The supplier payment is an on-chain USDC transfer, not a card checkout or an order placed through a retailer. Only use it with suppliers who have confirmed they accept USDC at the wallet address you verify. An on-chain payment proves payment, not shipment or delivery. Tracking details are supplier-provided.

## Requirements

- Node.js 22.18 or newer and npm.
- A dedicated, low-balance Celo wallet with USDC for supplier payments and CELO for transaction gas.
- A separately configured `buy` wallet for paid API research. `buy` keeps its wallet in the OS keychain.
- The actual attribution code assigned to your hackathon project.

Never paste private keys into chat, commit them, or fund an agent wallet with money you cannot afford to lose. `@celo/buy` is beta software and x402 payments are irreversible.

## Quick start (Windows PowerShell)

```powershell
npm install
Copy-Item .env.example .env
notepad .env
npm test
npm run build
npm run procure
```

The landing page is the site root. The procurement tool is available at `/app/`.
Run the web app locally with:

```powershell
npm run dev:web
```

The development server prints a localhost URL. The public site is built with `npm run build:web` and deployed by `.github/workflows/deploy-pages.yml`. Before its first deployment, enable **Settings → Pages → Build and deployment → Source: GitHub Actions** in the GitHub repository. Once enabled and the workflow succeeds, the landing URL is `https://prosperlinho.github.io/emporos/` and the procurement tool is at `https://prosperlinho.github.io/emporos/app/`.

The web app never receives a private key. The user connects an injected wallet, enters the actual hackathon attribution code, reviews the supplier address and amount, types an exact approval phrase, and approves the Celo mainnet transaction in the wallet. Do not rely on supplier URLs or wallet addresses without independent verification.

In `.env`, set `ATTRIBUTION_CODE` to the actual code issued to Emporos by the hackathon organizers. A derived hostname code is not a substitute for an assigned hackathon code. Create a fresh, dedicated account in a wallet you trust, back up its recovery phrase offline, and export only that account's private key locally into `PROCUREMENT_PRIVATE_KEY` in this ignored `.env` file. Never paste the key into chat, screenshots, issue trackers, or a terminal command; do not reuse a personal wallet. Fund the corresponding address with a small amount of USDC and enough CELO for gas. This prototype does not connect to a hardware wallet or browser wallet.

The interactive flow asks for the purchase request and supplier quotes. Quotes and delivery claims are operator-supplied and not independently verified. It displays the paid-service quote before prompting `PAY RESEARCH`; if declined, the deterministic shortlist remains available. The final supplier payment requires a separate exact confirmation such as `PAY quote-a 12.50`. Blank or mismatched approval means no payment.

## Configure `buy` and MCP

Install the official CLI and create its OS-keychain wallet:

```powershell
npm install -g @celo/buy@0.8.7
buy setup --name emporos-research
buy whoami
```

Fund that printed address with a small amount of USDC, USDT, or USAT on Celo mainnet if you intend to use paid mainnet research. The gateway sponsors x402 settlement gas. You do not need CELO in this `buy` wallet. For initial testing, leave `BUY_RESEARCH_NETWORK=sandbox`; sandbox uses Celo Sepolia test funds. The Cencori route has upstream service limits and the paid request is not automatically retried.

VS Code can discover the `celo-buy` server from `.vscode/mcp.json` after you trust the workspace and reload the MCP server list. It defaults to sandbox; remove `--sandbox` only when intentionally switching to mainnet. Alternatively, register the official server for supported clients with:

```powershell
buy mcp install --client all
```

The standalone procurement CLI invokes `buy quote` and, only after approval, a single `buy curl` call. MCP is available to an MCP-capable host for direct tool use. The procurement program does not call an MCP server itself.

## Attribution status and mainnet x402 caveat

Direct USDC supplier transfers and ERC-8004 registration calls append the configured code using `@celo/attribution-tags`. Confirm the transaction on Celoscan and verify its tag before relying on hackathon credit.

**Celo's hosted x402 facilitator currently does not add ERC-8021 tags to its settlement transactions.** Consequently, an x402 call paid on mainnet cannot currently meet a strict “tag every transaction” requirement, even though its payment is real. Emporos defaults paid research to the Sepolia sandbox. To knowingly enable untagged mainnet research, set `BUY_RESEARCH_NETWORK=mainnet` and `ALLOW_UNTAGGED_X402=1`; the app still displays the exact quote and requires `PAY RESEARCH`. Leave this disabled if every mainnet transaction must have the hackathon tag. This limitation is in the facilitator and cannot be fixed by appending data in Emporos.

The agent's direct USDC payment currently supports USDC only (Celo mainnet, 6 decimals). The `buy` API research payment is a separate x402 settlement from the CLI's separate keychain wallet.

## ERC-8004 registration

Publish a registration JSON document over HTTPS (or IPFS) and set `AGENT_URI` in `.env`. The URL must serve a valid ERC-8004 registration-v1 document describing the Emporos service; see the [Celo ERC-8004 guide](https://docs.celo.org/build/agents/8004). Then run:

```powershell
npm run register
```

The script registers on Celo mainnet with Identity Registry `0x8004A169FB4a3325136EB29fA0ceB6D2e539a432`, verifies the `Registered` event, and prints the agent ID and transaction. The procurement wallet becomes the ERC-721 owner and published agent wallet. Registration is irreversible in the sense that ownership and public identity are on-chain; inspect the URI and wallet before approving.

Self Agent ID is a separate proof-of-human registry and requires the human operator to complete a Self app passport/ID proof. It is not automated by this starter; use the [Self Agent ID guide](https://docs.celo.org/build/agents/self-agent-id) if you need that identity, and verify any resulting transaction's attribution before counting it for the hackathon.

## Safety boundaries

- No autonomous supplier discovery or order checkout: the first version requires operator-sourced quotes and a verified recipient.
- Eligibility uses the quoted total including shipping, exact USDC token units, and the request's hard budget.
- No payment for ineligible offers, offers without a valid supplier wallet, or transactions on a chain other than Celo mainnet.
- The user must type an exact approval phrase for the paid research call and separately for the purchase transfer.
- No automatic retry of paid `buy` calls or direct on-chain transactions after an ambiguous failure. Inspect `buy receipts --resolve` or the transaction before considering another attempt.
- Vendor facts and the optional model response are untrusted input. Neither is allowed to authorize payment.
- The buyer key and the `buy` key are separate. `.env` is ignored by git; keep backups securely and never publish it.
- The public web app is static and self-custodial; it does not transmit quotes to a server. It does not currently run paid `buy` research.

## Repo layout

```text
.github/workflows/ci.yml    Typecheck/build test workflow
.github/workflows/deploy-pages.yml  GitHub Pages deployment workflow
.vscode/mcp.json            VS Code Celo buy MCP configuration
src/chain.ts                Tagged Celo transfers and ERC-8004 registration
src/index.ts                Interactive procurement and approval flow
src/procurement.ts          Validation, exact arithmetic, shortlist
src/research.ts             Celo buy CLI quote/pay integration
src/types.ts                Procurement and receipt types
web/                        Public static procurement interface
```

## Hackathon checklist

- [x] Celo mainnet USDC supplier transfer with explicit approval and spend/balance checks.
- [x] Official `@celo/buy` CLI flow and VS Code MCP configuration.
- [x] ERC-8004 registration support.
- [x] ERC-8021 tags on Emporos-signed mainnet transactions, requiring the actual assigned attribution code.
- [x] Local receipt and decision log with transaction hash and supplier-provided fulfillment details.
- [ ] Mainnet x402 settlement attribution: waiting on facilitator support; see caveat above.
- [ ] Self Agent ID proof-of-human registration: not automated in this starter; complete it separately with the human operator if required.
- [ ] Autonomous supplier search and retailer checkout: intentionally out of scope until reliable, verifiable supplier APIs or a checkout integration are configured.

## References

- [Celo `buy` documentation](https://usebuy.ai/docs)
- [Celo ERC-8004 guide](https://docs.celo.org/build/agents/8004)
- [Self Agent ID guide](https://docs.celo.org/build/agents/self-agent-id) (optional human proof-of-identity flow)
- [Celo attribution tags / ERC-8021](https://docs.celo.org/build/agents/attribution-tags)
- [Self Agent ID](https://docs.celo.org/build/agents/self-agent-id)
