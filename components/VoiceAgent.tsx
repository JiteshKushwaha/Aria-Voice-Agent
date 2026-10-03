"use client";

import { useState, type FormEvent } from "react";
import { useVoiceAgent, type Phase } from "@/hooks/useVoiceAgent";
import { AgentPortrait } from "./AgentPortrait";
import { OrdersPanel } from "./OrdersPanel";
import { formatClock, Waveform } from "./Waveform";

const STATUS: Record<Phase, string> = {
  idle: "Ready",
  connecting: "Connecting",
  listening: "Listening",
  thinking: "One moment",
  speaking: "Aria is speaking",
  ended: "Call ended"
};

const BANNERS = {
  unsupported: "Voice recognition isn't supported in this browser. Please use Chrome or Edge on desktop, or type your message below.",
  "mic-blocked": "Microphone access is blocked. Allow it from the address bar, or type your message below.",
  network: "The connection seems unstable. Please check your internet and try again.",
  "server-config": "The service isn't configured yet (missing LLM_API_KEY on the server)."
} as const;

export default function VoiceAgent() {
  const a = useVoiceAgent();
  const [typed, setTyped] = useState("");
  const [showTyping, setShowTyping] = useState(false);
  const live = a.phase !== "idle" && a.phase !== "ended";
  const typingVisible = live && (showTyping || !a.supported || a.banner === "mic-blocked");

  const submit = (e: FormEvent) => {
    e.preventDefault();
    a.sendText(typed);
    setTyped("");
  };

  return (
    <div className="shell">
      <header className="top">
        <span className="brand">AURA<span className="brand-sub">skincare</span></span>
        <span className="top-right">Client Care</span>
      </header>

      <main className="layout">
        <section className="call" aria-labelledby="call-h">
          <p className="eyebrow">Voice support</p>
          <h1 id="call-h" className="display">Speak with us,<br /><em>we're listening.</em></h1>

          {a.banner && (
            <div className="banner" role="alert">
              <span>{BANNERS[a.banner]}</span>
              <button className="link" onClick={a.dismissBanner} aria-label="Dismiss">Dismiss</button>
            </div>
          )}

          <div className="card recorder">
            <Waveform analyser={a.analyser} phase={a.phase} elapsed={a.elapsed} />
            <div className="rec-row">
              <div>
                <p className={`rec-status ${live ? "on" : ""}`}><span className="dot" />{live ? "On call · Recording" : a.phase === "ended" ? "Call ended" : "Not connected"}</p>
                <p className="clock">{formatClock(a.elapsed)}</p>
              </div>
              <div className="rec-actions">
                {live ? (
                  <button className="btn btn-end" onClick={a.endCall}><span className="sq" aria-hidden="true" />End call</button>
                ) : (
                  <button className="btn btn-start" onClick={a.start}>
                    <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M12 15a3 3 0 0 0 3-3V6a3 3 0 0 0-6 0v6a3 3 0 0 0 3 3Zm5-3a5 5 0 0 1-10 0H5a7 7 0 0 0 6 6.92V21h2v-2.08A7 7 0 0 0 19 12h-2Z" /></svg>
                    {a.phase === "ended" ? "Start new call" : "Start call"}
                  </button>
                )}
              </div>
            </div>
          </div>

          <div className="card agent">
            <AgentPortrait phase={a.phase} />
            <div className="agent-meta">
              <p className="agent-name">Aria</p>
              <p className="agent-role">Client Care, Aura Skincare</p>
              <p className="agent-state" aria-live="polite">{STATUS[a.phase]}</p>
              <div className="chips" aria-hidden="true">
                {(["listening", "thinking", "speaking"] as const).map((p) => (
                  <span key={p} className={`chip chip-${p} ${a.phase === p ? "active" : ""}`}>{p[0].toUpperCase() + p.slice(1)}</span>
                ))}
              </div>
            </div>
          </div>

          {typingVisible && (
            <form className="typed" onSubmit={submit}>
              <label htmlFor="typed" className="sr-only">Type your message</label>
              <input id="typed" value={typed} onChange={(e) => setTyped(e.target.value)} maxLength={600} placeholder="Type your message" autoComplete="off" />
              <button className="btn btn-small" type="submit" disabled={!typed.trim()}>Send</button>
            </form>
          )}

          {a.phase === "ended" && (
            <div className="card thanks" role="status">
              <p className="thanks-h">Thank you for calling Aura.</p>
              <p className="muted">{a.saveState === "saving" ? "Wrapping up your call…" : a.saveState === "error" ? "We couldn't save this call log." : "Have a lovely day."}</p>
            </div>
          )}

          <div className="options">
            <label className="toggle">
              <input type="checkbox" checked={a.bargeIn} onChange={(e) => a.setBargeIn(e.target.checked)} />
              <span>I'm using headphones (interrupt anytime)</span>
            </label>
            {live && a.supported && (
              <button className="link" onClick={() => setShowTyping((v) => !v)}>{showTyping ? "Hide typing" : "Prefer typing?"}</button>
            )}
            <span className={`badge ${a.voiceMode}`}>{a.voiceMode === "neural" ? "Neural voice" : "Browser voice"}</span>
          </div>
          <p className="fine">Calls are recorded for quality and training purposes.</p>
        </section>

        <aside><OrdersPanel cancelledOrders={a.cancelledOrders} /></aside>
      </main>

      <footer className="foot">Demo only. Orders are mock data. Aria is an AI assistant. · <a href="/admin">Admin</a></footer>
    </div>
  );
}