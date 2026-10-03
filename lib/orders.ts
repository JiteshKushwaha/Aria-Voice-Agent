/**
 * Mock order database + deterministic policy engine.
 *
 * Every policy decision (cancel / return / damage report / shipping) is computed
 * here in plain code and handed to the LLM as data. The model only phrases the
 * answer; it never decides eligibility on its own.
 *
 * Dates are stored relative ("delivered 14 days ago") so the demo behaves the
 * same on every day it is evaluated.
 */

export type OrderStatus = "Processing" | "Shipped" | "Out for Delivery" | "Delivered" | "Cancelled";

export interface Order {
  id: string;
  customer: string;
  product: string;
  value: number;
  status: OrderStatus;
  courier: string | null;
  trackingId: string | null;
  notes: string;
  expectedDelivery: string | null;
  deliveredDaysAgo: number | null;
  orderedHoursAgo: number | null;
}

export const ORDERS: readonly Order[] = [
  {
    id: "ORD-101",
    customer: "Priya Sharma",
    product: "Vitamin C Serum (30ml)",
    value: 699,
    status: "Out for Delivery",
    courier: "BlueDart",
    trackingId: "BD-982103",
    notes: "BlueDart — BD-982103. Expected by 6 PM today",
    expectedDelivery: "by 6 PM today",
    deliveredDaysAgo: null,
    orderedHoursAgo: null
  },
  {
    id: "ORD-102",
    customer: "Rahul Verma",
    product: "Hydrating Sunscreen SPF 50",
    value: 499,
    status: "Delivered",
    courier: "Delhivery",
    trackingId: "DL-441029",
    notes: "Delhivery — DL-441029. Delivered 14 days ago",
    expectedDelivery: null,
    deliveredDaysAgo: 14,
    orderedHoursAgo: null
  },
  {
    id: "ORD-103",
    customer: "Ananya Patel",
    product: "Green Tea Face Wash + Toner",
    value: 850,
    status: "Processing",
    courier: null,
    trackingId: null,
    notes: "Ordered 3 hours ago. Eligible for cancellation",
    expectedDelivery: null,
    deliveredDaysAgo: null,
    orderedHoursAgo: 3
  }
];

export const RETURN_WINDOW_DAYS = 7;
export const DAMAGE_REPORT_HOURS = 48;
export const FREE_SHIPPING_ABOVE = 499;
export const SHIPPING_FEE = 50;
export const COD_LIMIT = 2500;

export type Allowed = "yes" | "no" | "conditional";
export interface Decision {
  allowed: Allowed;
  reason: string;
}
export interface Eligibility {
  cancel: Decision;
  return: Decision;
  damaged_report: Decision;
  /** allowed = "is delivery free?" yes / no / conditional (= policy does not say). */
  shipping_note: Decision;
}

const WORD_DIGITS: Record<string, string> = {
  zero: "0", oh: "0", o: "0", nought: "0", nil: "0",
  one: "1", two: "2", three: "3", four: "4", five: "5",
  six: "6", seven: "7", eight: "8", nine: "9"
};

/**
 * Converts whatever speech-to-text produced into a canonical "ORD-###".
 * Handles "ORD-101", "ord 101", "ORD101", "order one oh one", "O R D 1 0 2",
 * "order id one zero three", "one double oh". Returns null when no digits.
 * Homophones like "for"/"to" are deliberately NOT mapped to digits: they appear
 * in normal sentences ("status for order 101") and would corrupt the ID.
 */
export function normalizeOrderId(raw: unknown): string | null {
  if (typeof raw !== "string" && typeof raw !== "number") return null;
  let s = String(raw).toLowerCase();
  s = s.replace(/([a-z])(\d)/g, "$1 $2").replace(/(\d)([a-z])/g, "$1 $2");
  // Remove the "ORD" prefix first, otherwise the spoken letter "o" would become a zero.
  s = s.replace(/\bo\s*\.?\s*r\s*\.?\s*d\b\.?/g, " ");
  s = s.replace(/\b(order|orders|number|num|no|id|hash)\b/g, " ");
  s = s.replace(/\bi\s*\.?\s*d\b/g, " ");

  const tokens = s.split(/[^a-z0-9]+/).filter(Boolean);
  let run = "";
  let multiplier = 1;
  for (const tok of tokens) {
    if (tok === "double") { multiplier = 2; continue; }
    if (tok === "triple") { multiplier = 3; continue; }
    const digit = /^\d+$/.test(tok) ? tok : WORD_DIGITS[tok];
    if (digit !== undefined) {
      run += digit.repeat(multiplier);
      multiplier = 1;
      continue;
    }
    multiplier = 1;
    if (run) break; // the first contiguous run of digits is the ID
  }
  return run ? `ORD-${run}` : null;
}

function withOverlay(order: Order, cancelled: ReadonlySet<string>): Order {
  return cancelled.has(order.id) ? { ...order, status: "Cancelled" } : { ...order };
}

export function findOrder(id: string, cancelled: ReadonlySet<string> = new Set()): Order | null {
  const base = ORDERS.find((o) => o.id === id);
  return base ? withOverlay(base, cancelled) : null;
}

export function computeEligibility(order: Order): Eligibility {
  let cancel: Decision;
  switch (order.status) {
    case "Processing":
      cancel = { allowed: "yes", reason: "Order is still Processing, so it can be cancelled once the customer confirms." };
      break;
    case "Cancelled":
      cancel = { allowed: "no", reason: "This order has already been cancelled." };
      break;
    case "Shipped":
    case "Out for Delivery":
      cancel = { allowed: "no", reason: `Order is ${order.status}, so it cannot be cancelled. The customer may refuse delivery at the doorstep.` };
      break;
    default:
      cancel = { allowed: "no", reason: "Order has already been delivered, so it cannot be cancelled." };
  }

  let ret: Decision;
  if (order.status === "Delivered" && order.deliveredDaysAgo !== null) {
    ret = order.deliveredDaysAgo <= RETURN_WINDOW_DAYS
      ? { allowed: "conditional", reason: `Delivered ${order.deliveredDaysAgo} days ago, within the ${RETURN_WINDOW_DAYS}-day window. Customer must confirm the product is unopened, unused and in original packaging.` }
      : { allowed: "no", reason: `Delivered ${order.deliveredDaysAgo} days ago, which is outside the ${RETURN_WINDOW_DAYS}-day return window.` };
  } else if (order.status === "Cancelled") {
    ret = { allowed: "no", reason: "Order was cancelled, so there is nothing to return." };
  } else {
    ret = { allowed: "no", reason: `Order is ${order.status} and has not been delivered yet. Returns apply within ${RETURN_WINDOW_DAYS} days after delivery.` };
  }

  let damaged: Decision;
  if (order.status === "Delivered" && order.deliveredDaysAgo !== null) {
    damaged = order.deliveredDaysAgo * 24 <= DAMAGE_REPORT_HOURS
      ? { allowed: "conditional", reason: `Within ${DAMAGE_REPORT_HOURS} hours of delivery. Eligible for replacement if reported with photos.` }
      : { allowed: "no", reason: `Delivered ${order.deliveredDaysAgo} days ago, beyond the ${DAMAGE_REPORT_HOURS}-hour damage reporting window.` };
  } else {
    damaged = { allowed: "no", reason: `Not delivered yet. Damaged or defective items can be reported within ${DAMAGE_REPORT_HOURS} hours of delivery with photos.` };
  }

  let shipping: Decision;
  if (order.value > FREE_SHIPPING_ABOVE) {
    shipping = { allowed: "yes", reason: `Order value ₹${order.value} is above ₹${FREE_SHIPPING_ABOVE}, so delivery is free.` };
  } else if (order.value < FREE_SHIPPING_ABOVE) {
    shipping = { allowed: "no", reason: `Order value ₹${order.value} is below ₹${FREE_SHIPPING_ABOVE}, so a ₹${SHIPPING_FEE} shipping fee applies.` };
  } else {
    shipping = { allowed: "conditional", reason: `Order value is exactly ₹${FREE_SHIPPING_ABOVE}. Policy covers above ₹${FREE_SHIPPING_ABOVE} (free) and below ₹${FREE_SHIPPING_ABOVE} (₹${SHIPPING_FEE}); exactly ₹${FREE_SHIPPING_ABOVE} is not specified, so do not confirm either way.` };
  }

  return { cancel, return: ret, damaged_report: damaged, shipping_note: shipping };
}

export type OrderLookup =
  | { found: true; order: Order; eligibility: Eligibility }
  | { found: false; error: "MISSING_ORDER_ID" | "NOT_FOUND"; heard: string | null; message: string };

export function getOrderDetails(rawId: unknown, cancelled: ReadonlySet<string> = new Set()): OrderLookup {
  const id = normalizeOrderId(rawId);
  if (!id) {
    return { found: false, error: "MISSING_ORDER_ID", heard: null, message: "No order ID was provided. Ask the customer for their order ID (ORD followed by three digits)." };
  }
  const order = findOrder(id, cancelled);
  if (!order) {
    return { found: false, error: "NOT_FOUND", heard: id, message: `No order matches ${id}. Ask the customer to repeat or verify the ID (ORD followed by three digits).` };
  }
  return { found: true, order, eligibility: computeEligibility(order) };
}

export type CancelResult =
  | { success: true; order_id: string; status: "Cancelled"; message: string }
  | { success: false; error: "MISSING_ORDER_ID" | "NOT_FOUND" | "NOT_ELIGIBLE" | "NOT_CONFIRMED"; order_id?: string; message: string };

/**
 * Cancels an order for this call session only. `cancelled` is mutated on success.
 * Checks run in this order on purpose: existence → eligibility → confirmation,
 * so Aria never asks the customer to confirm something that cannot happen.
 */
export function cancelOrder(rawId: unknown, confirmed: boolean, cancelled: Set<string>): CancelResult {
  const id = normalizeOrderId(rawId);
  if (!id) return { success: false, error: "MISSING_ORDER_ID", message: "No order ID was provided." };
  const order = findOrder(id, cancelled);
  if (!order) return { success: false, error: "NOT_FOUND", order_id: id, message: `No order matches ${id}.` };
  const eligibility = computeEligibility(order);
  if (eligibility.cancel.allowed !== "yes") {
    return { success: false, error: "NOT_ELIGIBLE", order_id: id, message: eligibility.cancel.reason };
  }
  if (confirmed !== true) {
    return { success: false, error: "NOT_CONFIRMED", order_id: id, message: "The customer has not clearly confirmed. Ask: Shall I go ahead and cancel it?" };
  }
  cancelled.add(id);
  return { success: true, order_id: id, status: "Cancelled", message: `${id} has been cancelled. Do not state any refund timeline.` };
}