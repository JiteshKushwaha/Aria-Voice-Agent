import { normalizeOrderId } from "./orders";
import {
  INTENTS, RESOLUTIONS, type CallOutcome, type ChatMessage, type CustomerIntent, type ResolutionStatus, type ToolEvent
} from "./types";

export const SUMMARY_INSTRUCTION = `You analyse a finished customer support call for Aura Skincare. Return ONLY a JSON object with exactly these keys:
"customer_intent": one of ${INTENTS.join(", ")} (the main reason for the call),
"order_id": the main order ID like "ORD-101" or null,
"resolution_status": one of ${RESOLUTIONS.join(", ")} (RESOLVED = question answered or action done, even if the answer was a policy refusal; PARTIALLY_RESOLVED = some needs unanswered; UNRESOLVED = could not help; ABANDONED = customer left before stating a need),
"call_summary": one or two plain factual sentences in English, third person,
"tools_used": array of tool names used,
"duration_turns": number of customer turns.
Do not invent facts not present in the call.`;

function guessIntent(text: string, tools: string[]): CustomerIntent {
  const t = text.toLowerCase();
  if (tools.includes("cancel_order") || /\bcancel/.test(t)) return "ORDER_CANCELLATION";
  if (/damag|defect|broken|leak/.test(t)) return "DAMAGED_PRODUCT";
  if (/return|refund/.test(t)) return "RETURN_REFUND";
  if (/\bcod\b|cash on delivery|upi|pay/.test(t)) return "COD_QUERY";
  if (/where|track|status|deliver(y|ed)? (by|today)|arriv/.test(t) || tools.includes("get_order_details")) return "ORDER_TRACKING";
  if (/ship|delivery|deliver/.test(t)) return "SHIPPING_QUERY";
  if (/serum|sunscreen|face wash|toner|product|organic|ingredient/.test(t)) return "PRODUCT_INFO";
  if (/flight|book|weather|cricket|politic|code/.test(t)) return "OUT_OF_SCOPE";
  if (/policy|exchange|offer|discount/.test(t)) return "POLICY_QUERY";
  return "OTHER";
}

export function extractOrderId(messages: ChatMessage[], toolEvents: ToolEvent[]): string | null {
  for (const e of toolEvents) {
    const id = normalizeOrderId(e.args.order_id);
    if (id) return id;
  }
  for (const m of messages) {
    if (m.role !== "user") continue;
    const match = m.content.match(/\bord[\s-]?\d{2,4}\b/i);
    if (match) return normalizeOrderId(match[0]);
  }
  return null;
}

/** Deterministic outcome used when the LLM is unavailable or returns junk. */
export function fallbackOutcome(messages: ChatMessage[], toolEvents: ToolEvent[]): CallOutcome {
  const userText = messages.filter((m) => m.role === "user").map((m) => m.content).join(" ");
  const turns = messages.filter((m) => m.role === "user").length;
  const tools = Array.from(new Set(toolEvents.map((e) => e.name)));
  const resolution: ResolutionStatus = turns === 0 ? "ABANDONED" : toolEvents.length ? "RESOLVED" : "PARTIALLY_RESOLVED";
  return {
    customer_intent: turns === 0 ? "OTHER" : guessIntent(userText, tools),
    order_id: extractOrderId(messages, toolEvents),
    resolution_status: resolution,
    call_summary: turns === 0
      ? "The customer ended the call before stating a query."
      : `Customer said: "${userText.slice(0, 160)}". Automatic summary unavailable.`,
    tools_used: tools,
    duration_turns: turns
  };
}

/** Validates model JSON; facts we know deterministically (tools, turns) always override. */
export function coerceOutcome(raw: unknown, fb: CallOutcome): CallOutcome {
  const o = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const intent = INTENTS.includes(o.customer_intent as CustomerIntent) ? (o.customer_intent as CustomerIntent) : fb.customer_intent;
  const res = RESOLUTIONS.includes(o.resolution_status as ResolutionStatus) ? (o.resolution_status as ResolutionStatus) : fb.resolution_status;
  const orderId = typeof o.order_id === "string" ? normalizeOrderId(o.order_id) ?? fb.order_id : fb.order_id;
  const summary = typeof o.call_summary === "string" && o.call_summary.trim() ? o.call_summary.trim().slice(0, 600) : fb.call_summary;
  return {
    customer_intent: fb.duration_turns === 0 ? "OTHER" : intent,
    order_id: orderId,
    resolution_status: fb.duration_turns === 0 ? "ABANDONED" : res,
    call_summary: summary,
    tools_used: fb.tools_used,
    duration_turns: fb.duration_turns
  };
}