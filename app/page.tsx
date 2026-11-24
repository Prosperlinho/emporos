import Link from "next/link";

export default function Landing() {
  return (
    <div className="landing">
      <header>
        <Link className="brand" href="/"><span className="brand-mark">E</span><span>emporos</span></Link>
        <nav className="row">
          <Link href="/supplier" className="small">For suppliers</Link>
          <Link href="/login" className="btn small">Sign in</Link>
        </nav>
      </header>

      <main>
        <section className="hero">
          <span className="eyebrow">Restocking agent for Nigerian shops · on Celo</span>
          <h1>
            Tell it what you need. <em>It buys it right.</em>
          </h1>
          <p className="lead">
            Emporos finds the best supplier for your shop and pays them in naira stablecoin, automatically within your limits
            or with one tap when it&apos;s over.
          </p>
          <div className="row">
            <Link href="/app?demo=1" className="btn primary">Try the live demo →</Link>
            <Link href="/login" className="btn">Start with your shop</Link>
          </div>
          <p className="example">“50 bags of rice, under ₦2m, Lagos, 5 days”</p>
        </section>

        <section className="features">
          <div className="feature">
            <h3>1 · Say it plainly</h3>
            <p>Type the request like a message to your supplier. The agent pulls out item, quantity, budget, place and deadline.</p>
          </div>
          <div className="feature">
            <h3>2 · Best supplier, with reasons</h3>
            <p>It compares live quotes on price, delivery time and stock, and tells you exactly why it picked one.</p>
          </div>
          <div className="feature">
            <h3>3 · Paid in cNGN, within your rules</h3>
            <p>Under your limits, the agent wallet pays the supplier. Over them, you approve with one tap. Every payment has a receipt and a Celoscan link.</p>
          </div>
        </section>
      </main>

      <footer>
        Emporos is a prototype. Payments on Celo mainnet are irreversible: verify supplier wallets and fund the agent only with what it may spend.
      </footer>
    </div>
  );
}
