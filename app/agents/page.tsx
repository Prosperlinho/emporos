import type { Metadata } from "next";
import { Inter } from "next/font/google";
import Link from "next/link";
import { LogoMark } from "@/components/Logo.tsx";
import { AgentSearch } from "@/components/landing/AgentSearch.tsx";
import { dbConfigured } from "@/lib/server/db.ts";
import { listPublicAgents, type PublicAgent } from "@/lib/server/repo.ts";
import "../landing.css";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Agent directory · Emporos",
  description: "Shop agents registered on Celo with Emporos. Look up an agent's on-chain ID and wallet.",
};

const inter = Inter({ subsets: ["latin"], weight: ["300", "400", "500", "700"], display: "swap", variable: "--lx-font" });

export default async function AgentsPage() {
  let agents: PublicAgent[] = [];
  let failed = false;
  if (dbConfigured) {
    try {
      agents = await listPublicAgents();
    } catch {
      failed = true;
    }
  }

  return (
    <div className={`lx ${inter.variable}`}>
      <header className="lx-dir-nav">
        <Link href="/" className="lx-logo" aria-label="Emporos home"><LogoMark size={30} /></Link>
        <div className="lx-nav-right">
          <Link href="/login" className="lx-link">Sign in</Link>
          <Link href="/start" className="lx-pill lx-pill-sm">Get started</Link>
        </div>
      </header>

      <main className="lx-dir">
        <header>
          <h1>Agent directory.</h1>
          <p>Shop agents registered on Celo with Emporos. Each one has a public on-chain ID (ERC-8004) and pays suppliers only within limits its owner set.</p>
        </header>
        {failed ? (
          <p className="lx-dir-empty">The directory couldn&apos;t load right now. Try again shortly.</p>
        ) : (
          <AgentSearch agents={agents} />
        )}
      </main>

      <footer className="lx-footer">
        <LogoMark size={28} />
        <span>Listing is opt-in. Registrations are public on Celo.</span>
        <nav>
          <Link href="/">Home</Link>
          <Link href="/supplier">Suppliers</Link>
        </nav>
      </footer>
    </div>
  );
}
