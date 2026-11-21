"use client";

/** Timestamped classroom media logs. Shown only with ?debug=1. No student names. */
import { lmsApi } from "@/lib/lms";

export const LIVE_DEBUG_EVENTS = [
  "join", "ws_open", "ws_close",
  "gum_start", "gum_ok", "gum_fail",
  "ice_servers", "sfu_session_pub", "sfu_session_recv",
  "tracks_new_push", "tracks_new_pull",
  "ice_gather", "ice_connected", "ice_failed", "ice_restart",
  "pub_announce", "first_remote_track", "first_remote_frame",
  "ready", "error", "retry",
] as const;

export type LiveDebugEventName = (typeof LIVE_DEBUG_EVENTS)[number] | string;
export type LiveDebugEvent = { t: number; ev: string; detail?: string };

const MAX_EVENTS = 80;
const MAX_DETAIL = 160;

function shortId() {
  const b = new Uint8Array(6);
  if (typeof crypto !== "undefined" && crypto.getRandomValues) crypto.getRandomValues(b);
  else for (let i = 0; i < 6; i++) b[i] = Math.floor(Math.random() * 256);
  return [...b].map((x) => x.toString(16).padStart(2, "0")).join("");
}

export function liveDebugEnabled(): boolean {
  if (typeof window === "undefined") return false;
  try {
    if (new URLSearchParams(window.location.search).get("debug") === "1") return true;
    return window.localStorage.getItem("sm_live_debug") === "1";
  } catch {
    return false;
  }
}

type Listener = () => void;

class LiveMediaLog {
  t0 = 0;
  clientId = "";
  roomId = "";
  asAdmin = false;
  events: LiveDebugEvent[] = [];
  sent = 0;
  sendErr = "";
  enabled = false;
  private listeners = new Set<Listener>();
  private framed = false;
  private flushTimer: ReturnType<typeof setTimeout> | undefined;

  start(roomId: string, asAdmin = false) {
    this.enabled = liveDebugEnabled();
    this.t0 = Date.now();
    this.clientId = shortId();
    this.roomId = roomId;
    this.asAdmin = asAdmin;
    this.events = [];
    this.sent = 0;
    this.sendErr = "";
    this.framed = false;
    this.emit();
  }

  mark(ev: LiveDebugEventName, detail?: string) {
    if (!this.t0) this.t0 = Date.now();
    const row: LiveDebugEvent = { t: Date.now() - this.t0, ev: String(ev).slice(0, 40) };
    const d = (detail || "").trim().slice(0, MAX_DETAIL);
    if (d) row.detail = d;
    this.events = [...this.events, row].slice(-MAX_EVENTS);
    if (typeof console !== "undefined") console.debug("live-media", row.t, row.ev, row.detail || "");
    this.emit();
    if (this.enabled && this.roomId) this.scheduleFlush();
  }

  snapshot() {
    return {
      clientId: this.clientId,
      t0: this.t0,
      roomId: this.roomId,
      events: this.events.slice(),
      sent: this.sent,
      sendErr: this.sendErr,
    };
  }

  text() {
    const lines = this.events.map((e) => `${String(e.t).padStart(5, " ")}ms  ${e.ev}${e.detail ? `  ${e.detail}` : ""}`);
    return [`live-media ${this.roomId || "?"} client=${this.clientId || "?"} t0=${this.t0}`, ...lines].join("\n");
  }

  subscribe(fn: Listener) {
    this.listeners.add(fn);
    return () => { this.listeners.delete(fn); };
  }

  watchPc(pc: RTCPeerConnection, label: "pub" | "recv") {
    const onIce = () => {
      const st = pc.iceConnectionState;
      if (st === "connected" || st === "completed") this.mark("ice_connected", label);
      else if (st === "failed") this.mark("ice_failed", label);
      else if (st === "checking" || st === "disconnected") this.mark("ice_gather", `${label}:${st}`);
    };
    const onConn = () => {
      const st = pc.connectionState;
      if (st === "failed") this.mark("ice_failed", `${label}:conn`);
      else if (st === "connected") this.mark("ice_connected", `${label}:conn`);
    };
    const onGather = () => this.mark("ice_gather", `${label}:${pc.iceGatheringState}`);
    pc.addEventListener("iceconnectionstatechange", onIce);
    pc.addEventListener("connectionstatechange", onConn);
    pc.addEventListener("icegatheringstatechange", onGather);
  }

  watchFirstFrame(stream: MediaStream) {
    if (this.framed || typeof document === "undefined") return;
    const video = stream.getVideoTracks().filter((t) => t.readyState === "live");
    if (!video.length) return;
    const el = document.createElement("video");
    el.muted = true;
    el.playsInline = true;
    el.srcObject = new MediaStream(video);
    const done = () => {
      if (this.framed) return;
      this.framed = true;
      this.mark("first_remote_frame", `tracks:${video.length}`);
      if (typeof window !== "undefined") {
        const w = window as Window & { __liveFirstRemoteFrameMs?: number };
        if (w.__liveFirstRemoteFrameMs == null && this.t0) w.__liveFirstRemoteFrameMs = Date.now() - this.t0;
      }
      try { el.srcObject = null; } catch { /* */ }
    };
    el.addEventListener("loadeddata", done, { once: true });
    const rvfc = (el as HTMLVideoElement & { requestVideoFrameCallback?: (cb: () => void) => void }).requestVideoFrameCallback;
    if (rvfc) rvfc.call(el, done);
    void el.play().catch(() => undefined);
    setTimeout(done, 4000);
  }

  async flush() {
    if (!this.enabled || !this.roomId || !this.events.length) return;
    try {
      await lmsApi.liveDebugPut(this.roomId, {
        clientId: this.clientId,
        t0: this.t0,
        events: this.events,
      }, this.asAdmin);
      this.sent = this.events.length;
      this.sendErr = "";
      this.emit();
    } catch (e) {
      this.sendErr = e instanceof Error ? e.message : "send_failed";
      this.emit();
    }
  }

  private scheduleFlush() {
    if (this.flushTimer) return;
    this.flushTimer = setTimeout(() => {
      this.flushTimer = undefined;
      void this.flush();
    }, 800);
  }

  private emit() {
    for (const fn of this.listeners) fn();
  }
}

export const liveMediaLog = new LiveMediaLog();
