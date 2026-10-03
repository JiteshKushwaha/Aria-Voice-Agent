import { ORDERS } from "@/lib/orders";

const TRY = [
  "Where is my order ORD-101?",
  "I bought this 20 days ago and opened it. Can I return it?",
  "Please cancel ORD-103.",
  "Can I return ORD-102?",
  "Is cash on delivery available?",
  "Can you book me a flight to Goa?",
  "Can you check ORD-999?"
];

const slug = (s: string) => s.toLowerCase().replace(/\s+/g, "-");

export function OrdersPanel({ cancelledOrders }: { cancelledOrders: string[] }) {
  return (
    <section className="panel" aria-labelledby="orders-h">
      <p className="eyebrow">For evaluators</p>
      <h2 id="orders-h" className="panel-title">Test orders</h2>
      <ul className="orders">
        {ORDERS.map((o) => {
          const status = cancelledOrders.includes(o.id) ? "Cancelled" : o.status;
          return (
            <li key={o.id} className="order">
              <div className="order-top">
                <span className="mono">{o.id}</span>
                <span className={`pill pill-${slug(status)}`}>{status}</span>
              </div>
              <p className="order-product">{o.product}</p>
              <p className="order-meta">{o.customer} · ₹{o.value}</p>
              <p className="order-notes">{o.notes}</p>
            </li>
          );
        })}
      </ul>
      <h3 className="try-h">Try saying</h3>
      <ul className="try">{TRY.map((t) => <li key={t}>“{t}”</li>)}</ul>
    </section>
  );
}