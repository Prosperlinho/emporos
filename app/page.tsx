import Link from "next/link";
import { HeroDemo } from "@/components/HeroDemo.tsx";
import { Reveal } from "@/components/Reveal.tsx";

const HEADLINE = ["Say", "what", "your", "shop", "needs."];
const EXAMPLES = [
  "50 bags of rice, under ₦2m, Lagos, 5 days",
  "20 cartons of noodles, ₦300k, Ikeja, 3 days",
  "30 jerrycans of groundnut oil, ₦1.5m, Abuja",
  "100 bags of cement, max ₦900k, Port Harcourt",
  "10 bags of sugar, ₦700k, Lagos, tomorrow",
];
const STEPS = [
  { n: "01", title: "Ask", text: "Type it like a message to your supplier." },
  { n: "02", title: "Compare", text: "Live quotes ranked on price, speed and stock, with reasons." },
  { n: "03", title: "Pay", text: "Paid in cNGN within your limits. Over them, one tap." },
];

export default function Landing() {
  return (
    <div className="landing">
      <div className="glow" aria-hidden="true" />
      <header className="fade-in">
        <Link className="brand" href="/"><span className="brand-mark">E</span><span>emporos</span></Link>
        <nav className="row">
          <Link href="/supplier" className="small nav-link">Suppliers</Link>
          <Link href="/login" className="btn small">Sign in</Link>
        </nav>
      </header>

      <main>
        <section className="hero">
          <div className="hero-copy">
            <span className="eyebrow fade-in" style={{ animationDelay: "80ms" }}>Restocking agent · Celo</span>
            <h1>
              {HEADLINE.map((word, i) => (
                <span key={word} className="word" style={{ animationDelay: `${160 + i * 90}ms` }}>{word} </span>
              ))}
              <em className="word" style={{ animationDelay: `${160 + HEADLINE.length * 90 + 120}ms` }}>It buys it.</em>
            </h1>
            <p className="lead fade-in" style={{ animationDelay: "900ms" }}>
              Best supplier, paid in cNGN, within your limits.
            </p>
            <div className="row fade-in" style={{ animationDelay: "1050ms" }}>
              <Link href="/login" className="btn primary">Get started →</Link>
              <Link href="/app?demo=1" className="btn">Try with sample data</Link>
            </div>
          </div>
          <div className="hero-demo fade-in" style={{ animationDelay: "500ms" }}>
            <HeroDemo />
          </div>
        </section>

        <div className="marquee" aria-hidden="true">
          <div className="marquee-track">
            {[...EXAMPLES, ...EXAMPLES].map((example, i) => (
              <span key={i}>“{example}”</span>
            ))}
          </div>
        </div>

        <section className="steps-grid">
          {STEPS.map((step, i) => (
            <Reveal key={step.n} delay={i * 120} className="feature">
              <span className="feature-n">{step.n}</span>
              <h3>{step.title}</h3>
              <p>{step.text}</p>
            </Reveal>
          ))}
        </section>
      </main>

      <footer>Payments on Celo are final. Verify supplier wallets.</footer>
    </div>
  );
}
