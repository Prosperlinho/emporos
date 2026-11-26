"use client";

import { ConnectButton } from "@rainbow-me/rainbowkit";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, type ReactNode } from "react";
import { useAccount } from "wagmi";
import { useApp } from "@/components/AppContext.tsx";
import { Balances } from "@/components/Balances.tsx";
import { resetDemo } from "@/lib/data/demo-store.ts";

const NAV = [
  { href: "/app", label: "Agent", icon: "✦" },
  { href: "/app/orders", label: "Orders", icon: "☰" },
  { href: "/app/suppliers", label: "Suppliers", icon: "⌂" },
  { href: "/app/settings", label: "Settings", icon: "⚙" },
];

export default function AppLayout({ children }: { children: ReactNode }) {
  const { ready, mode, user, setMode } = useApp();
  const { address } = useAccount();
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    if (ready && mode === "live" && !user) router.replace("/login");
  }, [ready, mode, user, router]);

  const active = (href: string) => (href === "/app" ? pathname === "/app" : pathname.startsWith(href));

  return (
    <>
      <header className="topbar">
        <Link className="brand" href="/">
          <span className="brand-mark">E</span>
          <span>emporos</span>
        </Link>
        <div className="topbar-right">
          {mode === "demo" ? (
            <span className="badge amber" title="Example suppliers; no real payments">
              <span className="dot" /> Sample
            </span>
          ) : (
            address && <Balances address={address} compact />
          )}
          <ConnectButton accountStatus="avatar" chainStatus="icon" showBalance={false} />
        </div>
      </header>
      <nav className="bottom-nav" aria-label="App">
        {NAV.map((item) => (
          <Link key={item.href} href={item.href} aria-current={active(item.href) ? "page" : undefined}>
            <span className="icon" aria-hidden="true">{item.icon}</span>
            {item.label}
          </Link>
        ))}
      </nav>
      <main className="shell">
        {mode === "demo" && (
          <div className="notice warn" style={{ marginTop: 12 }}>
            <strong>Sample data.</strong> Example suppliers, no real payments.{" "}
            <button
              className="link-btn"
              type="button"
              onClick={() => {
                resetDemo();
                window.location.href = "/app?demo=1";
              }}
            >
              Start over
            </button>
            {" · "}
            <button className="link-btn" type="button" onClick={() => { setMode("live"); router.push("/login"); }}>
              Use my shop
            </button>
          </div>
        )}
        {!ready ? <p className="muted" style={{ marginTop: 24 }}>Loading…</p> : children}
      </main>
    </>
  );
}
