"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useApp } from "@/components/AppContext.tsx";
import { Empty, errorText, OrderTimeline, StatusBadge, TxLink } from "@/components/ui.tsx";
import { formatNaira } from "@/lib/money.ts";
import type { Order } from "@/lib/types.ts";

export default function OrdersPage() {
  const { store, business } = useApp();
  const [orders, setOrders] = useState<Order[] | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!business) return;
    store.listOrders().then(setOrders, (e) => setError(errorText(e)));
  }, [store, business]);

  return (
    <>
      <section className="page-head">
        <h1>Orders</h1>
        
      </section>
      {error && <div className="notice error">{error}</div>}
      {!business ? (
        <Empty action={{ href: "/app/settings", label: "Set up business" }}>Set up your business first.</Empty>
      ) : orders === null ? (
        <p className="muted">Loading…</p>
      ) : orders.length === 0 ? (
        <Empty action={{ href: "/app", label: "Ask the agent" }}>No orders yet.</Empty>
      ) : (
        <ul className="list" style={{ marginTop: 14 }}>
          {orders.map((order) => (
            <li key={order.id} className="item">
              <Link href={`/app/orders/${order.id}`} style={{ display: "block", color: "inherit", textDecoration: "none" }}>
                <div className="row between">
                  <span className="item-title">{order.request.quantity} × {order.request.item}</span>
                  <strong>{formatNaira(order.amount)}</strong>
                </div>
                <div className="row between small muted" style={{ marginTop: 4 }}>
                  <span>{order.chosen.supplierName} · {new Date(order.createdAt).toLocaleDateString("en-NG", { day: "numeric", month: "short" })}</span>
                  <StatusBadge status={order.status} />
                </div>
                <OrderTimeline status={order.status} />
                {order.fx && <div className="small muted">FX 1 USD₮ = {order.fx.rate} cNGN ({order.fx.provider})</div>}
              </Link>
              {order.paymentTxHash && (
                <div className="small">
                  Tx: <TxLink hash={order.paymentTxHash} simulated={order.simulated} />
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
