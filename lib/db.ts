import { neon } from "@neondatabase/serverless";
import type { CallListItem, CallRecord } from "./types";

/**
 * Call storage. With DATABASE_URL → Postgres (Neon serverless driver over HTTP,
 * works on Vercel functions). Without it → in-memory map so the demo still runs
 * with only LLM_API_KEY (data is lost on cold start; the admin UI says so).
 * Recordings are stored base64 in a TEXT column: simple and fine for short demo
 * calls; at scale they belong in object storage (see README).
 */

interface Store {
  kind: "postgres" | "memory";
  saveCall(rec: CallRecord): Promise<void>;
  listCalls(): Promise<CallListItem[]>;
  getCall(id: string): Promise<CallRecord | null>;
  callExists(id: string): Promise<boolean>;
  saveRecording(id: string, mime: string, data: Buffer): Promise<boolean>;
  getRecording(id: string): Promise<{ mime: string; data: Buffer } | null>;
  deleteCall(id: string): Promise<void>;
}

type Row = Record<string, unknown>;

function rowToItem(r: Row): CallListItem {
  return {
    id: String(r.id),
    createdAt: new Date(r.created_at as string).toISOString(),
    durationSeconds: Number(r.duration_seconds ?? 0),
    voiceMode: String(r.voice_mode ?? ""),
    userAgent: String(r.user_agent ?? ""),
    outcome: r.outcome as CallListItem["outcome"],
    hasRecording: Number(r.recording_bytes ?? 0) > 0,
    recordingMime: (r.recording_mime as string | null) ?? null,
    recordingBytes: Number(r.recording_bytes ?? 0)
  };
}

function postgresStore(url: string): Store {
  const sql = neon(url);
  let ready: Promise<unknown> | null = null;
  const init = () => {
    ready ??= sql`CREATE TABLE IF NOT EXISTS aura_calls (
      id TEXT PRIMARY KEY,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      duration_seconds INT NOT NULL DEFAULT 0,
      voice_mode TEXT,
      user_agent TEXT,
      outcome JSONB,
      transcript JSONB,
      messages JSONB,
      tool_events JSONB,
      recording_mime TEXT,
      recording_b64 TEXT,
      recording_bytes INT NOT NULL DEFAULT 0
    )`.catch((e) => { ready = null; throw e; });
    return ready;
  };
  return {
    kind: "postgres",
    async saveCall(rec) {
      await init();
      await sql`INSERT INTO aura_calls (id, created_at, duration_seconds, voice_mode, user_agent, outcome, transcript, messages, tool_events)
        VALUES (${rec.id}, ${rec.createdAt}, ${rec.durationSeconds}, ${rec.voiceMode}, ${rec.userAgent},
          ${JSON.stringify(rec.outcome)}::jsonb, ${JSON.stringify(rec.transcript)}::jsonb,
          ${JSON.stringify(rec.messages)}::jsonb, ${JSON.stringify(rec.toolEvents)}::jsonb)
        ON CONFLICT (id) DO NOTHING`;
    },
    async listCalls() {
      await init();
      const rows = (await sql`SELECT id, created_at, duration_seconds, voice_mode, user_agent, outcome, recording_mime, recording_bytes
        FROM aura_calls ORDER BY created_at DESC LIMIT 200`) as unknown as Row[];
      return rows.map(rowToItem);
    },
    async getCall(id) {
      await init();
      const rows = (await sql`SELECT id, created_at, duration_seconds, voice_mode, user_agent, outcome, transcript, messages, tool_events, recording_mime, recording_bytes
        FROM aura_calls WHERE id = ${id}`) as unknown as Row[];
      const r = rows[0];
      if (!r) return null;
      return { ...rowToItem(r), transcript: (r.transcript ?? []) as CallRecord["transcript"], messages: (r.messages ?? []) as CallRecord["messages"], toolEvents: (r.tool_events ?? []) as CallRecord["toolEvents"] };
    },
    async callExists(id) {
      await init();
      const rows = (await sql`SELECT 1 FROM aura_calls WHERE id = ${id}`) as unknown as Row[];
      return rows.length > 0;
    },
    async saveRecording(id, mime, data) {
      await init();
      const rows = (await sql`UPDATE aura_calls SET recording_mime = ${mime}, recording_b64 = ${data.toString("base64")}, recording_bytes = ${data.length}
        WHERE id = ${id} AND recording_b64 IS NULL RETURNING id`) as unknown as Row[];
      return rows.length > 0;
    },
    async getRecording(id) {
      await init();
      const rows = (await sql`SELECT recording_mime, recording_b64 FROM aura_calls WHERE id = ${id}`) as unknown as Row[];
      const r = rows[0];
      if (!r || !r.recording_b64) return null;
      return { mime: String(r.recording_mime || "audio/webm"), data: Buffer.from(String(r.recording_b64), "base64") };
    },
    async deleteCall(id) {
      await init();
      await sql`DELETE FROM aura_calls WHERE id = ${id}`;
    }
  };
}

interface MemEntry { rec: CallRecord; audio: { mime: string; data: Buffer } | null }

function memoryStore(): Store {
  const g = globalThis as unknown as { __auraCalls?: Map<string, MemEntry> };
  g.__auraCalls ??= new Map();
  const m = g.__auraCalls;
  return {
    kind: "memory",
    async saveCall(rec) { if (!m.has(rec.id)) m.set(rec.id, { rec, audio: null }); },
    async listCalls() {
      return [...m.values()].map(({ rec }) => {
        const { transcript: _t, messages: _m, toolEvents: _e, ...item } = rec;
        return item;
      }).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    },
    async getCall(id) { return m.get(id)?.rec ?? null; },
    async callExists(id) { return m.has(id); },
    async saveRecording(id, mime, data) {
      const e = m.get(id);
      if (!e || e.audio) return false;
      e.audio = { mime, data };
      e.rec = { ...e.rec, hasRecording: true, recordingMime: mime, recordingBytes: data.length };
      return true;
    },
    async getRecording(id) { return m.get(id)?.audio ?? null; },
    async deleteCall(id) { m.delete(id); }
  };
}
let store: Store | null = null;
export function getStore(): Store {
  store ??= process.env.DATABASE_URL ? postgresStore(process.env.DATABASE_URL) : memoryStore();
  return store;
}