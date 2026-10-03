import { NextResponse, type NextRequest } from "next/server";
import { ADMIN_COOKIE, adminEnabled, checkPassword, createSessionToken, SESSION_SECONDS } from "@/lib/auth";
import { clientIp, rateLimit } from "@/lib/ratelimit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  if (!adminEnabled()) return NextResponse.json({ error: "ADMIN_DISABLED" }, { status: 503 });
  if (!rateLimit(`login:${clientIp(req)}`, 8, 10 * 60_000)) return NextResponse.json({ error: "RATE_LIMITED" }, { status: 429 });
  let password = "";
  try { const b = (await req.json()) as { password?: unknown }; password = typeof b.password === "string" ? b.password : ""; } catch { /* empty */ }
  if (!checkPassword(password)) return NextResponse.json({ error: "INVALID" }, { status: 401 });
  const res = NextResponse.json({ ok: true });
  res.cookies.set(ADMIN_COOKIE, createSessionToken(), {
    httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "strict", path: "/", maxAge: SESSION_SECONDS
  });
  return res;
}