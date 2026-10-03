"use client";

import { useEffect, useRef, useState } from "react";
import { SCRIPTED } from "@/lib/knowledge";
import { splitSentences } from "@/lib/speech";
import type { ChatMessage, ToolEvent, TranscriptEntry } from "@/lib/types";

export type Phase =
  | "idle"
  | "connecting"
  | "listening"
  | "thinking"
  | "speaking"
  | "ended";
export type VoiceMode = "neural" | "browser";
export type Banner =
  | "unsupported"
  | "mic-blocked"
  | "network"
  | "server-config"
  | null;
export type SaveState = "idle" | "saving" | "saved" | "error";

// Minimal Web Speech API typings (not in TypeScript's DOM lib).
interface SRAlt {
  transcript: string;
  confidence: number;
}
interface SRResult {
  isFinal: boolean;
  length: number;
  [i: number]: SRAlt;
}
interface SREvent {
  resultIndex: number;
  results: { length: number; [i: number]: SRResult };
}
interface SRErrorEvent {
  error: string;
}
interface SR {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  onresult: ((e: SREvent) => void) | null;
  onerror: ((e: SRErrorEvent) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
}
type SRCtor = new () => SR;

function getSR(): SRCtor | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as {
    SpeechRecognition?: SRCtor;
    webkitSpeechRecognition?: SRCtor;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

const FINAL_DEBOUNCE = 900;
const INTERIM_DEBOUNCE = 1700;
const SILENCE_NUDGE_MS = 20000;
const MAX_RECORDING_BYTES = 4_000_000;
const uid = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;

export function useVoiceAgent() {
  const [phase, setPhaseState] = useState<Phase>("idle");
  const [voiceMode, setVoiceMode] = useState<VoiceMode>("neural");
  const [banner, setBanner] = useState<Banner>(null);
  const [supported, setSupported] = useState(true);
  const [bargeIn, setBargeInState] = useState(false);
  const [cancelledOrders, setCancelledOrders] = useState<string[]>([]);
  const [elapsed, setElapsed] = useState(0);
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [analyser, setAnalyser] = useState<AnalyserNode | null>(null);

  // All mutable call state lives in refs so async callbacks never see stale values.
  const phaseRef = useRef<Phase>("idle");
  const activeRef = useRef(false);
  const genRef = useRef(0); // bumped on interrupt/end; stale async work checks it and exits
  const bargeInRef = useRef(false);
  const voiceModeRef = useRef<VoiceMode>("neural");
  const recRef = useRef<SR | null>(null);
  const recRunningRef = useRef(false);
  const bufferRef = useRef("");
  const interimRef = useRef("");
  const confsRef = useRef<number[]>([]);
  const endpointTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const silenceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const clockTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const nudgedRef = useRef(false);
  const messagesRef = useRef<ChatMessage[]>([]);
  const toolEventsRef = useRef<ToolEvent[]>([]);
  const transcriptRef = useRef<TranscriptEntry[]>([]);
  const cancelledRef = useRef<string[]>([]);
  const chatAbort = useRef<AbortController | null>(null);
  const ttsAbort = useRef<AbortController | null>(null);
  const ttsFails = useRef(0);
  const audioCache = useRef<Map<string, string>>(new Map());
  const streamRef = useRef<MediaStream | null>(null);
  const ctxRef = useRef<AudioContext | null>(null);
  const audioElRef = useRef<HTMLAudioElement | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const callIdRef = useRef("");
  const startedAtRef = useRef(0);

  useEffect(() => {
    setSupported(Boolean(getSR()));
  }, []);

  function setPhase(p: Phase) {
    phaseRef.current = p;
    setPhaseState(p);
    syncRecognition();
  }

  function addTranscript(entry: Omit<TranscriptEntry, "id" | "at">) {
    transcriptRef.current.push({
      ...entry,
      id: uid(),
      at: new Date().toISOString(),
    });
  }

  // ---------- Recognition ----------
  function wantsRecognition(): boolean {
    if (!activeRef.current) return false;
    // Default: mic closed while Aria speaks (laptop speakers would echo into STT).
    return (
      phaseRef.current === "listening" ||
      (bargeInRef.current && phaseRef.current === "speaking")
    );
  }

  function syncRecognition() {
    const rec = recRef.current;
    if (!rec) return;
    if (wantsRecognition() && !recRunningRef.current) {
      try {
        rec.start();
        recRunningRef.current = true;
      } catch {
        /* already started */
      }
    } else if (!wantsRecognition() && recRunningRef.current) {
      try {
        rec.abort();
      } catch {
        /* ignore */
      }
    }
  }

  function createRecognition(Ctor: SRCtor) {
    const rec = new Ctor();
    rec.lang = "en-IN";
    rec.continuous = true;
    rec.interimResults = true;
    rec.maxAlternatives = 1;
    rec.onresult = (e) => {
      let interim = "";
      let gotFinal = false;
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const r = e.results[i];
        if (r.isFinal) {
          bufferRef.current = `${bufferRef.current} ${r[0].transcript}`.trim();
          confsRef.current.push(r[0].confidence);
          gotFinal = true;
        } else interim += r[0].transcript;
      }
      interimRef.current = interim.trim();
      clearSilenceTimer();
      const heard = `${bufferRef.current} ${interimRef.current}`.trim();
      if (phaseRef.current === "speaking") {
        if (
          !bargeInRef.current ||
          heard.split(/\s+/).filter(Boolean).length < 2
        )
          return;
        interruptPlayback(); // customer barged in: stop Aria and treat this as a new turn
        setPhase("listening");
      }
      if (phaseRef.current !== "listening" || !heard) return;
      scheduleEndpoint(
        gotFinal || bufferRef.current ? FINAL_DEBOUNCE : INTERIM_DEBOUNCE,
      );
    };
    rec.onerror = (e) => {
      if (e.error === "not-allowed" || e.error === "service-not-allowed")
        setBanner("mic-blocked");
      else if (e.error === "network") setBanner("network");
      // "no-speech" and "aborted" are normal; onend restarts if needed.
    };
    rec.onend = () => {
      recRunningRef.current = false;
      if (wantsRecognition()) setTimeout(syncRecognition, 120);
    };
    recRef.current = rec;
  }

  function scheduleEndpoint(ms: number) {
    if (endpointTimer.current) clearTimeout(endpointTimer.current);
    endpointTimer.current = setTimeout(() => {
      const finalText = bufferRef.current.trim();
      const text = finalText || interimRef.current.trim();
      const confs = confsRef.current;
      // Chrome sometimes reports confidence 0 meaning "unknown"; only real low scores count as unclear.
      const known = confs.filter((c) => c > 0);
      const conf = finalText
        ? known.length
          ? known.reduce((a, b) => a + b, 0) / known.length
          : 1
        : 0.5;
      resetBuffers();
      handleUtterance(text, conf);
    }, ms);
  }

  function resetBuffers() {
    bufferRef.current = "";
    interimRef.current = "";
    confsRef.current = [];
    if (endpointTimer.current) clearTimeout(endpointTimer.current);
    endpointTimer.current = null;
  }

  // ---------- Silence nudge ----------
  function clearSilenceTimer() {
    if (silenceTimer.current) clearTimeout(silenceTimer.current);
    silenceTimer.current = null;
  }
  function startSilenceTimer() {
    clearSilenceTimer();
    if (nudgedRef.current) return;
    silenceTimer.current = setTimeout(() => {
      if (!activeRef.current || phaseRef.current !== "listening") return;
      nudgedRef.current = true;
      void respondScripted(SCRIPTED.NUDGE);
    }, SILENCE_NUDGE_MS);
  }

  // ---------- Audio output ----------
  async function fetchTts(
    text: string,
    signal: AbortSignal,
  ): Promise<string | null> {
    const cached = audioCache.current.get(text);
    if (cached) return cached;
    try {
      const res = await fetch("/api/tts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
        signal,
      });
      if (!res.ok) return null;
      const blob = await res.blob();
      if (!blob.size) return null;
      return URL.createObjectURL(blob);
    } catch {
      return null;
    }
  }

  function playUrl(url: string): Promise<void> {
    return new Promise((resolve) => {
      const el = audioElRef.current;
      if (!el) return resolve();
      const done = () => {
        el.onended = null;
        el.onerror = null;
        el.onpause = null;
        resolve();
      };
      el.onended = done;
      el.onerror = done;
      el.onpause = done; // interruptPlayback() pauses → resolves immediately
      el.src = url;
      el.play().catch(done);
    });
  }

  function pickBrowserVoice(): SpeechSynthesisVoice | null {
    const voices = window.speechSynthesis.getVoices();
    const inVoices = voices.filter(
      (v) => v.lang.replace("_", "-").toLowerCase() === "en-in",
    );
    return (
      inVoices.find((v) => /natural|neerja|online/i.test(v.name)) ??
      inVoices.find((v) => /female|heera|veena|google/i.test(v.name)) ??
      inVoices[0] ??
      voices.find((v) => v.lang.toLowerCase().startsWith("en-gb")) ??
      null
    );
  }

  function speakBrowser(text: string): Promise<void> {
    return new Promise((resolve) => {
      if (typeof window === "undefined" || !("speechSynthesis" in window))
        return resolve();
      const u = new SpeechSynthesisUtterance(text);
      const v = pickBrowserVoice();
      if (v) u.voice = v;
      u.lang = v?.lang ?? "en-IN";
      u.rate = 1;
      u.onend = () => resolve();
      u.onerror = () => resolve();
      window.speechSynthesis.speak(u);
    });
  }

  function markTtsFailure() {
    ttsFails.current += 1;
    if (ttsFails.current >= 2 && voiceModeRef.current !== "browser") {
      voiceModeRef.current = "browser";
      setVoiceMode("browser");
    }
  }

  /** Splits into sentences, fires every TTS request at once, plays strictly in order. */
  async function speak(text: string, gen: number, cacheable = false) {
    if (gen !== genRef.current || !activeRef.current) return;
    setPhase("speaking");
    const chunks = splitSentences(text);
    if (voiceModeRef.current === "browser") {
      for (const c of chunks) {
        if (gen !== genRef.current) return;
        await speakBrowser(c);
      }
      return;
    }
    const ctrl = new AbortController();
    ttsAbort.current = ctrl;
    const pending = chunks.map((c) => fetchTts(c, ctrl.signal));
    for (let i = 0; i < chunks.length; i++) {
      const url = await pending[i];
      if (gen !== genRef.current) {
        if (url && !audioCache.current.has(chunks[i])) URL.revokeObjectURL(url);
        continue;
      }
      if (url) {
        ttsFails.current = 0;
        if (cacheable) audioCache.current.set(chunks[i], url);
        await playUrl(url);
        if (!audioCache.current.has(chunks[i])) URL.revokeObjectURL(url);
      } else {
        markTtsFailure();
        await speakBrowser(chunks[i]);
      }
    }
  }

  function interruptPlayback() {
    genRef.current += 1;
    ttsAbort.current?.abort();
    chatAbort.current?.abort();
    audioElRef.current?.pause();
    if (typeof window !== "undefined" && "speechSynthesis" in window)
      window.speechSynthesis.cancel();
  }

  function backToListening(gen: number) {
    if (gen !== genRef.current || !activeRef.current) return;
    resetBuffers();
    setPhase("listening");
    startSilenceTimer();
  }

  async function respondScripted(line: string, cacheable = true) {
    interruptPlayback();
    const gen = genRef.current;
    addTranscript({ kind: "assistant", text: line });
    messagesRef.current.push({ role: "assistant", content: line });
    await speak(line, gen, cacheable);
    backToListening(gen);
  }

  // ---------- Turn handling ----------
  function handleUtterance(text: string, conf: number) {
    if (!activeRef.current) return;
    if (text.replace(/[^a-z0-9]/gi, "").length < 2 || conf < 0.3) {
      // Unclear-audio gate: no LLM call, local clarification line.
      addTranscript({
        kind: "user",
        text: text ? `(unclear) ${text}` : "(unclear)",
        unclear: true,
      });
      void respondScripted(SCRIPTED.CLARIFY);
      return;
    }
    void sendToAgent(text);
  }

  async function sendToAgent(text: string) {
    interruptPlayback();
    clearSilenceTimer();
    const gen = genRef.current;
    addTranscript({ kind: "user", text });
    messagesRef.current.push({ role: "user", content: text });
    setPhase("thinking");

    const ctrl = new AbortController();
    chatAbort.current = ctrl;
    let reply: string = SCRIPTED.FALLBACK;
    try {
      // const res = await fetch("/api/chat", {
      //   method: "POST",
      //   headers: { "Content-Type": "application/json" },
      //   body: JSON.stringify({ messages: messagesRef.current.slice(-24), cancelledOrders: cancelledRef.current }),
      //   signal: ctrl.signal
      // });
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: messagesRef.current.slice(-24),
          cancelledOrders: cancelledRef.current,
        }),
        signal: ctrl.signal,
      });

      console.log("[CHAT] HTTP STATUS:", res.status);

      const data = (await res.json().catch(() => ({}))) as {
        reply?: string;
        error?: string;
        detail?: string;
        toolEvents?: ToolEvent[];
        cancelledOrders?: string[];
      };

      console.log("[CHAT] RESPONSE:", data);

      if (!res.ok) {
        throw new Error(data.detail || data.error || `CHAT_HTTP_${res.status}`);
      }
      if (data.error === "SERVER_NOT_CONFIGURED") setBanner("server-config");
      if (typeof data.reply === "string" && data.reply) reply = data.reply;
      if (gen !== genRef.current) return;
      for (const ev of data.toolEvents ?? []) {
        toolEventsRef.current.push(ev);
        addTranscript({ kind: "tool", text: ev.name, tool: ev });
      }
      if (Array.isArray(data.cancelledOrders)) {
        cancelledRef.current = data.cancelledOrders;
        setCancelledOrders(data.cancelledOrders);
      }
    } catch (e) {
      if ((e as Error).name === "AbortError" || gen !== genRef.current) return;
      setBanner("network");
      reply = SCRIPTED.NETWORK;
    }
    if (gen !== genRef.current || !activeRef.current) return;
    addTranscript({ kind: "assistant", text: reply });
    messagesRef.current.push({ role: "assistant", content: reply });
    await speak(reply, gen);
    backToListening(gen);
  }

  // ---------- Audio graph + recording ----------
  /**
   * Mic and Aria's voice are mixed in one AudioContext: the mix feeds the
   * waveform analyser and a MediaRecorder (the stored call recording).
   * Mic is NOT routed to the speakers (no feedback). Browser speechSynthesis
   * cannot be captured, so fallback-voice turns are missing from recordings.
   */
  function buildAudioGraph(stream: MediaStream | null) {
    const Ctx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext })
        .webkitAudioContext;
    const ctx = new Ctx();
    const mix = ctx.createGain();
    const an = ctx.createAnalyser();
    an.fftSize = 1024;
    an.smoothingTimeConstant = 0.6;
    const dest = ctx.createMediaStreamDestination();
    mix.connect(an);
    mix.connect(dest);
    if (stream) ctx.createMediaStreamSource(stream).connect(mix);
    const el = new Audio();
    el.preload = "auto";
    const elSrc = ctx.createMediaElementSource(el); // only once per element, so the element is reused
    elSrc.connect(ctx.destination);
    elSrc.connect(mix);
    ctxRef.current = ctx;
    audioElRef.current = el;
    setAnalyser(an);

    if (typeof MediaRecorder !== "undefined") {
      const mime = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4"].find(
        (m) => MediaRecorder.isTypeSupported(m),
      );
      try {
        const rec = new MediaRecorder(
          dest.stream,
          mime ? { mimeType: mime, audioBitsPerSecond: 32000 } : undefined,
        );
        chunksRef.current = [];
        rec.ondataavailable = (e) => {
          if (e.data.size) chunksRef.current.push(e.data);
        };
        rec.start(1000);
        recorderRef.current = rec;
      } catch {
        recorderRef.current = null;
      }
    }
  }

  function stopRecorder(): Promise<Blob | null> {
    return new Promise((resolve) => {
      const rec = recorderRef.current;
      if (!rec || rec.state === "inactive") return resolve(null);
      rec.onstop = () =>
        resolve(
          new Blob(chunksRef.current, { type: rec.mimeType || "audio/webm" }),
        );
      try {
        rec.stop();
      } catch {
        resolve(null);
      }
    });
  }

  function teardownAudio() {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    void ctxRef.current?.close().catch(() => undefined);
    ctxRef.current = null;
    setAnalyser(null);
  }

  // ---------- Public API ----------
  async function start() {
    if (activeRef.current || phaseRef.current === "connecting") return;
    setBanner(null);
    setSaveState("idle");
    setElapsed(0);
    setCancelledOrders([]);
    cancelledRef.current = [];
    messagesRef.current = [];
    toolEventsRef.current = [];
    transcriptRef.current = [];
    nudgedRef.current = false;
    ttsFails.current = 0;
    voiceModeRef.current = "neural";
    setVoiceMode("neural");
    resetBuffers();
    setPhase("connecting");

    const Ctor = getSR();
    if (!Ctor) setBanner("unsupported");

    // The mic stream stays open for the call: it feeds the waveform and the recording.
    let stream: MediaStream | null = null;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });
    } catch {
      setBanner("mic-blocked"); // still allow typed input
    }
    streamRef.current = stream;
    buildAudioGraph(stream);
    await ctxRef.current?.resume().catch(() => undefined);
    if (Ctor && stream) createRecognition(Ctor);

    callIdRef.current = uid();
    startedAtRef.current = Date.now();
    activeRef.current = true;
    clockTimer.current = setInterval(
      () => setElapsed(Math.floor((Date.now() - startedAtRef.current) / 1000)),
      250,
    );
    await respondScripted(SCRIPTED.GREETING, true);
  }

  async function endCall() {
    if (!activeRef.current) return;
    activeRef.current = false;
    interruptPlayback();
    clearSilenceTimer();
    resetBuffers();
    if (clockTimer.current) clearInterval(clockTimer.current);
    try {
      recRef.current?.abort();
    } catch {
      /* ignore */
    }
    recRef.current = null;
    recRunningRef.current = false;
    setPhase("ended");

    const blob = await stopRecorder();
    teardownAudio();
    setSaveState("saving");
    try {
      const res = await fetch("/api/summary", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          callId: callIdRef.current,
          messages: messagesRef.current,
          toolEvents: toolEventsRef.current,
          transcript: transcriptRef.current,
          durationSeconds: Math.round(
            (Date.now() - startedAtRef.current) / 1000,
          ),
          voiceMode: voiceModeRef.current,
        }),
      });
      const data = (await res.json()) as { id?: string; saved?: boolean };
      if (
        blob &&
        blob.size > 0 &&
        blob.size <= MAX_RECORDING_BYTES &&
        data.id
      ) {
        await fetch(`/api/calls/${encodeURIComponent(data.id)}/recording`, {
          method: "PUT",
          headers: { "Content-Type": blob.type.split(";")[0] || "audio/webm" },
          body: blob,
        }).catch(() => undefined);
      }
      setSaveState(data.saved === false ? "error" : "saved");
    } catch {
      setSaveState("error");
    }
  }

  function sendText(text: string) {
    const t = text.trim().slice(0, 600);
    if (!t || !activeRef.current) return;
    resetBuffers();
    void sendToAgent(t);
  }

  function setBargeIn(v: boolean) {
    bargeInRef.current = v;
    setBargeInState(v);
    syncRecognition();
  }

  useEffect(
    () => () => {
      // Unmount cleanup.
      activeRef.current = false;
      genRef.current += 1;
      chatAbort.current?.abort();
      ttsAbort.current?.abort();
      if (endpointTimer.current) clearTimeout(endpointTimer.current);
      if (silenceTimer.current) clearTimeout(silenceTimer.current);
      if (clockTimer.current) clearInterval(clockTimer.current);
      try {
        recRef.current?.abort();
      } catch {
        /* ignore */
      }
      try {
        if (recorderRef.current?.state === "recording")
          recorderRef.current.stop();
      } catch {
        /* ignore */
      }
      audioElRef.current?.pause();
      if (typeof window !== "undefined" && "speechSynthesis" in window)
        window.speechSynthesis.cancel();
      streamRef.current?.getTracks().forEach((t) => t.stop());
      void ctxRef.current?.close().catch(() => undefined);
      audioCache.current.forEach((u) => URL.revokeObjectURL(u));
    },
    [],
  );

  return {
    phase,
    voiceMode,
    banner,
    supported,
    bargeIn,
    cancelledOrders,
    elapsed,
    saveState,
    analyser,
    start,
    endCall,
    sendText,
    setBargeIn,
    dismissBanner: () => setBanner(null),
  };
}
