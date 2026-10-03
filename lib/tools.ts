import { cancelOrder, getOrderDetails } from "./orders";

// OpenAI-compatible tool definitions.
export const TOOL_DEFS = [
  {
    type: "function" as const,
    function: {
      name: "get_order_details",
      description: "Look up a customer's order by ID. Returns status, courier, tracking, expected delivery and policy eligibility computed by the system.",
      parameters: {
        type: "object",
        properties: { order_id: { type: "string", description: "Order ID as heard, e.g. 'ORD-101' or 'order one oh one'." } },
        required: ["order_id"]
      }
    }
  },
  {
    type: "function" as const,
    function: {
      name: "cancel_order",
      description: "Cancel an order. Only call after get_order_details shows cancel eligibility 'yes' AND the customer explicitly said yes to cancelling.",
      parameters: {
        type: "object",
        properties: {
          order_id: { type: "string", description: "Order ID to cancel." },
          customer_confirmed: { type: "boolean", description: "True only if the customer explicitly confirmed cancellation in their latest message." }
        },
        required: ["order_id", "customer_confirmed"]
      }
    }
  }
];

/** Llama sometimes emits invalid JSON or a bare string; never throw. */
export function parseArgs(raw: unknown): Record<string, unknown> {
  if (raw && typeof raw === "object") return raw as Record<string, unknown>;
  if (typeof raw !== "string" || !raw.trim()) return {};
  try {
    const v = JSON.parse(raw);
    return v && typeof v === "object" ? (v as Record<string, unknown>) : { order_id: String(v) };
  } catch {
    const m = raw.match(/ord[\s-]*\d+/i);
    return m ? { order_id: m[0] } : {};
  }
}

export function executeTool(name: string, args: Record<string, unknown>, cancelled: Set<string>): unknown {
  if (name === "get_order_details") {
    const r = getOrderDetails(args.order_id as string, cancelled);
    if (!r.found) return r;
    const o = r.order!;
    // Only the fields Aria needs; internal "notes" are excluded so they are not read out.
    return {
      found: true,
      order: {
        id: o.id, customer: o.customer, product: o.product, value_inr: o.value, status: o.status,
        courier: o.courier, tracking_id: o.trackingId, expected_delivery: o.expectedDelivery,
        delivered_days_ago: o.deliveredDaysAgo, ordered_hours_ago: o.orderedHoursAgo
      },
      eligibility: r.eligibility
    };
  }
  if (name === "cancel_order") {
    const confirmed = args.customer_confirmed === true || args.customer_confirmed === "true";
    return cancelOrder(args.order_id as string, confirmed, cancelled);
  }
  return { error: "UNKNOWN_TOOL", message: `No tool named ${name}.` };
}