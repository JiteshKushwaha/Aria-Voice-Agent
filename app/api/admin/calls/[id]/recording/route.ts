import { NextResponse, type NextRequest } from "next/server";
import { isAdmin } from "@/lib/auth";
import { getStore } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  if (!isAdmin(req)) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  const { id } = await ctx.params;
  const rec = await getStore().getRecording(id);
  if (!rec) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  return new Response(new Uint8Array(rec.data), {
    headers: { "Content-Type": rec.mime, "Content-Disposition": `inline; filename="aura-call-${id}.webm"`, "Cache-Control": "private, no-store" }
  });
}