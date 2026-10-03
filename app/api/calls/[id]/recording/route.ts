import { NextResponse, type NextRequest } from "next/server";
import { getStore } from "@/lib/db";
import { clientIp, rateLimit } from "@/lib/ratelimit";

export const runtime = "nodejs";
export const maxDuration = 30;
export const dynamic = "force-dynamic";

// Vercel caps request bodies at about 4.5 MB; demo calls are much smaller.
const MAX_BYTES = 4_000_000;

/** Upload-once endpoint: only for a call that exists and has no recording yet. */
export async function PUT(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  if (!rateLimit(`rec:${clientIp(req)}`, 6, 60_000)) return NextResponse.json({ error: "RATE_LIMITED" }, { status: 429 });
  const { id } = await ctx.params;
  const mime = (req.headers.get("content-type") || "").split(";")[0];
  if (!mime.startsWith("audio/")) return NextResponse.json({ error: "BAD_TYPE" }, { status: 415 });
  if (Number(req.headers.get("content-length") || 0) > MAX_BYTES) return NextResponse.json({ error: "TOO_LARGE" }, { status: 413 });
  const store = getStore();
  if (!(await store.callExists(id))) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  const buf = Buffer.from(await req.arrayBuffer());
  if (!buf.length || buf.length > MAX_BYTES) return NextResponse.json({ error: "BAD_SIZE" }, { status: 413 });
  const ok = await store.saveRecording(id, mime, buf);
  return NextResponse.json({ ok }, { status: ok ? 200 : 409 });
}