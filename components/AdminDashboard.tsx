"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import type { CallListItem, CallRecord } from "@/lib/types";
import { formatClock } from "./Waveform";

type View = "loading" | "login" | "disabled" | "list";

export default function AdminDashboard() {
  const [view, setView] = useState<View>("loading");
  const [calls, setCalls] = useState<CallListItem[]>([]);
  const [storage, setStorage] = useState("");
  const [selected, setSelected] = useState<CallRecord | null>(null);
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);

  const load = useCallback(async () => {
    const res = await fetch("/api/admin/calls", { cache: "no-store" });
    if (res.status === 503) return setView("disabled");
    if (res.status === 401) return setView("login");
    if (!res.ok) { setError("Could not load calls."); return setView("list"); }
    const data = (await res.json()) as { calls: CallListItem[]; storage: string };
    setCalls(data.calls);
    setStorage(data.storage);
    setView("list");
  }, []);

  useEffect(() => { void load(); }, [load]);

  const login = async (e: FormEvent) => {
    e.preventDefault();
    setError("");
    const res = await fetch("/api/admin/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ password }) });
    if (res.ok) { setPassword(""); void load(); }
    else setError(res.status === 429 ? "Too many attempts. Try again later." : "Incorrect password.");
  };

  const open = async (id: string) => {
    const res = await fetch(`/api/admin/calls/${encodeURIComponent(id)}`, { cache: "no-store" });
    if (res.ok) setSelected((await res.json()) as CallRecord);
  };

  const remove = async (id: string) => {
    if (!confirm("Delete this call and its recording?")) return;
    await fetch(`/api/admin/calls/${encodeURIComponent(id)}`, { method: "DELETE" });
    setSelected(null);
    void load();
  };

  const logout = async () => { await fetch("/api/admin/logout", { method: "POST" }); setSelected(null); setView("login"); };

  const copyJson = async () => {
    if (!selected) return;
    await navigator.clipboard.writeText(JSON.stringify(selected.outcome, null, 2));
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const download = () => {
    if (!selected) return;
    const blob = new Blob([JSON.stringify(selected, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `aura-call-${selected.id}.json`;
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="shell">
      <header className="top">
        <a href="/" className="brand">AURA<span className="brand-sub">skincare</span></a>
        <span className="top-right">Admin {view === "list" && <button className="link" onClick={logout}>Sign out</button>}</span>
      </header>

      {view === "loading" && <p className="muted pad">Loading…</p>}
      {view === "disabled" && <p className="muted pad">Admin is disabled. Set ADMIN_PASSWORD in the environment and redeploy.</p>}
      {view === "login" && (
        <form className="card login" onSubmit={login}>
          <h1 className="panel-title">Admin sign in</h1>
          <label htmlFor="pw" className="label">Password</label>
          <input id="pw" type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" />
          {error && <p className="err" role="alert">{error}</p>}
          <button className="btn btn-start" type="submit">Sign in</button>
        </form>
      )}

      {view === "list" && (
        <main className="admin">
          <section className="panel">
            <p className="eyebrow">{storage === "memory" ? "Temporary memory storage (set DATABASE_URL to persist)" : "Postgres"}</p>
            <h1 className="panel-title">Calls <span className="muted">({calls.length})</span> <button className="link" onClick={() => void load()}>Refresh</button></h1>
            {error && <p className="err">{error}</p>}
            {calls.length === 0 ? <p className="muted">No calls yet.</p> : (
              <ul className="call-list">
                {calls.map((c) => (
                  <li key={c.id}>
                    <button className={`call-row ${selected?.id === c.id ? "sel" : ""}`} onClick={() => void open(c.id)}>
                      <span>{new Date(c.createdAt).toLocaleString("en-IN")}</span>
                      <span className="mono">{formatClock(c.durationSeconds)}</span>
                      <span className="tag">{c.outcome?.customer_intent}</span>
                      <span className={`pill pill-${(c.outcome?.resolution_status ?? "").toLowerCase()}`}>{c.outcome?.resolution_status}</span>
                      <span className="mono">{c.outcome?.order_id ?? "—"}</span>
                      <span>{c.hasRecording ? "●" : ""}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {selected && (
            <section className="panel detail">
              <div className="detail-head">
                <h2 className="panel-title">Call {selected.id.slice(0, 8)}</h2>
                <button className="link danger" onClick={() => void remove(selected.id)}>Delete</button>
              </div>
              {selected.hasRecording ? (
                <audio controls preload="none" src={`/api/admin/calls/${encodeURIComponent(selected.id)}/recording`} className="player" />
              ) : <p className="muted">No recording stored for this call.</p>}

              <h3 className="try-h">Outcome</h3>
              <pre className="json">{JSON.stringify(selected.outcome, null, 2)}</pre>
              <div className="row-gap">
                <button className="btn btn-small" onClick={() => void copyJson()}>{copied ? "Copied" : "Copy JSON"}</button>
                <button className="btn btn-small btn-ghost" onClick={download}>Download call log</button>
              </div>

              <h3 className="try-h">Transcript</h3>
              <ol className="transcript">
                {selected.transcript.map((t) => (
                  <li key={t.id} className={`t t-${t.kind}`}>
                    <span className="t-time">{new Date(t.at).toLocaleTimeString("en-IN")}</span>
                    {t.kind === "tool" && t.tool ? (
                      <details>
                        <summary><span className="mono">{t.tool.name}</span>({JSON.stringify(t.tool.args)})</summary>
                        <pre className="json small">{JSON.stringify(t.tool.result, null, 2)}</pre>
                      </details>
                    ) : (
                      <p><strong>{t.kind === "user" ? "Customer" : "Aria"}</strong> {t.text}</p>
                    )}
                  </li>
                ))}
              </ol>
              <p className="fine">Voice: {selected.voiceMode || "n/a"} · {selected.userAgent}</p>
            </section>
          )}
        </main>
      )}
    </div>
  );
}