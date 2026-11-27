import type { Metadata } from "next";
import { Inter } from "next/font/google";
import Link from "next/link";
import type { ReactNode } from "react";
import { LogoMark } from "@/components/Logo.tsx";
import "../landing.css";

export const metadata: Metadata = {
  title: "Docs · Emporos",
  description: "How Emporos works: for shop owners, suppliers and developers. Limits, payments in cNGN on Celo, agent IDs and the public API.",
};

const inter = Inter({ subsets: ["latin"], weight: ["300", "400", "500", "700"], display: "swap", variable: "--lx-font" });

const SECTIONS = [
  { id: "overview", title: "What Emporos does" },
  { id: "shops", title: "For shop owners" },
  { id: "suppliers", title: "For suppliers" },
  { id: "decides", title: "How the agent decides" },
  { id: "safety", title: "Limits and safety" },
  { id: "onchain", title: "On Celo" },
  { id: "api", title: "API" },
  { id: "faq", title: "FAQ" },
];

function Section({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section id={id} className="lx-doc-section">
      <h2>{title}</h2>
      {children}
    </section>
  );
}

const Code = ({ children }: { children: string }) => <pre className="lx-code"><code>{children}</code></pre>;

export default function DocsPage() {
  return (
    <div className={`lx ${inter.variable}`}>
      <header className="lx-dir-nav">
        <Link href="/" className="lx-logo" aria-label="Emporos home"><LogoMark size={30} /></Link>
        <div className="lx-nav-right">
          <Link href="/agents" className="lx-link">Agents</Link>
          <Link href="/login" className="lx-link">Sign in</Link>
          <Link href="/start" className="lx-pill lx-pill-sm">Get started</Link>
        </div>
      </header>

      <div className="lx-docs">
        <nav className="lx-toc" aria-label="On this page">
          <span>Docs</span>
          {SECTIONS.map((s) => <a key={s.id} href={`#${s.id}`}>{s.title}</a>)}
        </nav>

        <main className="lx-doc">
          <h1>Emporos docs.</h1>
          <p className="lx-doc-lead">Everything about how Emporos buys for your shop, how suppliers get paid, and how it works on Celo.</p>

          <Section id="overview" title="What Emporos does">
            <p>Emporos is a restocking agent for small shops. You tell it what you need in a normal sentence. It finds the best supplier, tells you why, and pays them in naira.</p>
            <ol>
              <li><b>Ask.</b> &ldquo;50 bags of rice, under ₦2m, Lagos, 5 days.&rdquo;</li>
              <li><b>Compare.</b> It checks every supplier&apos;s price, stock and delivery time against your request.</li>
              <li><b>Pay.</b> If the order is inside your weekly limit and the supplier is trusted, it pays on its own. If not, it asks you first.</li>
            </ol>
            <p>Every order gets a receipt that shows the supplier, the price, why it was chosen, the other quotes it looked at, and proof of payment.</p>
            <p><Link href="/app?demo=1">Try it with sample data</Link>. No account or money needed.</p>
          </Section>

          <Section id="shops" title="For shop owners">
            <h3>Get started</h3>
            <ol>
              <li>Tap <b>Get started</b> and enter your shop name and area.</li>
              <li>Choose how much Emporos can spend each week without asking you (for example ₦500,000).</li>
              <li>Secure your account with your phone&apos;s fingerprint or Face ID. There is no password.</li>
            </ol>
            <h3>Add money</h3>
            <p>Open <b>Add money</b> to create your <b>Emporos balance</b>. That&apos;s where your money for supplies lives, protected by your fingerprint. Send naira (cNGN) to the account number shown, on the <b>Celo</b> network. Also send about $1 of USD₮ once; it pays network fees for many payments.</p>
            <h3>Turn on auto-pay</h3>
            <p>Under <b>Account → Auto-pay</b>, tap <b>Turn on auto-pay</b>. You confirm twice with your fingerprint: once to lock in your weekly limit, and once to get your shop&apos;s public agent ID. After that, Emporos pays your <b>trusted suppliers</b> on its own, up to your limit.</p>
            <h3>Buying</h3>
            <p>On <b>Buy</b>, type what you need: item, how many, your budget, where, and how soon. You can write it your way, for example &ldquo;abeg send 30 jerrycan groundnut oil to Abuja, 1.5m max, next week&rdquo;. Check what Emporos understood, fix anything wrong, and it will recommend a supplier.</p>
            <ul>
              <li><b>Within your limit</b> and a trusted supplier: Emporos pays after a 5-second countdown. Tap <b>Stop</b> to cancel.</li>
              <li><b>Over your limit</b> or a new supplier: tap <b>Approve &amp; pay</b> and confirm with your fingerprint.</li>
              <li>After you approve a new supplier, you can tap <b>Trust them for automatic payments</b>.</li>
            </ul>
            <h3>After delivery</h3>
            <p>When the goods arrive, open the order and tap <b>Mark delivered</b>. A payment proves you paid; marking delivered records that you received the goods.</p>
          </Section>

          <Section id="suppliers" title="For suppliers">
            <ol>
              <li>Go to <Link href="/supplier">Suppliers</Link> and sign in.</li>
              <li>Add your business name, location and a phone or email buyers can reach.</li>
              <li>Under <b>Where you get paid</b>, tap <b>Create my payout account</b> (fingerprint or Face ID), or paste your own Celo wallet if you have one.</li>
              <li>List each product: name, unit, price, delivery fee, how many you have in stock, how many days delivery takes, and which areas you deliver to (or &ldquo;nationwide&rdquo;).</li>
            </ol>
            <p>Shops&apos; agents see your listings straight away. Keep stock and prices up to date: an out-of-date price or stock count means you lose orders or get ruled out. You&apos;re paid in cNGN the moment an order is approved.</p>
            <p>New suppliers start <b>unverified</b>. Emporos marks suppliers verified after checking the business, which slightly improves their ranking.</p>
          </Section>

          <Section id="decides" title="How the agent decides">
            <p>A quote is only considered if it meets every part of the request:</p>
            <ul>
              <li>enough stock for the quantity,</li>
              <li>delivery within your deadline,</li>
              <li>total (price × quantity + delivery fee) within your budget,</li>
              <li>delivers to your area,</li>
              <li>the supplier has a payout account.</li>
            </ul>
            <p>Among the quotes that qualify, Emporos scores each one:</p>
            <table className="lx-table">
              <thead><tr><th>Factor</th><th>Weight</th></tr></thead>
              <tbody>
                <tr><td>Total price</td><td>60%</td></tr>
                <tr><td>Delivery speed</td><td>25%</td></tr>
                <tr><td>Stock headroom</td><td>10%</td></tr>
                <tr><td>Verified supplier</td><td>5%</td></tr>
              </tbody>
            </table>
            <p>The recommendation always comes with written reasons, such as how much cheaper it is than the next option, and lists every quote it ruled out and why.</p>
            <p>Your request is read by an AI model, which only fills in the fields. It cannot approve or send a payment. If the AI is busy, a built-in reader takes over, and a budget you wrote with ₦ or &ldquo;naira&rdquo; is always taken as written.</p>
          </Section>

          <Section id="safety" title="Limits and safety">
            <p>Emporos only pays on its own when <b>all</b> of these are true:</p>
            <ul>
              <li>the order is under your per-order limit,</li>
              <li>it keeps this week&apos;s automatic spending under your weekly limit,</li>
              <li>the supplier is one you trust,</li>
              <li>auto-pay is on and hasn&apos;t expired.</li>
            </ul>
            <p>Otherwise it waits for you. With an Emporos balance, the weekly limit is also <b>locked on the Celo blockchain</b>: the auto-pay key can only send cNGN, only up to that amount, and only until it expires. Even if someone got hold of it, it couldn&apos;t spend more.</p>
            <ul>
              <li><b>Turn off auto-pay</b> any time under Account. It takes effect immediately; your money stays in your balance.</li>
              <li>A payment that was sent but not yet confirmed is never sent again automatically, so suppliers are never paid twice.</li>
              <li>Payments stay locked until your shop is fully set up.</li>
              <li>Payments on a blockchain can&apos;t be reversed. Only trust suppliers you know.</li>
            </ul>
          </Section>

          <Section id="onchain" title="On Celo">
            <table className="lx-table">
              <thead><tr><th>Piece</th><th>Details</th></tr></thead>
              <tbody>
                <tr><td>Network</td><td>Celo mainnet (chain 42220)</td></tr>
                <tr><td>cNGN</td><td><code>0xF6829D7393dAe24509eb1E52eE8e572e2E271a4f</code> (6 decimals)</td></tr>
                <tr><td>USD₮</td><td><code>0x48065fbBE25f71C9282ddf5e1cD6D6A887483D5e</code> (6 decimals)</td></tr>
                <tr><td>Agent IDs</td><td>ERC-8004 Identity Registry <code>0x8004A169FB4a3325136EB29fA0ceB6D2e539a432</code></td></tr>
                <tr><td>Attribution</td><td>Every Emporos transaction ends with the ERC-8021 tag <code>celo_353ee8cf4cbc</code></td></tr>
                <tr><td>Emporos balance</td><td>An Altana smart wallet secured by a passkey; auto-pay is an Altana session key with on-chain limits</td></tr>
                <tr><td>Exchange</td><td>USD₮ → cNGN top-ups via the 0x Swap API</td></tr>
              </tbody>
            </table>
            <p>Each shop&apos;s agent can be listed in the public <Link href="/agents">agent directory</Link>. Its registry entry points to a document served by Emporos (<code>/api/agent-registration</code>) describing the agent, its wallet and its ID.</p>
          </Section>

          <Section id="api" title="API">
            <p>Other apps and agents can use these public endpoints. All return JSON.</p>

            <h3>Rank supplier quotes</h3>
            <p><code>POST /api/quotes</code> with a structured request. Add <code>?demo=1</code> to use the sample catalog.</p>
            <Code>{`curl -X POST https://emporos-mu.vercel.app/api/quotes?demo=1 \\
  -H "content-type: application/json" \\
  -d '{"item":"rice","quantity":50,"maxBudget":"2000000","deliveryArea":"Lagos","deadlineDays":5}'`}</Code>
            <p>Returns <code>best</code> (the recommended quote), <code>ranked</code> (every matching quote with <code>eligible</code>, <code>failures</code> and <code>score</code>) and <code>reasons</code>. Amounts are naira as decimal strings.</p>

            <h3>Read a plain-language request</h3>
            <p><code>POST /api/parse</code> with <code>{`{ "text": "..." }`}</code> (max 600 characters). Returns the fields found, which ones are still <code>missing</code>, and whether the AI or the built-in reader answered.</p>
            <Code>{`curl -X POST https://emporos-mu.vercel.app/api/parse \\
  -H "content-type: application/json" \\
  -d '{"text":"50 bags of rice, under 2m naira, Lagos, 5 days"}'`}</Code>

            <h3>Agent directory</h3>
            <p><code>GET /api/agents</code> lists shops that chose to appear in the directory: name, area, agent ID, the wallet it pays from, and whether auto-pay is active.</p>

            <h3>Agent registration document</h3>
            <p><code>GET /api/agent-registration?wallet=0x…</code> returns the ERC-8004 registration-v1 document for an agent, including its ID once registered.</p>
          </Section>

          <Section id="faq" title="FAQ">
            <h3>Do I need a crypto wallet?</h3>
            <p>No. You sign in and approve payments with your fingerprint or Face ID. If you already use a crypto wallet, you can sign in with it under &ldquo;Other ways to sign in&rdquo;.</p>
            <h3>What is cNGN?</h3>
            <p>A stablecoin worth one Nigerian naira, on the Celo network. Payments in cNGN settle in seconds and cost very little.</p>
            <h3>How do I get cNGN into my balance?</h3>
            <p>Buy it with naira from an exchange or app that supports cNGN on Celo, and send it to your account number on <b>Add money</b>. Bank-transfer top-ups are coming.</p>
            <h3>What if Emporos picks the wrong supplier?</h3>
            <p>Every pick shows its reasons and the alternatives. Anything over your limit or from a new supplier always waits for you, and you can stop an automatic payment during its 5-second countdown.</p>
            <h3>Can I change my limit?</h3>
            <p>Yes, under <b>Account → Spending limit</b>. If auto-pay is on, turn it off and on again so the new limit is locked on-chain.</p>
            <h3>Who sees my shop?</h3>
            <p>Only shops that opt in appear in the agent directory, and only with their name, area and agent ID. Orders, limits and balances are never public on Emporos.</p>
          </Section>
        </main>
      </div>

      <footer className="lx-footer">
        <LogoMark size={28} />
        <span>Payments on Celo are final. Verify supplier wallets.</span>
        <nav>
          <Link href="/">Home</Link>
          <Link href="/agents">Agents</Link>
          <Link href="/supplier">Suppliers</Link>
        </nav>
      </footer>
    </div>
  );
}
