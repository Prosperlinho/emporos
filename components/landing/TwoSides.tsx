"use client";

import { useRef, useState } from "react";

// Drop your own photos in public/photos/ with these names and they appear automatically.
// Until then each card shows a soft gradient scene with its caption.
const CARDS = [
  { photo: "/photos/shop.jpg", tone: "dusk", title: "Corner shops", text: "Restock before market day without leaving the counter." },
  { photo: "/photos/wholesale.jpg", tone: "warm", title: "Wholesalers", text: "List stock and prices once. Get paid in cNGN on approval." },
  { photo: "/photos/kitchen.jpg", tone: "light", title: "Kitchens & cafés", text: "Set a weekly cap. The agent handles the rest." },
  { photo: "/photos/market.jpg", tone: "slate", title: "Market stalls", text: "Order by message, compare in seconds, pay from your phone." },
];

const FEATURES = [
  { n: "01", title: ["Understands", "how you talk."], text: "Type a request the way you'd text a supplier: item, quantity, budget, place and deadline. The agent fills in the rest." },
  { n: "02", title: ["Best quote.", "Every time."], text: "Live supplier quotes ranked on price, delivery time and stock, with the reasons it picked one written out for you." },
  { n: "03", title: ["Paid in naira,", "within your limits."], text: "cNGN on Celo, inside the caps you set. Anything over them waits for your one tap, and every payment has a receipt." },
];

function Card({ card }: { card: (typeof CARDS)[number] }) {
  const [photo, setPhoto] = useState(true);
  return (
    <figure className={`lx-card tone-${card.tone}`}>
      {photo && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={card.photo} alt="" loading="lazy" draggable={false} onError={() => setPhoto(false)} />
      )}
      <figcaption>
        <b>{card.title}</b>
        <span>{card.text}</span>
      </figcaption>
    </figure>
  );
}

export function TwoSides() {
  const track = useRef<HTMLDivElement>(null);
  const drag = useRef<{ x: number; left: number; moved: boolean } | null>(null);

  return (
    <section className="lx-two">
      <header>
        <h2>One agent, two sides.</h2>
        <p>A buying agent that works for the shop. A storefront that works for the supplier. Both settle in cNGN, the moment an order is approved.</p>
      </header>

      <div
        ref={track}
        className="lx-track"
        onPointerDown={(e) => {
          if (e.pointerType !== "mouse" || !track.current) return;
          drag.current = { x: e.clientX, left: track.current.scrollLeft, moved: false };
          track.current.classList.add("dragging");
        }}
        onPointerMove={(e) => {
          if (!drag.current || !track.current) return;
          const dx = e.clientX - drag.current.x;
          if (Math.abs(dx) > 3) drag.current.moved = true;
          track.current.scrollLeft = drag.current.left - dx;
        }}
        onPointerUp={() => {
          drag.current = null;
          track.current?.classList.remove("dragging");
        }}
        onPointerLeave={() => {
          drag.current = null;
          track.current?.classList.remove("dragging");
        }}
      >
        {CARDS.map((card) => <Card key={card.title} card={card} />)}
      </div>
      <div className="lx-hint"><span>Scroll or drag to view more</span></div>

      <div className="lx-features">
        {FEATURES.map((f) => (
          <div key={f.n} className="lx-feature">
            <span className="lx-num">{f.n}</span>
            <h3>{f.title[0]}<br />{f.title[1]}</h3>
            <p>{f.text}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
