"use client";

import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { useI18n } from "@/lib/i18n";

type BIP = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: "accepted" | "dismissed" }> };
const DISMISS_KEY = "sm-install-dismissed";

/**
 * Registers the service worker, and offers a small "Install app" pill (home page and admin only, bottom-left,
 * dismissible for 30 days): Android/desktop Chrome use the native prompt; iPhone/iPad get a Share → Add to Home Screen hint.
 */
export function PwaInstall() {
  const pathname = usePathname() || "";
  const { lang } = useI18n();
  const tr = (en: string, ar: string) => (lang === "ar" ? ar : en);
  const [bip, setBip] = useState<BIP | null>(null);
  const [ios, setIos] = useState(false);
  const [hint, setHint] = useState(false);
  const [hidden, setHidden] = useState(true);

  useEffect(() => {
    if ("serviceWorker" in navigator && location.protocol === "https:") {
      navigator.serviceWorker.register("/sw.js", { scope: "/" }).then((reg) => {
        // Look for a new deploy whenever the app comes back to the foreground.
        const check = () => { if (document.visibilityState === "visible") reg.update().catch(() => undefined); };
        document.addEventListener("visibilitychange", check);
      }).catch(() => undefined);
    }
    const standalone = window.matchMedia("(display-mode: standalone)").matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
    let dismissed = false;
    try { dismissed = Number(localStorage.getItem(DISMISS_KEY) || 0) > Date.now() - 30 * 864e5; } catch { /* ignore */ }
    if (standalone || dismissed) return;
    const isIos = /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
    // eslint-disable-next-line react-hooks/set-state-in-effect -- browser-only detection
    setIos(isIos);
    setHidden(!isIos);
    const onBip = (e: Event) => { e.preventDefault(); setBip(e as BIP); setHidden(false); };
    const onInstalled = () => { setBip(null); setHidden(true); };
    window.addEventListener("beforeinstallprompt", onBip);
    window.addEventListener("appinstalled", onInstalled);
    return () => { window.removeEventListener("beforeinstallprompt", onBip); window.removeEventListener("appinstalled", onInstalled); };
  }, []);

  const admin = pathname === "/admin" || pathname.startsWith("/admin/");
  const spot = pathname === "/" || admin;
  if (hidden || !spot || (!bip && !ios)) return null;
  const dismiss = () => { try { localStorage.setItem(DISMISS_KEY, String(Date.now())); } catch { /* ignore */ } setHidden(true); setHint(false); };
  const name = admin ? "Shaiq Admin" : "Shaiq Muhammad";

  return (
    <div className={`fixed bottom-4 start-4 z-40 flex max-w-[calc(100vw-2rem)] flex-col items-start gap-2 print:hidden ${admin ? "lg:start-72" : ""}`} data-testid="pwa-install">
      {hint && (
        <div role="dialog" aria-label={tr("Install on iPhone", "التثبيت على آيفون")} className="w-72 max-w-full rounded-2xl border border-black/10 bg-white p-3 text-sm text-[#1b2f44] shadow-xl dark:border-white/15 dark:bg-[#10263b] dark:text-white" data-testid="pwa-ios-hint">
          <p className="font-extrabold">{tr(`Install “${name}”`, `ثبّت «${name}»`)}</p>
          <ol className="mt-1 list-decimal space-y-0.5 ps-5">
            <li>{tr("Tap the Share button", "اضغط زر المشاركة")} <span aria-hidden className="inline-block rounded border border-current px-1 text-xs">⬆︎</span> {tr("in Safari", "في سفاري")}</li>
            <li>{tr("Choose “Add to Home Screen”", "اختر «إضافة إلى الشاشة الرئيسية»")}</li>
            <li>{tr("Tap “Add”", "اضغط «إضافة»")}</li>
          </ol>
        </div>
      )}
      <div className="flex items-center gap-1 rounded-full bg-header py-1 pe-1 ps-3 text-sm font-bold text-white shadow-lg ring-1 ring-white/20">
        <button type="button" className="py-1" data-testid="pwa-install-btn" onClick={async () => {
          if (bip) { await bip.prompt(); const r = await bip.userChoice.catch(() => null); if (r?.outcome === "accepted") setHidden(true); setBip(null); }
          else setHint((h) => !h);
        }}>📲 {tr("Install app", "ثبّت التطبيق")}</button>
        <button type="button" onClick={dismiss} className="grid h-7 w-7 place-items-center rounded-full text-white/80 hover:bg-white/15" aria-label={tr("Dismiss", "إغلاق")} data-testid="pwa-install-dismiss">✕</button>
      </div>
    </div>
  );
}
