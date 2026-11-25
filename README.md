# Emporos

**Tell it what your shop needs. It finds the best supplier and pays in cNGN, within your rules.**

Emporos is a procurement agent for small Nigerian shops on Celo. A shop owner types
"50 bags of rice, under ₦2m, Lagos, 5 days". The agent turns that into structured fields,
pulls live supplier quotes, ranks them on price, delivery time and stock, and explains its pick.
If the order is within the owner's spending rules, the agent wallet pays the supplier in cNGN
automatically, topping up from USD₮ if needed. If it isn't, the owner approves with one tap.
Every order has a receipt with the reasoning, FX rate and Celoscan links.

## Status of each piece

| Area | Status |
| --- | --- |
| Wallet connect (RainbowKit + wagmi, Celo mainnet), USD₮ / cNGN balances | ✅ Built |
| Agent wallet: session key, spend cap, supplier allowlist, expiry, **Revoke agent** (sweeps funds back) | ✅ Built (local session-key provider) |
| Altana agent wallet (on-chain enforced limits) | ⏳ Interface stub in `lib/agent-wallet.ts`; needs Altana's Celo SDK/docs |
| ERC-8004 registration from the app; agent ID shown in Settings | ✅ Built (registration doc served at `/api/agent-registration`) |
| Business profile, spending rules (per order, daily/weekly cap, approved suppliers) | ✅ Built |
| Supplier directory (name, wallet, currency, verified) | ✅ Built |
| Supplier portal: products, prices, stock, delivery days, areas | ✅ Built (`/supplier`) |
| Postgres on Vercel (Neon); every API route checks the signed-in user | ✅ Tables created automatically (`lib/server/db.ts`) |
| Seed with 3–5 real or friendly suppliers | ⏳ Suppliers sign up at `/supplier`, or you add them on the Suppliers page; admins verify them |
| Public quotes API for other agents (`POST /api/quotes`) | ✅ Built; x402 paywall not added |
| LLM request parsing (any OpenAI-compatible API) + rule-based fallback | ✅ Built |
| Ranking with reasons; auto-pay within rules; one-tap approval otherwise | ✅ Built |
| USD₮ → cNGN swap, attribution-tagged | ✅ Via 0x Swap API. ⏳ Textile FX adapter is a stub in `lib/fx/server.ts`. |
| cNGN supplier transfer, attribution-tagged | ✅ Built; needs `NEXT_PUBLIC_CNGN_ADDRESS` |
| Errors: rejected tx, low balance, no gas, failed swap, unconfirmed tx (never auto-retried) | ✅ Built |
| Order history (quoted → paid → delivered), receipts, FX rate, Celoscan links, **Mark delivered** | ✅ Built |
| Login with wallet (Sign-In with Ethereum) or email code | ✅ Built (signed-cookie sessions; email needs a Resend key) |
| Mobile-first UI, landing page, live demo | ✅ Built |

### What you must supply before real money moves

1. **`NEXT_PUBLIC_ATTRIBUTION_CODE`**: the code assigned to this project. Live payments stay blocked until it is set.
2. **`NEXT_PUBLIC_CNGN_ADDRESS`**: the issuer-verified cNGN contract. More than one token uses the cNGN ticker on Celo, so there is no default.
3. **FX route**: `ZEROX_API_KEY` for the 0x fallback (check it actually routes USD₮→cNGN), or Textile FX's API docs so the adapter can be finished.
4. **Real suppliers**: have them list themselves at `/supplier`, then verify them as an admin. Confirm each wallet address with the supplier directly.
5. **Altana** (optional): its Celo SDK docs, to replace the browser session key with on-chain limits.

## Run it

```powershell
npm install
Copy-Item .env.example .env.local   # fill in what you have; everything is optional for the demo
npm run dev                         # http://localhost:3000
npm test                            # parser, money, ranking and rules tests
```

With no environment variables, `/app?demo=1` runs the full flow with fictional suppliers and simulated payments.

### Database (Vercel Postgres via Neon, free)

1. In Vercel: **Storage → Create Database → Neon** (free plan), then connect it to the emporos project. This adds `DATABASE_URL`.
2. Redeploy. Tables are created on the first request; there is nothing to run by hand.
3. Add your wallet to `ADMIN_WALLETS` (comma-separated) so you can mark suppliers verified from the Suppliers page.
4. Optional: `RESEND_API_KEY` (+ `EMAIL_FROM` on a verified domain) turns on email sign-in codes.

### Deploy

Import the repo into Vercel (framework: Next.js) and add the same environment variables.
Register the agent (Settings → Agent identity) from the deployed HTTPS site so the registry can fetch its document.

## How the agent decides

- **Parsing** (`lib/llm.ts`, `lib/parse.ts`): the LLM only extracts fields and its output is schema-validated. A budget the user wrote with ₦/naira overrides the LLM's reading. With no LLM configured, a deterministic parser handles phrases like "₦2m", "N450,000", "next week".
- **Ranking** (`lib/ranking.ts`): a quote is eligible only if it has enough stock, meets the deadline, fits the budget, delivers to the area and has a payout wallet. Eligible quotes are scored on price 60%, speed 25%, stock headroom 10% and verified 5%. Every recommendation lists its reasons and what it ruled out.
- **Rules** (`lib/rules.ts`): auto-pay needs every check to pass: per-order limit, the agent's daily or weekly cap, approved supplier, an active (unexpired, unrevoked) agent key, the key's own spend cap, and the supplier wallet on the key's allowlist. Otherwise the order waits for one-tap approval from the owner's wallet. Auto-pay waits 5 seconds and can be stopped.
- **Payment** (`lib/payments.ts`): checks the chain and balances. If cNGN is short, it quotes USD₮→cNGN, approves exactly the sell amount, swaps, and verifies the received cNGN. Then it transfers cNGN to the supplier. Every transaction carries the ERC-8021 attribution suffix. A transaction that was sent but not confirmed keeps its hash and is never resent automatically.

## Safety notes

- The **local session-key** agent keeps its key in the browser's localStorage. Its balance is the real ceiling, so fund it only with what it may spend. Limits are enforced by Emporos before signing, not on-chain; that's what the Altana integration is for. **Revoke agent** returns tokens and CELO to the connected owner wallet and deletes the key.
- `/api/parse` and `/api/quotes` are public. Add rate limiting before a public launch, since `/api/parse` spends LLM credits.
- On-chain payment proves payment, not delivery. The buyer confirms delivery with **Mark delivered**.

## Repo layout

```text
app/                    Next.js routes: landing, /login, /app (agent, orders, suppliers, settings), /supplier, /api/*
components/             App context, payment hook, shared UI
lib/                    Domain logic (parse, ranking, rules, money), chain, FX, payments, agent wallet, data stores
lib/server/             Postgres access, sessions, validated data layer (server only)
src/                    Original CLI (USDC flow + @celo/buy research), built with tsconfig.cli.json
```
