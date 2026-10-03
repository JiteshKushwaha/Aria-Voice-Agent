// Shared types used by both server routes and client components.
// This file must stay free of Node-only imports.

export type ChatRole = "user" | "assistant";

export interface ChatMessage {
  role: ChatRole;
  content: string;
}

export interface ToolEvent {
  name: string;
  args: Record<string, unknown>;
  result: unknown;
  at: string;
}

export type TranscriptKind = "user" | "assistant" | "tool";

export interface TranscriptEntry {
  id: string;
  kind: TranscriptKind;
  text: string;
  at: string;
  unclear?: boolean;
  tool?: ToolEvent;
}

export const INTENTS = [
  "ORDER_TRACKING",
  "ORDER_CANCELLATION",
  "RETURN_REFUND",
  "DAMAGED_PRODUCT",
  "SHIPPING_QUERY",
  "COD_QUERY",
  "PRODUCT_INFO",
  "POLICY_QUERY",
  "OUT_OF_SCOPE",
  "OTHER"
] as const;
export type CustomerIntent = (typeof INTENTS)[number];

export const RESOLUTIONS = ["RESOLVED", "PARTIALLY_RESOLVED", "UNRESOLVED", "ABANDONED"] as const;
export type ResolutionStatus = (typeof RESOLUTIONS)[number];

export interface CallOutcome {
  customer_intent: CustomerIntent;
  order_id: string | null;
  resolution_status: ResolutionStatus;
  call_summary: string;
  tools_used: string[];
  duration_turns: number;
}

export interface CallListItem {
  id: string;
  createdAt: string;
  durationSeconds: number;
  voiceMode: string;
  outcome: CallOutcome;
  userAgent: string;
  hasRecording: boolean;
  recordingMime: string | null;
  recordingBytes: number;
}

export interface CallRecord extends CallListItem {
  transcript: TranscriptEntry[];
  messages: ChatMessage[];
  toolEvents: ToolEvent[];
}