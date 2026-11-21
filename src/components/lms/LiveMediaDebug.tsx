"use client";

import { useEffect, useState } from "react";
import { lmsApi } from "@/lib/lms";
import { liveDebugEnabled, liveMediaLog } from "@/lib/liveMediaLog";

export default function LiveMediaDebug({ roomId, isHost, asAdmin }: { roomId?: string; isHost?: boolean; asAdmin?: boolean }) {
  const [on, setOn] = useState(false);
  const [text, setText] = useState("");
  const [sent, setSent] = useState(0);
  const [err, setErr] = useState("");
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!liveDebugEnabled()) return;
    setOn(true);
    const sync = () => {
      const s = liveMediaLog.snapshot();
      setText(liveMediaLog.text());
      setSent(s.sent);
      setErr(s.sendErr);
    };
    sync();
    return liveMediaLog.subscribe(sync);
  }, [roomId]);

  if (!on) return null;

  async function copy() {
    const t = liveMediaLog.text();
    try {
      await navigator.clipboard.writeText(t);
    } catch {
      const a = document.createElement("textarea");
      a.value = t;
      document.body.appendChild(a);
      a.select();
      document.execCommand("copy");
      a.remove();
    }
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  }

  async function loadRoom() {
    if (!roomId) return;
    try {
      const r = await lmsApi.liveDebugGet(roomId, !!asAdmin);
      const blocks = (r.logs || []).map((log) => {
        const lines = log.events.map((e) => `${String(e.t).padStart(5, " ")}ms  ${e.ev}${e.detail ? `  ${e.detail}` : ""}`);
        return [`--- client ${log.clientId} ---`, ...lines].join("\n");
      });
      const all = [`live-media room ${roomId} (server)`, ...blocks].join("\n");
      try { await navigator.clipboard.writeText(all); } catch { /* */ }
      setText(all);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "load_failed");
    }
  }

  return (
    <aside className="lb-media-debug" data-testid="live-media-debug" aria-label="Media debug log">
      <div className="lb-media-debug-top">
        <strong>Media debug</strong>
        <span>{sent ? `sent ${sent}` : "local"}{err ? ` · ${err}` : ""}</span>
      </div>
      <pre className="lb-media-debug-log">{text || "Waiting for events…"}</pre>
      <div className="lb-media-debug-actions">
        <button type="button" onClick={() => void copy()}>{copied ? "Copied" : "Copy logs"}</button>
        {isHost && <button type="button" onClick={() => void loadRoom()}>Copy room logs</button>}
        <button type="button" onClick={() => void liveMediaLog.flush()}>Send</button>
      </div>
    </aside>
  );
}
