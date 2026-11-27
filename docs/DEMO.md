# Emporos demo script (about 3 minutes)

For a recorded video or a live pitch. Speak in the shop owner's voice; show the chain only at the end.

## 0:00 · The problem (15s)
"Mama Tunde runs a provisions shop in Surulere. Every week she phones four suppliers, compares prices in her head and pays by transfer. Emporos does that for her."

Show the landing page and scroll slowly: the device turns and splits into the shop's phone and the supplier's terminal; the statement lights up word by word.

## 0:20 · Ask (30s)
Click **Try with sample data**. Type or tap:
> 50 bags of rice, under ₦2m, Lagos, 5 days

Point at **Understood**: item, quantity, budget, area, deadline, pulled from one sentence. Optionally show a harder one:
> abeg send 30 jerrycan groundnut oil to Abuja, 1.5m max, next week

## 0:50 · Compare and explain (35s)
Point at the recommendation: **Ada Grains, ₦1,840,000**. Read two reasons aloud ("cheapest eligible quote", "delivers in 2 days; your deadline is 5"). Show **All quotes**: Sahel ruled out for missing the deadline, Delta for not enough stock.

## 1:25 · Pay within the limit (25s)
"It's under her weekly limit and Ada Grains is trusted, so Emporos pays on its own." Let the 5-second countdown run. Show the steps finishing and **View receipt**: why this supplier, rule check, every alternative, proof of payment.

## 1:50 · Over the limit (20s)
Ask for something larger, e.g. *100 bags of rice, under ₦5m, Lagos, 5 days*. Show **Emporos needs your OK** with the exact reasons. On the live site this is one fingerprint tap.

## 2:10 · Built on Celo (40s)
Switch to the live site:
- **Sign up** at `/start`: shop name, weekly limit, fingerprint. No wallet, no seed phrase.
- **Account → Auto-pay**: the limit is locked on-chain with an Altana session key (only `cNGN.transfer`, capped, expiring).
- **Agent directory** (`/agents`): agent **#10142**, registered in the ERC-8004 Identity Registry.
- Open the [registration transaction](https://celoscan.io/tx/0x9afc5ea2283e96387d1516c812d0d49344f3a9adabd1fa52ee9e99a41323f119) and point at the input data ending in `celo_353ee8cf4cbc`: every Emporos transaction is attribution-tagged.

## 2:50 · Close (10s)
"Say what your shop needs. It buys it: best supplier, paid in naira, within your limits."
