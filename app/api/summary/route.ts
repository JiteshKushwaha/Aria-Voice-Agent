import { NextResponse, type NextRequest } from "next/server";
import { getStore } from "@/lib/db";
import { chatCompletion, llmConfigured } from "@/lib/llm";
import { clientIp, rateLimit } from "@/lib/ratelimit";
import { coerceOutcome, fallbackOutcome, SUMMARY_INSTRUCTION } from "@/lib/summary";
import type { CallOutcome, CallRecord, ChatMessage, ToolEvent, TranscriptEntry } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 30;
export const dynamic = "force-dynamic";

const arr = <T,>(v: unknown, max: number): T[] => (Array.isArray(v) ? (v.slice(0, max) as T[]) : []);

export async function POST(req: NextRequest) {
  if (!rateLimit(`sum:${clientIp(req)}`, 10, 60_000)) return NextResponse.json({ error: "RATE_LIMITED" }, { status: 429 });
  let b: Record<string, unknown> = {};
  try { b = (await req.json()) as Record<string, unknown>; } catch { /* empty */ }

  const messages = arr<ChatMessage>(b.messages, 200)
    .filter((m) => m && (m.role === "user" || m.role === "assistant") && typeof m.content === "string")
    .map((m) => ({ role: m.role, content: m.content.slice(0, 600) }));
  const toolEvents = arr<ToolEvent>(b.toolEvents, 50).filter((e) => e && typeof e.name === "string")
    .map((e) => ({ name: e.name, args: (e.args && typeof e.args === "object" ? e.args : {}) as Record<string, unknown>, result: e.result, at: String(e.at ?? "") }));
  const transcript = arr<TranscriptEntry>(b.transcript, 400);
  const id = typeof b.callId === "string" && /^[a-zA-Z0-9-]{8,64}$/.test(b.callId) ? b.callId : crypto.randomUUID();

  const fb = fallbackOutcome(messages, toolEvents);
  let outcome: CallOutcome = fb;
  if (llmConfigured() && fb.duration_turns > 0) {
    try {
      const callText = messages.map((m) => `${m.role === "user" ? "Customer" : "Agent"}: ${m.content}`).join("\n")
        + `\nTools: ${JSON.stringify(toolEvents.map((e) => ({ name: e.name, args: e.args, result: e.result }))).slice(0, 6000)}`;
      const msg = await chatCompletion({
        messages: [{ role: "system", content: SUMMARY_INSTRUCTION }, { role: "user", content: callText }],
        temperature: 0, maxTokens: 300, json: true
      });
      outcome = coerceOutcome(JSON.parse(msg.content ?? "{}"), fb);
    } catch (e) {
      console.warn("[summary] using fallback", e);
    }
  }

  const record: CallRecord = {
    id,
    createdAt: new Date().toISOString(),
    durationSeconds: Math.max(0, Math.min(36000, Math.round(Number(b.durationSeconds) || 0))),
    voiceMode: typeof b.voiceMode === "string" ? b.voiceMode.slice(0, 20) : "",
    userAgent: (req.headers.get("user-agent") || "").slice(0, 300),
    outcome, transcript, messages, toolEvents,
    hasRecording: false, recordingMime: null, recordingBytes: 0
  };
  let saved = true;
  try { await getStore().saveCall(record); } catch (e) { saved = false; console.error("[summary] save failed", e); }
  return NextResponse.json({ id, outcome, saved });
}