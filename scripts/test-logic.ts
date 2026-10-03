import assert from "node:assert/strict";
import { FAQS } from "../lib/knowledge";
import { cancelOrder, computeEligibility, findOrder, getOrderDetails, normalizeOrderId } from "../lib/orders";
import { cleanReply, speechify, splitSentences } from "../lib/speech";
import { coerceOutcome, fallbackOutcome } from "../lib/summary";

let passed = 0;
function test(name: string, fn: () => void) {
  fn();
  passed++;
  console.log(`  ✓ ${name}`);
}

test("normalizeOrderId", () => {
  assert.equal(normalizeOrderId("ORD-101"), "ORD-101");
  assert.equal(normalizeOrderId("ord 101"), "ORD-101");
  assert.equal(normalizeOrderId("ORD101"), "ORD-101");
  assert.equal(normalizeOrderId("order one oh one"), "ORD-101");
  assert.equal(normalizeOrderId("O R D 1 0 2"), "ORD-102");
  assert.equal(normalizeOrderId("order id one zero three"), "ORD-103");
  assert.equal(normalizeOrderId("can you check ord-999"), "ORD-999");
  assert.equal(normalizeOrderId("where is my order"), null);
  assert.equal(normalizeOrderId(""), null);
});

test("lookups", () => {
  const missing = getOrderDetails("");
  assert.equal(missing.found, false);
  if (!missing.found) assert.equal(missing.error, "MISSING_ORDER_ID");
  const nf = getOrderDetails("ORD-999");
  assert.equal(nf.found, false);
  if (!nf.found) assert.equal(nf.error, "NOT_FOUND");
  const ok = getOrderDetails("order one oh one");
  assert.equal(ok.found, true);
  if (ok.found) assert.equal(ok.order.courier, "BlueDart");
});

test("eligibility", () => {
  const e101 = computeEligibility(findOrder("ORD-101")!);
  assert.equal(e101.cancel.allowed, "no");
  assert.match(e101.cancel.reason, /refuse delivery/);
  assert.equal(e101.shipping_note.allowed, "yes");
  const e102 = computeEligibility(findOrder("ORD-102")!);
  assert.equal(e102.return.allowed, "no");
  assert.equal(e102.damaged_report.allowed, "no");
  assert.equal(e102.shipping_note.allowed, "conditional");
  assert.match(e102.shipping_note.reason, /exactly ₹499/);
  const e103 = computeEligibility(findOrder("ORD-103")!);
  assert.equal(e103.cancel.allowed, "yes");
});

test("cancel guardrails", () => {
  const set = new Set<string>();
  const notConfirmed = cancelOrder("ORD-103", false, set);
  assert.equal(notConfirmed.success, false);
  if (!notConfirmed.success) assert.equal(notConfirmed.error, "NOT_CONFIRMED");
  const ineligible = cancelOrder("ORD-101", true, set);
  if (!ineligible.success) assert.equal(ineligible.error, "NOT_ELIGIBLE"); else assert.fail();
  const ok = cancelOrder("order one zero three", true, set);
  assert.equal(ok.success, true);
  assert.ok(set.has("ORD-103"));
  const again = cancelOrder("ORD-103", true, set);
  if (!again.success) assert.equal(again.error, "NOT_ELIGIBLE"); else assert.fail();
  const after = getOrderDetails("ORD-103", set);
  if (after.found) assert.equal(after.order.status, "Cancelled");
  assert.equal(findOrder("ORD-103")!.status, "Processing", "base data is never mutated");
});

test("speechify", () => {
  const s = speechify("Your order ORD-101 for ₹699 via BD-982103, 30ml, SPF 50, COD and UPI.");
  assert.match(s, /order I D 1 0 1/);
  assert.match(s, /699 rupees/);
  assert.match(s, /B D 9 8 2 1 0 3/);
  assert.match(s, /30 millilitres/);
  assert.match(s, /S P F/);
  assert.match(s, /C O D/);
  assert.match(s, /U P I/);
  assert.match(speechify("₹2,500"), /2500 rupees/);
  assert.doesNotMatch(speechify("**bold** text"), /\*/);
});

test("splitSentences", () => {
  assert.deepEqual(splitSentences(""), []);
  const c = splitSentences("Sure. Your order is out for delivery with BlueDart. It should arrive by 6 PM today. Anything else?");
  assert.ok(c[0].length >= 30);
  assert.ok(c.length <= 5);
  assert.equal(c.join(" "), "Sure. Your order is out for delivery with BlueDart. It should arrive by 6 PM today. Anything else?");
  assert.ok(splitSentences("A. B. C. D. E. F. G. H. I. J. K. L. M. N. O. P. Q. R. S. T. U. V. W. X. Y. Z. a b c d e f").length <= 5);
});

test("cleanReply", () => {
  assert.equal(cleanReply('<function=get_order_details>{"order_id":"ORD-101"}</function>Hello **there**'), "Hello there");
  assert.equal(cleanReply("- one\n- two"), "one two");
});

test("summary fallback", () => {
  const fb = fallbackOutcome([{ role: "user", content: "Where is ORD-101?" }], [{ name: "get_order_details", args: { order_id: "ORD-101" }, result: {}, at: "" }]);
  assert.equal(fb.order_id, "ORD-101");
  assert.equal(fb.duration_turns, 1);
  assert.deepEqual(fb.tools_used, ["get_order_details"]);
  const co = coerceOutcome({ customer_intent: "NONSENSE", resolution_status: "RESOLVED", call_summary: "ok" }, fb);
  assert.equal(co.customer_intent, fb.customer_intent);
  assert.equal(co.resolution_status, "RESOLVED");
  assert.equal(fallbackOutcome([], []).resolution_status, "ABANDONED");
});

test("FAQ count", () => {
  assert.equal(FAQS.length, 40);
});
console.log(`\n${passed} test groups passed.`);