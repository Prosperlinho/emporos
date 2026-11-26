import { Inter } from "next/font/google";
import Link from "next/link";
import { Hero } from "@/components/landing/Hero.tsx";
import { Statement } from "@/components/landing/Statement.tsx";
import { TwoSides } from "@/components/landing/TwoSides.tsx";
import "./landing.css";

const inter = Inter({ subsets: ["latin"], weight: ["300", "400", "500", "700"], display: "swap", variable: "--lx-font" });

export default function Landing() {
  return (
    <div className={`lx ${inter.variable}`}>
      <Hero />
      <Statement />
      <TwoSides />
      <footer className="lx-footer">
        <span className="lx-mark">E</span>
        <span>Payments on Celo are final. Verify supplier wallets.</span>
        <nav>
          <Link href="/supplier">Suppliers</Link>
          <Link href="/login">Sign in</Link>
        </nav>
      </footer>
    </div>
  );
}
