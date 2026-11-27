# Emporos

**Tell it what your shop needs. It buys from the best supplier and pays in naira (cNGN) on Celo, within the limit you set.**

🔗 **Live:** https://emporos-mu.vercel.app · **Try it without a wallet:** https://emporos-mu.vercel.app/app?demo=1 · **Agent directory:** https://emporos-mu.vercel.app/agents

Small shops in Nigeria restock by phoning suppliers, comparing prices in their heads and paying in cash or by transfer. Emporos is a restocking agent that does that work: the owner types a request the way they'd text a supplier, and the agent finds the best quote, explains why, and pays the supplier in cNGN. It pays on its own within a weekly limit the owner sets; anything over that waits for the owner's fingerprint.

---

## Try it in 2 minutes (no wallet, no funds)

1. Open **https://emporos-mu.vercel.app** and click **Try with sample data**.
2. Tap the example **"50 bags of rice, under ₦2m, Lagos, 5 days"** (or type your own, e.g. *"abeg send 30 jerrycan groundnut oil to Abuja, 1.5m max, next week"*).
3. Watch the agent:
   - **understand** the request (AI parsing into item, quantity, budget, area, deadline),
   - **compare** four suppliers on price, delivery time and stock, ruling out ones that miss the deadline or lack stock,
   - **explain** its pick in plain language,
   - **pay automatically** because the order is inside the weekly limit and the supplier is trusted (a 5-second countdown you can stop).
4. Open **Orders** to see the receipt: why that supplier, the rule check, every alternative considered, and proof of payment.
5. Try one over the limit (e.g. *"100 bags of rice, under ₦5m, Lagos, 5 days"*) to see the **approval** path.

Sample mode uses fictional suppliers and simulated payments. The live site does the same with real suppliers and real cNGN on Celo mainnet.

---

## On-chain proof (Celo mainnet)

| What | Evidence |
| --- | --- |
| ERC-8004 agent registered from the app | Agent **#10142** (Tesy foodstore, Enugu) in the Celo Identity Registry `0x8004A169FB4a3325136EB29fA0ceB6D2e539a432` |
| Registration transaction | [`0x9afc5ea2…f119`](https://celoscan.io/tx/0x9afc5ea2283e96387d1516c812d0d49344f3a9adabd1fa52ee9e99a41323f119) |
| ERC-8021 attribution tag on that transaction | calldata ends with `celo_353ee8cf4cbc` (open the tx on Celoscan → Input Data) |
| Agent registration document (tokenURI) | [`/api/agent-registration?wallet=0x0120…af92`](https://emporos-mu.vercel.app/api/agent-registration?wallet=0x012075c3729c5CBf03227e287EF8aa381c34af92) |
| Public directory of registered agents | https://emporos-mu.vercel.app/agents |

Every transaction Emporos signs (supplier payment, USD₮→cNGN swap and approval, agent registration, session grant/revoke, wallet sweep) carries the attribution suffix. A transaction cannot be sent without the code configured.

---

## How it uses Celo and partner tech

| Technology | Where | What it does |
| --- | --- | --- |
| **cNGN** (`0xF6829D…271a4f`, verified on-chain: name/symbol cNGN, 6 decimals) | `lib/payments.ts`, `lib/altana.ts` | Suppliers are paid in naira stablecoin |
| **USD₮ on Celo** | `lib/payments.ts`, `lib/fx/server.ts` | Tops up cNGN when the balance is short; pays Altana relay fees |
| **ERC-8004 Identity Registry** | `lib/erc8004.ts`, `lib/altana.ts`, `app/api/agent-registration` | Each shop's agent gets a public on-chain ID; its document is served by Emporos and self-updates with the ID |
| **ERC-8021 attribution** (`@celo/attribution-tags`, Altana `appCode`) | `lib/chain/tx.ts`, `lib/altana.ts` | Tags every Emporos transaction |
| **Altana agent wallets** (SDK 1.2) | `lib/altana.ts` | The shop's "Emporos balance": a passkey-secured smart wallet. Auto-pay is a session key whose limits are **enforced on-chain**: it may only call `cNGN.transfer`, up to the weekly cap, until expiry. Revocable in one transaction |
| **FX** | `lib/fx/server.ts` | USD₮→cNGN via the 0x Swap API on Celo. A Textile FX adapter is stubbed behind the same interface |
| **LLM** (any OpenAI-compatible API; we run Gemini Flash-Lite) | `lib/llm.ts` | Turns plain language (incl. Nigerian English, "two dozen", "1.5m", "next week") into fields. Schema-validated, never authorizes payment, falls back to a rule-based parser |

---

## How the agent decides

- **Eligibility** (`lib/ranking.ts`): enough stock, meets the deadline, within budget, delivers to the area, has a payout account.
- **Ranking:** price 60%, delivery speed 25%, stock headroom 10%, verified supplier 5%. Every pick comes with written reasons and the list of quotes it ruled out and why.
- **Auto-pay rules** (`lib/rules.ts`): per-order limit, weekly (or daily) cap, trusted supplier, an active unexpired agent key, the key's own cap, and the supplier on the agent's allowlist. All must pass; otherwise the owner approves.
- **Safety:** a sent-but-unconfirmed payment keeps its hash and is never resent automatically; swaps approve exactly the amount needed; payments are locked until setup (shop, limit, balance, auto-pay + agent ID) is finished.

---

## Built for shop owners, not crypto users

- **Sign up with fingerprint or Face ID** (WebAuthn passkeys). No password, no seed phrase, no browser wallet. Crypto-wallet sign-in (SIWE) and email codes are available under "Other ways".
- **Three-screen start:** shop name and area, weekly limit (₦100k / ₦500k / ₦1m / other), secure account.
- **Plain language:** "Emporos balance", "weekly limit", "trusted suppliers", "proof of payment". Chain details live under "Technical details".
- **Suppliers** list products, prices, stock and delivery days at `/supplier`, and can create a fingerprint-protected payout account instead of pasting a wallet address.
- Mobile-first; motion respects `prefers-reduced-motion`.

---

## Honest limitations

- **Topping up needs cNGN.** Shops must get cNGN (plus ~$1 of USD₮ for fees) onto Celo themselves. A bank-transfer on-ramp partner is the main missing piece.
- **Altana on mainnet is new.** The SDK was released days before submission; we follow its documented API, but the auto-pay grant had not yet completed end-to-end on mainnet at the time of writing. The browser session-key wallet is a working fallback (limits enforced by Emporos, balance is the hard ceiling).
- **Supplier recipients are checked by Emporos**, not on-chain: Altana restricts the contract and function (`cNGN.transfer`) and the amount, not the recipient.
- **Textile FX** is an interface stub (no public API docs at build time); 0x is used for swaps.
- Two passkey prompts exist (sign-in and the Altana balance) because they are separate systems.

---

## Run it locally

```powershell
npm install
Copy-Item .env.example .env.local   # everything is optional for sample mode
npm run dev                         # http://localhost:3000
npm test                            # parser, money, ranking and rules tests
```

Production uses Vercel with Neon Postgres (tables are created automatically). See `.env.example` for every setting: `DATABASE_URL`, `NEXT_PUBLIC_ATTRIBUTION_CODE`, `NEXT_PUBLIC_CNGN_ADDRESS`, `LLM_BASE_URL` / `LLM_API_KEY` / `LLM_MODEL`, `ZEROX_API_KEY`, `ADMIN_WALLETS`, optional `RESEND_API_KEY`.

## Repo layout

```text
app/                  Landing, /start, /login, /app (Buy, Orders, Suppliers, Account, Add money), /supplier, /agents, /api/*
components/           App state, payment hook, landing sections, shared UI, logo
lib/                  parse, ranking, rules, money (tested); payments, FX, Altana, ERC-8004, data stores
lib/server/           Postgres, sessions, passkeys, validated data layer (server only)
src/                  Original CLI prototype (USDC + @celo/buy research)
```
