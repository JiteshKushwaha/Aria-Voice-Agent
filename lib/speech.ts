// Text helpers shared by server (TTS, chat) and client (chunked playback). No Node imports.

const DIGIT = (s: string) => s.split("").join(" ");

/** Rewrites text so the neural voice pronounces IDs, money and abbreviations naturally. */
export function speechify(input: string): string {
  let t = input;
  t = t.replace(/[*_#`~|>]/g, " ");
  t = t.replace(/&/g, " and ").replace(/[<>]/g, " ");
  t = t.replace(/\bORD[\s-]?(\d+)\b/gi, (_m, d: string) => `order I D ${DIGIT(d)}`);
  t = t.replace(/\b([A-Z]{2})-(\d{3,})\b/g, (_m, l: string, d: string) => `${DIGIT(l)} ${DIGIT(d)}`);
  t = t.replace(/(?:₹|\bRs\.?|\bINR)\s?([\d,]+(?:\.\d+)?)/gi, (_m, n: string) => `${n.replace(/,/g, "")} rupees`);
  t = t.replace(/\b(\d+)\s?ml\b/gi, "$1 millilitres");
  t = t.replace(/\bSPF\b/g, "S P F").replace(/\bCOD\b/g, "C O D").replace(/\bUPI\b/g, "U P I");
  t = t.replace(/\b(\d+)\s?PM\b/g, "$1 P M").replace(/\b(\d+)\s?AM\b/g, "$1 A M");
  return t.replace(/\s+/g, " ").trim();
}

/**
 * Splits a reply into sentence chunks for parallel TTS. The first chunk is at
 * least `minFirst` chars (very short first chunks sound clipped); at most
 * `maxChunks` chunks so we never fire many requests.
 */
export function splitSentences(text: string, minFirst = 30, maxChunks = 5): string[] {
  const clean = text.replace(/\s+/g, " ").trim();
  if (!clean) return [];
  const parts = (clean.match(/[^.!?]+[.!?]+["')\]]*|[^.!?]+$/g) ?? [clean]).map((s) => s.trim()).filter(Boolean);
  const out: string[] = [];
  for (const p of parts) {
    if (out.length === 1 && out[0].length < minFirst) out[0] = `${out[0]} ${p}`;
    else out.push(p);
  }
  while (out.length > maxChunks) {
    const last = out.pop() as string;
    out[out.length - 1] = `${out[out.length - 1]} ${last}`;
  }
  return out;
}

/** Removes leaked tool-call artefacts and markdown from model output. */
export function cleanReply(text: string): string {
  return text
    .replace(/<function[\s\S]*?<\/function>/gi, " ")
    .replace(/<\/?function[^>]*>/gi, " ")
    .replace(/\{[^{}]*"(?:name|order_id|arguments)"[^{}]*\}/g, " ")
    .replace(/^\s*(?:[-•]|\d+\.)\s+/gm, "")
    .replace(/[*_#`~|>]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}