import { MsEdgeTTS, OUTPUT_FORMAT } from "msedge-tts";
import { NextResponse, type NextRequest } from "next/server";
import { clientIp, rateLimit } from "@/lib/ratelimit";
import { speechify } from "@/lib/speech";

export const runtime = "nodejs";
export const maxDuration = 30;
export const dynamic = "force-dynamic";

const TIMEOUT_MS = 9000;

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error("timeout")), ms);
    p.then((v) => { clearTimeout(t); resolve(v); }, (e) => { clearTimeout(t); reject(e); });
  });
}

const xml = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");

async function azureTts(text: string, voice: string): Promise<Buffer> {
  const region = process.env.AZURE_SPEECH_REGION || "centralindia";
  const ssml = `<speak version="1.0" xml:lang="en-IN"><voice name="${xml(voice)}"><prosody rate="-4%">${xml(text)}</prosody></voice></speak>`;
  const res = await fetch(`https://${region}.tts.speech.microsoft.com/cognitiveservices/v1`, {
    method: "POST",
    headers: {
      "Ocp-Apim-Subscription-Key": process.env.AZURE_SPEECH_KEY as string,
      "Content-Type": "application/ssml+xml",
      "X-Microsoft-OutputFormat": "audio-24khz-48kbitrate-mono-mp3",
      "User-Agent": "aura-voice-agent"
    },
    body: ssml
  });
  if (!res.ok) throw new Error(`azure ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}

async function edgeTts(text: string, voice: string): Promise<Buffer> {
  const tts = new MsEdgeTTS();
  await tts.setMetadata(voice, OUTPUT_FORMAT.AUDIO_24KHZ_48KBITRATE_MONO_MP3);
  const { audioStream } = await tts.toStream(text);
  return new Promise<Buffer>((resolve, reject) => {
    const chunks: Buffer[] = [];
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      const buf = Buffer.concat(chunks);
      buf.length ? resolve(buf) : reject(new Error("empty audio"));
    };
    audioStream.on("data", (c: Buffer) => chunks.push(c));
    audioStream.on("end", finish);
    audioStream.on("close", finish);
    audioStream.on("error", (e: Error) => { if (!done) { done = true; reject(e); } });
  });
}

export async function POST(req: NextRequest) {
  if (!rateLimit(`tts:${clientIp(req)}`, 120, 60_000)) return NextResponse.json({ error: "RATE_LIMITED" }, { status: 429 });
  let text = "";
  try {
    const b = (await req.json()) as { text?: unknown };
    text = typeof b.text === "string" ? b.text.slice(0, 500) : "";
  } catch { /* fallthrough */ }
  const spoken = speechify(text);
  if (!spoken) return NextResponse.json({ error: "EMPTY" }, { status: 400 });

  const voice = process.env.TTS_VOICE || "en-IN-NeerjaNeural";
  const attempts: Array<() => Promise<Buffer>> = [];
  if (process.env.AZURE_SPEECH_KEY) attempts.push(() => azureTts(spoken, voice));
  attempts.push(() => edgeTts(spoken, voice));

  for (const attempt of attempts) {
    try {
      const buf = await withTimeout(attempt(), TIMEOUT_MS);
      return new Response(new Uint8Array(buf), { headers: { "Content-Type": "audio/mpeg", "Cache-Control": "no-store" } });
    } catch (e) {
      console.warn("[tts] provider failed", e);
    }
  }
  // 502 tells the client to switch to browser speechSynthesis.
  return NextResponse.json({ error: "TTS_UNAVAILABLE" }, { status: 502 });
}