"use client";
import { useSyncExternalStore } from "react";
const sub = (f: () => void) => { document.addEventListener("fullscreenchange", f); return () => document.removeEventListener("fullscreenchange", f); };
/** t396: global full-screen toggle (⛶ / ✕). Esc exits (browser default); the icon follows the real state. Hidden where the API is missing (iPhone). */
export function FullscreenToggle({ className = "" }: { className?: string }) {
  const on = useSyncExternalStore(sub, () => !!document.fullscreenElement, () => false);
  const ok = useSyncExternalStore(sub, () => !!document.fullscreenEnabled, () => false);
  if (!ok) return null;
  const go = () => { if (document.fullscreenElement) document.exitFullscreen().catch(() => undefined); else document.documentElement.requestFullscreen?.().catch(() => undefined); };
  return <button type="button" onClick={go} title={on ? "Exit full screen (Esc)" : "Full screen"} aria-label={on ? "Exit full screen" : "Full screen"} aria-pressed={on} data-testid="global-full"
    className={"inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-[#f5c542]/60 bg-white/10 text-base font-bold text-[#f5c542] backdrop-blur hover:bg-[#f5c542]/20 " + className}>{on ? "✕" : "⛶"}</button>;
}
