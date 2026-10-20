"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { useI18n } from "@/lib/i18n";

type BIP = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: "accepted" | "dismissed" }> };

// One shared install state for every button (header, admin toolbar, mobile menu).
let bip: BIP | null = null;
let installed = false;
const subs = new Set<() => void>();
const emit = () => subs.forEach((f) => f());
let snap = "none";
const compute = () => {
  if (typeof window === "undefined") return "none";
  const standalone = window.matchMedia("(display-mode: standalone)").matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
  if (standalone || installed) return "none";
  if (bip) return "prompt";
  const ios = /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  return ios ? "ios" : "none";
};
const subscribe = (f: () => void) => { subs.add(f); return () => subs.delete(f); };
const getSnap = () => snap;

/**
 * Registers the service worker and listens for the browser's install offer. Renders nothing: the install control is a
 * small icon inside the site header / admin toolbar (InstallAppButton), so it never floats over page content.
 */
export function PwaInstall() {
  useEffect(() => {
    if ("serviceWorker" in navigator && location.protocol === "https:") {
      navigator.serviceWorker.register("/sw.js", { scope: "/" }).then((reg) => {
        document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") reg.update().catch(() => undefined); });
      }).catch(() => undefined);
    }
    const refresh = () => { snap = compute(); emit(); };
    const onBip = (e: Event) => { e.preventDefault(); bip = e as BIP; refresh(); };
    const onInstalled = () => { installed = true; bip = null; refresh(); };
    window.addEventListener("beforeinstallprompt", onBip);
    window.addEventListener("appinstalled", onInstalled);
    refresh();
    return () => { window.removeEventListener("beforeinstallprompt", onBip); window.removeEventListener("appinstalled", onInstalled); };
  }, []);
  return null;
}

/** Small "Install app" control. variant "icon" = round header icon; "row" = labelled button (mobile menus). Hidden when not installable. */
export function InstallAppButton({ className = "", variant = "icon", appName = "Shaiq Muhammad" }: { className?: string; variant?: "icon" | "row"; appName?: string }) {
  const mode = useSyncExternalStore(subscribe, getSnap, () => "none");
  const { lang } = useI18n();
  const tr = (en: string, ar: string) => (lang === "ar" ? ar : en);
  const [hint, setHint] = useState(false);
  const box = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    if (!hint) return;
    const off = (e: Event) => { if (box.current && !box.current.contains(e.target as Node)) setHint(false); };
    document.addEventListener("pointerdown", off);
    return () => document.removeEventListener("pointerdown", off);
  }, [hint]);
  if (mode === "none") return null;
  const label = tr("Install app", "ثبّت التطبيق");
  const click = async () => {
    if (mode === "prompt" && bip) { await bip.prompt(); const r = await bip.userChoice.catch(() => null); if (r?.outcome === "accepted") installed = true; bip = null; snap = compute(); emit(); }
    else setHint((h) => !h);
  };
  return (
    <span ref={box} className="relative inline-flex">
      <button type="button" onClick={click} title={label} aria-label={label} aria-expanded={mode === "ios" ? hint : undefined} data-testid="pwa-install-btn" className={className}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" className="h-[18px] w-[18px]" aria-hidden><rect x="6" y="2.5" width="12" height="19" rx="2.5" /><path d="M12 7.5v7M9 11.5l3 3 3-3" /><path d="M10.5 18.5h3" /></svg>
        {variant === "row" && <span className="ms-2">{label}</span>}
      </button>
      {hint && (
        <div role="dialog" aria-label={tr("Install on iPhone", "التثبيت على آيفون")} className="absolute end-0 top-full z-[60] mt-2 w-64 rounded-2xl border border-black/10 bg-white p-3 text-start text-sm font-normal text-[#1b2f44] shadow-xl dark:border-white/15 dark:bg-[#10263b] dark:text-white" data-testid="pwa-ios-hint">
          <p className="font-extrabold">{tr(`Install “${appName}”`, `ثبّت «${appName}»`)}</p>
          <ol className="mt-1 list-decimal space-y-0.5 ps-5">
            <li>{tr("Tap the Share button", "اضغط زر المشاركة")} <span aria-hidden className="inline-block rounded border border-current px-1 text-xs">⬆︎</span> {tr("in Safari", "في سفاري")}</li>
            <li>{tr("Choose “Add to Home Screen”", "اختر «إضافة إلى الشاشة الرئيسية»")}</li>
            <li>{tr("Tap “Add”", "اضغط «إضافة»")}</li>
          </ol>
        </div>
      )}
    </span>
  );
}
