"use client";
import { useEffect, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { toggleFullscreen } from "@/components/FocusMode";
const sub = (f: () => void) => { document.addEventListener("fullscreenchange", f); return () => document.removeEventListener("fullscreenchange", f); };
/** t396: global full-screen toggle (⛶ / ✕). Esc exits (browser default); the icon follows the real state. Hidden where the API is missing (iPhone). */
export function FullscreenToggle({ className = "" }: { className?: string }) {
  const on = useSyncExternalStore(sub, () => !!document.fullscreenElement, () => false);
  const ok = useSyncExternalStore(sub, () => !!document.fullscreenEnabled, () => false);
  if (!ok) return null;
  const go = () => toggleFullscreen();
  return <button type="button" onClick={go} title={on ? "Exit full screen (Esc)" : "Full screen"} aria-label={on ? "Exit full screen" : "Full screen"} aria-pressed={on} data-testid="global-full"
    className={"inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-[#f5c542]/60 bg-white/10 text-base font-bold text-[#f5c542] backdrop-blur hover:bg-[#f5c542]/20 " + className}>{on ? "✕" : "⛶"}</button>;
}

/** t429: small "Focus" pill for every admin / teacher / student page — hides the top bar, menus and tickers (and goes full screen).
 *  While on, a tiny corner pill brings everything back (Esc too). Remembered for the session. */
const FK = "sm-page-focus";
const fl = new Set<() => void>();
const fsub = (f: () => void) => { fl.add(f); return () => { fl.delete(f); }; };
const fget = () => { try { return sessionStorage.getItem(FK) === "1"; } catch { return false; } };
export function setPageFocus(on: boolean) {
  try { if (on) sessionStorage.setItem(FK, "1"); else sessionStorage.removeItem(FK); } catch { /* */ }
  document.documentElement.classList.toggle("page-focus", on);
  if (on && !document.fullscreenElement) document.documentElement.requestFullscreen?.().catch(() => undefined);
  if (!on && document.fullscreenElement) document.exitFullscreen().catch(() => undefined);
  fl.forEach((f) => f());
}
export function FocusPill({ className = "" }: { className?: string }) {
  const on = useSyncExternalStore(fsub, fget, () => false);
  useEffect(() => { document.documentElement.classList.toggle("page-focus", on); if (!on) return; const k = (e: KeyboardEvent) => { if (e.key === "Escape") setPageFocus(false); }; window.addEventListener("keydown", k); return () => window.removeEventListener("keydown", k); }, [on]);
  const ar = typeof document !== "undefined" && document.documentElement.lang === "ar";
  return <>
    <button type="button" onClick={() => setPageFocus(!on)} aria-pressed={on} title={ar ? "وضع التركيز — إخفاء القوائم" : "Focus — hide menus and bars"} data-testid="page-focus"
      className={"inline-flex h-8 shrink-0 items-center gap-1 rounded-full border border-[#f5c542]/60 bg-white/10 px-2.5 text-xs font-extrabold text-[#f5c542] backdrop-blur hover:bg-[#f5c542]/20 " + className}>
      <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2.4" aria-hidden><circle cx="12" cy="12" r="8" /><circle cx="12" cy="12" r="3" /></svg>{ar ? "تركيز" : "Focus"}</button>
    {on && typeof document !== "undefined" && createPortal(<button type="button" onClick={() => setPageFocus(false)} className="page-focus-exit fixed end-3 top-3 z-[4500] inline-flex items-center gap-1.5 rounded-full bg-[#1b3a57]/85 px-3 py-1.5 text-xs font-extrabold text-[#f5c542] shadow-lg ring-1 ring-[#f5c542]/60 backdrop-blur opacity-70 transition hover:opacity-100" data-testid="page-focus-exit">✕ {ar ? "إنهاء التركيز" : "Exit Focus"}</button>, document.body)}
  </>;
}
