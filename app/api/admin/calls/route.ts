import { NextResponse, type NextRequest } from "next/server";
import { adminEnabled, isAdmin } from "@/lib/auth";
import { getStore } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  if (!adminEnabled()) return NextResponse.json({ error: "ADMIN_DISABLED" }, { status: 503 });
  if (!isAdmin(req)) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  const store = getStore();
  try {
    return NextResponse.json({ storage: store.kind, calls: await store.listCalls() });
  } catch (e) {
    console.error("[admin] list failed", e);
    return NextResponse.json({ error: "DB_ERROR" }, { status: 500 });
  }
}