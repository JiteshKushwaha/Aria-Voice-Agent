// Minimal OpenAI-compatible chat-completions client using fetch (no SDK).

export interface LlmToolCall {
    id: string;
    type: "function";
    function: { name: string; arguments: string };
  }
  export interface LlmMessage {
    role: "system" | "user" | "assistant" | "tool";
    content: string | null;
    tool_calls?: LlmToolCall[];
    tool_call_id?: string;
  }
  
  export class LlmError extends Error {
    status: number;
    body: string;
    constructor(status: number, body: string) {
      super(`LLM request failed with ${status}`);
      this.status = status;
      this.body = body;
    }
  }
  
  export function llmConfigured(): boolean {
    return Boolean(process.env.LLM_API_KEY);
  }
  
  interface CompletionOptions {
    messages: LlmMessage[];
    tools?: unknown[];
    toolChoice?: "auto" | "none";
    temperature?: number;
    maxTokens?: number;
    json?: boolean;
    timeoutMs?: number;
  }
  
  export async function chatCompletion(opts: CompletionOptions): Promise<LlmMessage> {
    const base = (process.env.LLM_BASE_URL || "https://api.groq.com/openai/v1").replace(/\/+$/, "");
    // const model = process.env.LLM_MODEL || "llama-3.3-70b-versatile";
    const model = process.env.LLM_MODEL || "openai/gpt-oss-20b";
    const body: Record<string, unknown> = {
      model,
      messages: opts.messages,
      temperature: opts.temperature ?? 0.3,
      // max_tokens: opts.maxTokens ?? 220
      max_completion_tokens: opts.maxTokens ?? 220
    };
    if (opts.tools?.length) {
      body.tools = opts.tools;
      body.tool_choice = opts.toolChoice ?? "auto";
    }
    if (opts.json) body.response_format = { type: "json_object" };
  
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), opts.timeoutMs ?? 20000);
    try {
      const res = await fetch(`${base}/chat/completions`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${process.env.LLM_API_KEY}` },
        body: JSON.stringify(body),
        signal: ctrl.signal
      });
      const text = await res.text();
      if (!res.ok) throw new LlmError(res.status, text.slice(0, 2000));
      const data = JSON.parse(text) as { choices?: { message?: LlmMessage }[] };
      const msg = data.choices?.[0]?.message;
      if (!msg) throw new LlmError(502, "No choices in response");
      return msg;
    } finally {
      clearTimeout(timer);
    }
  }
  
  /** Groq returns HTTP 400 "tool_use_failed" when Llama emits a malformed tool call; retry once at temperature 0. */
  export async function chatCompletionWithRetry(opts: CompletionOptions): Promise<LlmMessage> {
    try {
      return await chatCompletion(opts);
    } catch (e) {
      if (e instanceof LlmError && e.status === 400 && e.body.includes("tool_use_failed")) {
        return chatCompletion({ ...opts, temperature: 0 });
      }
      throw e;
    }
}