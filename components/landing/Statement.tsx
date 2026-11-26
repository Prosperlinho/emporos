"use client";

import { useEffect, useRef, useState } from "react";

const TEXT =
  "Restocking shouldn't mean guesswork. No calling round suppliers, no spreadsheets and no cash runs. Emporos compares every quote, picks the best one and pays in naira, the simplest and safest way to keep your shelves full.";
const WORDS = TEXT.split(" ");
const START_LIT = 2; // "Restocking shouldn't"

/** Dark section: words light up one by one as the statement scrolls through the viewport. */
export function Statement() {
  const ref = useRef<HTMLElement>(null);
  const [lit, setLit] = useState(START_LIT);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setLit(WORDS.length);
      return;
    }
    let frame = 0;
    const update = () => {
      frame = 0;
      const rect = el.getBoundingClientRect();
      const vh = window.innerHeight;
      const p = Math.min(1, Math.max(0, (vh * 0.8 - rect.top) / (rect.height * 0.75)));
      setLit(Math.max(START_LIT, Math.round(START_LIT + p * (WORDS.length - START_LIT))));
    };
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };
    update();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      cancelAnimationFrame(frame);
    };
  }, []);

  return (
    <section ref={ref} className="lx-statement" id="how">
      <div className="lx-blur" aria-hidden="true">
        <span /><span /><span /><span />
      </div>
      <p aria-label={TEXT}>
        {WORDS.map((word, i) => (
          <span key={i} aria-hidden="true" className={i < lit ? "on" : ""}>{word} </span>
        ))}
      </p>
    </section>
  );
}
