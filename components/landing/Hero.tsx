"use client";

import { LogoMark } from "@/components/Logo.tsx";
import Link from "next/link";
import { useEffect, useRef } from "react";

const clamp = (v: number) => Math.min(1, Math.max(0, v));
const ease = (t: number) => 1 - Math.pow(1 - t, 3); // smooth, never fast
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/**
 * Pinned scroll scene (~2 viewports). The Emporos device turns to show its finned edge,
 * then splits into the shop's phone and the supplier's payment terminal while the
 * wordmark fades and the product name arrives.
 */
export function Hero() {
  const root = useRef<HTMLElement>(null);

  useEffect(() => {
    const el = root.current;
    if (!el) return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let frame = 0;

    const apply = (p: number) => {
      const stage = el.querySelector<HTMLElement>(".lx-stage");
      if (!stage) return;
      const w = stage.clientWidth;
      const h = stage.clientHeight;
      const mobile = w < 720;
      const turn = ease(clamp(p / 0.38));
      const split = ease(clamp((p - 0.32) / 0.38));
      const words = clamp((p - 0.45) / 0.3);
      const name = ease(clamp((p - 0.68) / 0.22));

      const phoneX = lerp(0, mobile ? -w * 0.16 : -w * 0.13, split);
      const phoneY = lerp(0, mobile ? -h * 0.14 : -h * 0.07, split);
      const phoneRy = lerp(lerp(0, 68, turn), 22, split);
      const phoneRx = lerp(0, 8, turn) * (1 - split * 0.4);
      const phoneRz = lerp(0, -9, split);
      const phoneScale = lerp(1, mobile ? 0.74 : 0.88, split);

      const termX = lerp(0, mobile ? w * 0.18 : w * 0.17, split);
      const termY = lerp(h * 0.04, mobile ? h * 0.1 : h * 0.06, split);
      const termRy = lerp(-70, -20, split);
      const termRz = lerp(0, 7, split);
      const termScale = lerp(0.55, mobile ? 0.7 : 0.92, split);

      el.style.setProperty("--phone", `translate3d(${phoneX}px, ${phoneY}px, 0) rotateY(${phoneRy}deg) rotateX(${phoneRx}deg) rotateZ(${phoneRz}deg) scale(${phoneScale})`);
      el.style.setProperty("--term", `translate3d(${termX}px, ${termY}px, -40px) rotateY(${termRy}deg) rotateZ(${termRz}deg) scale(${termScale})`);
      el.style.setProperty("--term-o", String(clamp(split * 1.6)));
      el.style.setProperty("--word-o", String(1 - words));
      el.style.setProperty("--word-y", `${words * -24}px`);
      el.style.setProperty("--name-o", String(name));
      el.style.setProperty("--name-y", `${(1 - name) * 28}px`);
      el.style.setProperty("--shadow", String(1 - split * 0.5));
    };

    if (reduced) {
      el.classList.add("lx-static");
      apply(1);
      return;
    }

    const update = () => {
      frame = 0;
      const rect = el.getBoundingClientRect();
      const travel = el.offsetHeight - window.innerHeight;
      apply(travel > 0 ? clamp(-rect.top / travel) : 1);
    };
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };
    update();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      cancelAnimationFrame(frame);
    };
  }, []);

  return (
    <section ref={root} className="lx-hero" aria-label="Emporos">
      <div className="lx-pin">
        <nav className="lx-nav" aria-label="Main">
          <Link href="/" className="lx-logo" aria-label="Emporos home">
            <LogoMark size={30} title="Emporos" />
          </Link>
          <div className="lx-glass">
            <a href="#how">Shops</a>
            <Link href="/supplier">Suppliers</Link>
            <Link href="/agents">Agents</Link>
          </div>
          <div className="lx-nav-right">
            <Link href="/login" className="lx-link">Sign in</Link>
            <Link href="/login" className="lx-pill lx-pill-sm">Get started</Link>
          </div>
        </nav>

        <h1 className="lx-wordmark" aria-hidden="true">emporos</h1>

        <div className="lx-stage">
          <div className="lx-floor" />
          <div className="lx-scene">
            <div className="lx-device lx-terminal" aria-hidden="true">
              <div className="lx-term-face">
                <div className="lx-fins">{Array.from({ length: 9 }, (_, i) => <span key={i} />)}</div>
                <div className="lx-coins">
                  <span>₦</span>
                  <span>cNGN</span>
                </div>
                <div className="lx-term-paid">
                  <small>Paid · Celo</small>
                  <b>₦1,840,000</b>
                </div>
              </div>
            </div>

            <div className="lx-device lx-phone" aria-hidden="true">
              <div className="lx-phone-front">
                <div className="lx-screen">
                  <div className="lx-scr-top"><span className="lx-scr-dot" /> Agent</div>
                  <div className="lx-scr-input">50 bags of rice, under ₦2m, Lagos, 5 days</div>
                  <div className="lx-scr-chips"><span>50 × rice</span><span>≤ ₦2m</span><span>Lagos</span><span>5 days</span></div>
                  <div className="lx-scr-row best"><span>Ada Grains<small>2 days · 120 in stock</small></span><b>₦1.84m</b></div>
                  <div className="lx-scr-row"><span>Okon Wholesale<small>4 days · 60 in stock</small></span><b>₦1.83m</b></div>
                  <div className="lx-scr-pay">Pay ₦1,840,000</div>
                </div>
              </div>
              <div className="lx-phone-side">{Array.from({ length: 14 }, (_, i) => <span key={i} />)}</div>
            </div>
          </div>
        </div>

        <div className="lx-name">
          <h2>Emporos <span>Agent</span></h2>
          <p>The restocking agent that buys right<br />and pays suppliers in naira</p>
          <Link href="/login" className="lx-pill">Get started</Link>
          <Link href="/app?demo=1" className="lx-ghost">Try with sample data</Link>
        </div>
      </div>
    </section>
  );
}
