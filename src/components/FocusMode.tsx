"use client";
import { useEffect, useSyncExternalStore } from "react";
import { usePathname, useRouter } from "next/navigation";

/**
 * t409: full-screen persistence + activity Focus mode.
 * - `sm-fs` (sessionStorage) remembers that the user chose full screen; it survives in-app navigation and a lost
 *   full screen (reload) shows a one-tap "Return to full screen" pill.
 * - `sm-focus` remembers Focus mode for this session: <html class="focus-mode"> hides every [data-focus-hide]
 *   element (site header/footer, chat bubble, side panels, join strip…), leaving only the activity + timer.
 */
const FS = "sm-fs", FOCUS = "sm-focus";
const ss = { get: (k: string) => { try { return sessionStorage.getItem(k) === "1"; } catch { return false; } }, set: (k: string, on: boolean) => { try { if (on) sessionStorage.setItem(k, "1"); else sessionStorage.removeItem(k); } catch { /* */ } } };
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((f) => f());
const sub = (f: () => void) => { listeners.add(f); document.addEventListener("fullscreenchange", f); return () => { listeners.delete(f); document.removeEventListener("fullscreenchange", f); }; };

/** Ask one element to go full screen (iPad / some smartboard browsers may refuse — caller should apply a CSS fallback). */
export async function requestElFullscreen(el: HTMLElement | null): Promise<boolean> {
  if (!el) return false;
  const req = el.requestFullscreen || (el as HTMLElement & { webkitRequestFullscreen?: () => Promise<void> }).webkitRequestFullscreen;
  if (!req) return false;
  try {
    await req.call(el);
    return document.fullscreenElement === el || !!(el as HTMLElement & { webkitFullscreenElement?: Element }).webkitFullscreenElement;
  } catch {
    return false;
  }
}

export function enterFullscreen() { ss.set(FS, true); emit(); return document.documentElement.requestFullscreen?.().catch(() => undefined); }
export function exitFullscreen() { ss.set(FS, false); emit(); if (document.fullscreenElement) document.exitFullscreen().catch(() => undefined); }
export function toggleFullscreen() { if (document.fullscreenElement) exitFullscreen(); else enterFullscreen(); }
export const useFullscreen = () => useSyncExternalStore(sub, () => !!document.fullscreenElement, () => false);

export const isActivityPath = (p: string) => /^\/(activities\/host|join|lms\/join|activities\/(wheel|randomiser))/.test(p);
export function setFocus(on: boolean, withFullscreen = true) {
  ss.set(FOCUS, on);
  document.documentElement.classList.toggle("focus-mode", on && isActivityPath(location.pathname));
  if (on && withFullscreen) enterFullscreen();
  if (!on && withFullscreen && document.fullscreenElement) exitFullscreen();
  if (!on) {
    try { sessionStorage.removeItem("sm-page-focus"); } catch { /* */ }
    document.documentElement.classList.remove("page-focus");
    window.dispatchEvent(new Event("sm-page-focus-sync"));
  }
  emit();
}
export const useFocus = () => useSyncExternalStore(sub, () => ss.get(FOCUS), () => false);

/** Mounted once (root layout): re-applies Focus mode and offers to return to full screen after a reload. */
export function FullscreenKeeper() {
  const want = useSyncExternalStore(sub, () => ss.get(FS), () => false);
  const on = useFullscreen();
  const path = usePathname();
  const router = useRouter();
  useEffect(() => {
    pushFn = (u) => router.push(u);
    // Same-origin links navigate client-side so full screen is not lost.
    const click = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const a = (e.target as HTMLElement)?.closest?.("a");
      if (!a || !a.href || a.target || a.hasAttribute("download") || a.dataset.reload !== undefined) return;
      const u = new URL(a.href, location.href);
      if (u.origin !== location.origin || !/^\/(lms|admin|activities|assessments|join)/.test(u.pathname)) return;
      if (u.pathname === location.pathname && u.search === location.search && u.hash) return;
      e.preventDefault();
      router.push(u.pathname + u.search + u.hash);
    };
    document.addEventListener("click", click);
    return () => { document.removeEventListener("click", click); pushFn = null; };
  }, [router]);
  const focus = useFocus();
  // Focus mode only applies on live-activity screens; the choice is remembered for the session.
  useEffect(() => { document.documentElement.classList.toggle("focus-mode", focus && isActivityPath(path || "")); }, [path, focus]);
  useEffect(() => {
    // Esc / browser exit while the page stays loaded = the user's choice to leave full screen.
    const f = () => { if (!document.fullscreenElement && document.visibilityState === "visible") { ss.set(FS, false); emit(); } };
    document.addEventListener("fullscreenchange", f);
    return () => document.removeEventListener("fullscreenchange", f);
  }, []);
  if (!want || on || typeof document === "undefined" || !document.fullscreenEnabled) return null;
  return (
    <div className="fixed inset-x-0 top-14 z-[5000] flex justify-center px-3 pointer-events-none [&>*]:pointer-events-auto" data-testid="fs-return">
      <div className="flex items-center gap-2 rounded-full bg-[#1b3a57] p-1.5 ps-4 text-sm font-bold text-white shadow-2xl ring-2 ring-[#f5c542]">
        <button type="button" onClick={() => enterFullscreen()} className="flex items-center gap-2" data-testid="fs-return-go">⛶ Return to full screen · العودة إلى ملء الشاشة</button>
        <button type="button" onClick={() => { ss.set(FS, false); emit(); }} className="grid h-7 w-7 place-items-center rounded-full bg-white/15" aria-label="Dismiss">✕</button>
      </div>
    </div>
  );
}

/** Focus-mode toggle for the activity toolbars. */
export function FocusToggle({ className = "", label }: { className?: string; label: string }) {
  const on = useFocus();
  return <button type="button" onClick={() => setFocus(!on)} aria-pressed={on} title={label} className={className} data-testid="focus-toggle">🎯 {label}</button>;
}

/** While Focus mode is on: a small corner control (timer if running, exit). Esc also leaves Focus mode. */
export function FocusCorner({ secondsLeft, exitLabel }: { secondsLeft?: number | null; exitLabel: string }) {
  const on = useFocus();
  useEffect(() => {
    if (!on) return;
    const k = (e: KeyboardEvent) => { if (e.key === "Escape") setFocus(false); };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [on]);
  if (!on) return null;
  const t = secondsLeft != null && secondsLeft > 0 ? `${Math.floor(secondsLeft / 60)}:${String(secondsLeft % 60).padStart(2, "0")}` : "";
  return (
    <div className="fixed end-3 top-3 z-[4000] flex items-center gap-1.5 rounded-full bg-[#1b3a57]/80 p-1 text-white shadow-lg backdrop-blur opacity-60 transition hover:opacity-100 focus-within:opacity-100" data-testid="focus-corner">
      {t && <span className={`px-2 font-mono text-lg font-extrabold ${secondsLeft! <= 10 ? "text-rose-300" : "text-[#f5c542]"}`} data-testid="focus-timer">⏱ {t}</span>}
      <button type="button" onClick={() => setFocus(false)} className="grid h-8 w-8 place-items-center rounded-full bg-white/15 text-sm" aria-label={exitLabel} title={`${exitLabel} (Esc)`} data-testid="focus-exit">✕</button>
    </div>
  );
}

/** Student screens: follows the teacher's "push focus mode" switch (full screen needs one tap — the keeper pill offers it). */
export function PushedFocus({ pushed }: { pushed: boolean }) {
  useEffect(() => {
    if (pushed && !ss.get(FOCUS)) { ss.set(FS, true); setFocus(true, false); }
    if (!pushed && ss.get("sm-focus-pushed")) setFocus(false);
    ss.set("sm-focus-pushed", pushed);
  }, [pushed]);
  return null;
}

/** t409: in-app navigation without a full reload (keeps full screen). Falls back to a normal load. */
let pushFn: ((u: string) => void) | null = null;
export function spaNav(url: string) { if (pushFn && url.startsWith("/")) pushFn(url); else window.location.assign(url); }
