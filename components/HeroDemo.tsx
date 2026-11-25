"use client";

import { useEffect, useState } from "react";

// A looping, illustrative run of the agent using the demo catalog's numbers.
const REQUEST = "50 bags of rice, under ₦2m, Lagos, 5 days";
const FIELDS = ["50 × rice", "≤ ₦2,000,000", "Lagos", "5 days"];
const QUOTES = [
  { name: "Ada Grains", total: "₦1,840,000", meta: "2 days · 120 in stock", best: true },
  { name: "Okon Wholesale", total: "₦1,830,000", meta: "4 days · 60 in stock", best: false },
  { name: "Sahel Foods", total: "₦1,690,000", meta: "7 days · misses deadline", best: false, out: true },
];

type Phase = "typing" | "parsed" | "quotes" | "paying" | "paid";
const TIMING: Record<Exclude<Phase, "typing">, number> = { parsed: 900, quotes: 1500, paying: 2200, paid: 1600 };

export function HeroDemo() {
  const [typed, setTyped] = useState(0);
  const [phase, setPhase] = useState<Phase>("typing");
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduced(media.matches);
    if (media.matches) {
      setTyped(REQUEST.length);
      setPhase("paid");
    }
  }, []);

  useEffect(() => {
    if (reduced) return;
    let timer: ReturnType<typeof setTimeout>;
    if (phase === "typing") {
      timer = typed < REQUEST.length ? setTimeout(() => setTyped(typed + 1), 38) : setTimeout(() => setPhase("parsed"), 350);
    } else {
      const next: Record<Exclude<Phase, "typing">, Phase> = { parsed: "quotes", quotes: "paying", paying: "paid", paid: "typing" };
      timer = setTimeout(() => {
        if (phase === "paid") setTyped(0);
        setPhase(next[phase]);
      }, TIMING[phase]);
    }
    return () => clearTimeout(timer);
  }, [phase, typed, reduced]);

  const step = ["typing", "parsed", "quotes", "paying", "paid"].indexOf(phase);

  return (
    <div className="demo-card" aria-label="Example: the agent buying 50 bags of rice" role="img">
      <div className="demo-bar">
        <span className="demo-dot" /> Agent
        <span className="demo-step">{["Listening", "Understood", "Comparing", "Paying", "Paid"][step]}</span>
      </div>

      <div className="demo-input">
        {REQUEST.slice(0, typed)}
        {phase === "typing" && <span className="caret" />}
      </div>

      <div className="demo-chips">
        {FIELDS.map((field, i) => (
          <span key={field} className={`demo-chip ${step >= 1 ? "in" : ""}`} style={{ transitionDelay: `${i * 90}ms` }}>
            {field}
          </span>
        ))}
      </div>

      <ul className="demo-quotes">
        {QUOTES.map((quote, i) => (
          <li
            key={quote.name}
            className={`demo-quote ${step >= 2 ? "in" : ""} ${step >= 2 && quote.best ? "best" : ""} ${quote.out ? "out" : ""}`}
            style={{ transitionDelay: `${i * 140}ms` }}
          >
            <div>
              <strong>{quote.name}</strong>
              <span>{quote.meta}</span>
            </div>
            <b>{quote.total}</b>
          </li>
        ))}
      </ul>

      <div className={`demo-pay ${step >= 3 ? "in" : ""}`}>
        <div className="demo-progress">
          <span style={{ width: step >= 4 ? "100%" : step >= 3 ? "70%" : "0%" }} />
        </div>
        <div className="demo-pay-row">
          <span>{step >= 4 ? "✓ Paid in cNGN, within your rules" : "Swapping USD₮ → cNGN…"}</span>
          <b>₦1,840,000</b>
        </div>
      </div>
    </div>
  );
}
