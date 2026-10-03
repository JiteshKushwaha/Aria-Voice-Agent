import { NextResponse, type NextRequest } from "next/server";
import { SCRIPTED } from "@/lib/knowledge";
import {
  chatCompletionWithRetry,
  llmConfigured,
  type LlmMessage,
} from "@/lib/llm";
import { ORDERS } from "@/lib/orders";
import { SYSTEM_PROMPT } from "@/lib/prompt";
import { clientIp, rateLimit } from "@/lib/ratelimit";
import { cleanReply } from "@/lib/speech";
import { executeTool, parseArgs, TOOL_DEFS } from "@/lib/tools";
import type { ChatMessage, ToolEvent } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 30;
export const dynamic = "force-dynamic";

const MAX_MESSAGES = 24;
const MAX_CHARS = 600;
const MAX_ITERATIONS = 4;

function sanitize(body: unknown): {
  messages: ChatMessage[];
  cancelled: Set<string>;
} {
  const b =
    body && typeof body === "object" ? (body as Record<string, unknown>) : {};

  const raw = Array.isArray(b.messages) ? b.messages : [];

  const messages: ChatMessage[] = raw
    .filter(
      (m): m is ChatMessage =>
        !!m &&
        typeof m === "object" &&
        (m.role === "user" || m.role === "assistant") &&
        typeof m.content === "string",
    )
    .map((m) => ({
      role: m.role,
      content: m.content.slice(0, MAX_CHARS),
    }))
    .filter((m) => m.content.trim().length > 0)
    .slice(-MAX_MESSAGES);

  const known = new Set(ORDERS.map((o) => o.id));

  const cancelled = new Set(
    (Array.isArray(b.cancelledOrders) ? b.cancelledOrders : []).filter(
      (x): x is string => typeof x === "string" && known.has(x),
    ),
  );

  return { messages, cancelled };
}

export async function POST(req: NextRequest) {
  console.log("[chat] REQUEST RECEIVED");

  if (!rateLimit(`chat:${clientIp(req)}`, 40, 60_000)) {
    return NextResponse.json(
      {
        error: "RATE_LIMITED",
        reply: "I'm sorry, could you give me just a moment and try again?",
        toolEvents: [],
        cancelledOrders: [],
      },
      { status: 429 },
    );
  }

  if (!llmConfigured()) {
    return NextResponse.json(
      {
        error: "SERVER_NOT_CONFIGURED",
        reply: SCRIPTED.FALLBACK,
        toolEvents: [],
        cancelledOrders: [],
      },
      { status: 503 },
    );
  }

  let body: unknown;

  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "BAD_JSON" }, { status: 400 });
  }

  const { messages, cancelled } = sanitize(body);

  const lastMessage = messages[messages.length - 1];

  console.log("[chat] USER MESSAGE:", lastMessage?.content);

  if (!messages.length || messages[messages.length - 1].role !== "user") {
    return NextResponse.json({ error: "BAD_REQUEST" }, { status: 400 });
  }

  const convo: LlmMessage[] = [
    {
      role: "system",
      content: SYSTEM_PROMPT,
    },
    ...messages,
  ];

  const toolEvents: ToolEvent[] = [];
  let reply = "";

  try {
    for (let i = 0; i < MAX_ITERATIONS; i++) {
      const last = i === MAX_ITERATIONS - 1;

      const msg = await chatCompletionWithRetry({
        messages: convo,
        tools: TOOL_DEFS,
        toolChoice: last ? "none" : "auto",
        temperature: 0.3,
        maxTokens: 220,
      });

      if (msg.tool_calls?.length && !last) {
        convo.push({
          role: "assistant",
          content: msg.content ?? "",
          tool_calls: msg.tool_calls,
        });

        for (const call of msg.tool_calls) {
          const args = parseArgs(call.function?.arguments);

          const result = executeTool(
            call.function?.name ?? "",
            args,
            cancelled,
          );

          toolEvents.push({
            name: call.function?.name ?? "unknown",
            args,
            result,
            at: new Date().toISOString(),
          });

          convo.push({
            role: "tool",
            tool_call_id: call.id,
            content: JSON.stringify(result),
          });
        }

        continue;
      }

      reply = cleanReply(msg.content ?? "");
      break;
    }
  } catch (e) {
    console.error("[chat] LLM failure:", e);

    const detail = e instanceof Error ? e.message : "Unknown LLM error";

    console.error("[chat] LLM error details:", e);

    return NextResponse.json(
      {
        error: "LLM_REQUEST_FAILED",
        detail,
        reply:
          "I'm sorry, I'm having a little trouble on my side. Please try again.",
        toolEvents,
        cancelledOrders: [...cancelled],
      },
      { status: 502 },
    );
  }

  return NextResponse.json({
    reply: reply || SCRIPTED.FALLBACK,
    toolEvents,
    cancelledOrders: [...cancelled],
  });
}
