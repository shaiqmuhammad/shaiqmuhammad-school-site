"use client";

import { MAX_TOASTS, countIncrease, pickAlerts, type AlertRole, type NoteLike } from "@/lib/notifyRules";

/** Pop-up alerts: in-app toast + short chime + (when allowed) a system notification. Settings live in this browser only. */
const MUTE_KEY = "sm-notify-mute";
export const TOAST_EVENT = "sm-toasts";
export const MUTE_EVENT = "sm-notify-mute-change";

export type AlertToast = { id: string; icon: string; heading: string; detail?: string; href: string; onClick?: () => void };

const ls = (): Storage | null => { try { return typeof localStorage === "undefined" ? null : localStorage; } catch { return null; } };

export const isMuted = () => ls()?.getItem(MUTE_KEY) === "1";
export function setMuted(m: boolean) {
  try { if (m) ls()?.setItem(MUTE_KEY, "1"); else ls()?.removeItem(MUTE_KEY); } catch { /* storage blocked */ }
  window.dispatchEvent(new Event(MUTE_EVENT));
}

// ---- sound: two soft sine notes (E6 → A6), about 0.4 s. Browsers only allow audio after a tap/click on the page. ----
let audio: AudioContext | null = null;
export function unlockAudio() {
  try {
    const AC = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return;
    audio = audio || new AC();
    if (audio.state === "suspended") void audio.resume();
  } catch { /* no audio */ }
}
export function playChime() {
  if (isMuted() || !audio || audio.state !== "running") return;
  try {
    const t0 = audio.currentTime;
    [[1318.5, 0], [1760, 0.16]].forEach(([f, d]) => {
      const o = audio!.createOscillator(); const g = audio!.createGain();
      o.type = "sine"; o.frequency.value = f;
      g.gain.setValueAtTime(0.0001, t0 + d);
      g.gain.exponentialRampToValueAtTime(0.18, t0 + d + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + d + 0.28);
      o.connect(g).connect(audio!.destination);
      o.start(t0 + d); o.stop(t0 + d + 0.3);
    });
  } catch { /* ignore */ }
}

// ---- system notifications (Notification API), only after the user taps the button ----
export type SysState = "unsupported" | "default" | "granted" | "denied";
export const sysState = (): SysState => (typeof Notification === "undefined" ? "unsupported" : (Notification.permission as SysState));
export async function askSysPermission(): Promise<SysState> {
  if (typeof Notification === "undefined") return "unsupported";
  try { await Notification.requestPermission(); } catch { /* old Safari callback API */ }
  return sysState();
}
function systemAlert(t: AlertToast) {
  if (sysState() !== "granted" || document.hasFocus()) return; // a focused page already shows the toast
  const opts: NotificationOptions & { renotify?: boolean } = { body: t.detail || "", icon: "/icon-192.png", badge: "/icon-192.png", tag: t.id, silent: isMuted(), data: { url: t.href } };
  try {
    const n = new Notification(t.heading, opts);
    n.onclick = () => { window.focus(); if (t.onClick) t.onClick(); else window.location.href = t.href; n.close(); };
  } catch {
    navigator.serviceWorker?.getRegistration().then((r) => r?.showNotification(t.heading, opts)).catch(() => undefined);
  }
}

export function emitToasts(ts: AlertToast[]) {
  if (!ts.length || typeof window === "undefined") return;
  const list = ts.slice(-MAX_TOASTS);
  window.dispatchEvent(new CustomEvent<AlertToast[]>(TOAST_EVENT, { detail: list }));
  playChime();
  list.forEach(systemAlert);
}

// ---- "new since last time", remembered per browser and role ----
const read = (k: string): string | null => { try { return ls()?.getItem(k) ?? null; } catch { return null; } };
const write = (k: string, v: string) => { try { ls()?.setItem(k, v); } catch { /* ignore */ } };

export function takeFreshNotes<T extends NoteLike>(items: T[], role: AlertRole, now = Date.now()) {
  const key = `sm-notify-seen-${role}`;
  const raw = read(key);
  const r = pickAlerts(items, role, raw === null ? null : Number(raw) || 0, now);
  write(key, String(r.lastSeen));
  return r;
}

/** Records the counter and returns how many it grew by since the last visit (0 on first sight). */
export function takeCountIncrease(role: AlertRole, name: string, value: number): number {
  const key = `sm-notify-count-${role}-${name}`;
  const raw = read(key);
  const inc = countIncrease(raw === null ? null : Number(raw) || 0, value);
  write(key, String(value));
  return inc;
}
