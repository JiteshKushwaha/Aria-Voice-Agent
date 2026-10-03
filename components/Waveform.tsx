"use client";

import { useEffect, useRef } from "react";
import type { Phase } from "@/hooks/useVoiceAgent";

const pad = (n: number) => String(Math.max(0, n)).padStart(2, "0");
export const formatClock = (s: number) => `${pad(Math.floor(s / 3600))}:${pad(Math.floor((s % 3600) / 60))}:${pad(s % 60)}`;

/**
 * Recorder-style scrolling waveform: history to the left of a red playhead,
 * a dotted "future" line to the right. Amplitude comes from the call mix
 * (customer mic + Aria's neural voice). For the browser-voice fallback, which
 * can't be analysed, a gentle synthetic level is drawn while speaking.
 */
export function Waveform({ analyser, phase, elapsed }: { analyser: AnalyserNode | null; phase: Phase; elapsed: number }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const historyRef = useRef<number[]>([]);
  const phaseRef = useRef(phase);
  phaseRef.current = phase;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const data = new Uint8Array(analyser ? analyser.fftSize : 0);
    let raf = 0;
    let last = 0;

    const draw = (t: number) => {
      raf = requestAnimationFrame(draw);
      const dpr = window.devicePixelRatio || 1;
      const w = canvas.clientWidth;
      const h = canvas.clientHeight;
      if (canvas.width !== Math.round(w * dpr)) { canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr); }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      const p = phaseRef.current;
      const live = p !== "idle" && p !== "ended" && p !== "connecting";
      if (t - last > 70 && live) {
        last = t;
        let level = 0;
        if (analyser) {
          analyser.getByteTimeDomainData(data);
          let sum = 0;
          for (let i = 0; i < data.length; i++) { const v = (data[i] - 128) / 128; sum += v * v; }
          level = Math.min(1, Math.sqrt(sum / data.length) * 4.5);
        }
        if (p === "speaking" && level < 0.05) level = 0.25 + Math.random() * 0.45;
        historyRef.current.push(Math.max(0.03, level));
        if (historyRef.current.length > 400) historyRef.current.shift();
      }

      ctx.clearRect(0, 0, w, h);
      const mid = h / 2;
      const head = Math.round(w * 0.62);
      const step = 4;
      const hist = historyRef.current;
      ctx.fillStyle = "#B9AFA3";
      for (let i = hist.length - 1, x = head - step; i >= 0 && x > 0; i--, x -= step) {
        const bh = Math.max(2, hist[i] * (h * 0.86));
        ctx.globalAlpha = Math.max(0.25, x / head);
        ctx.fillRect(x, mid - bh / 2, 1.6, bh);
      }
      ctx.globalAlpha = 1;
      ctx.fillStyle = "#D6CEC4";
      for (let x = head + 6; x < w; x += 5) ctx.fillRect(x, mid - 0.75, 2, 1.5);
      ctx.fillStyle = "#C8473B";
      ctx.fillRect(head - 1, 6, 2, h - 12);
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [analyser]);

  useEffect(() => { if (phase === "connecting") historyRef.current = []; }, [phase]);

  const ticks = Array.from({ length: 17 }, (_, i) => elapsed - 10 + i);
  return (
    <div className="wave">
      <canvas ref={canvasRef} className="wave-canvas" aria-hidden="true" />
      <div className="wave-head" aria-hidden="true" />
      <div className="wave-ticks" aria-hidden="true">
        {ticks.map((n, i) => (
          <span key={i} className={n === elapsed ? "now" : n > elapsed ? "future" : ""}>{n >= 0 ? pad(n % 100) : ""}</span>
        ))}
      </div>
    </div>
  );

}