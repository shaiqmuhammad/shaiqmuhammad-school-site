"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { MUTE_EVENT, TOAST_EVENT, askSysPermission, isMuted, setMuted, sysState, unlockAudio, type AlertToast, type SysState } from "@/lib/notifyAlerts";

const SHOW_MS = 9000;

/** Pop-up toasts (top corner, a few seconds, tap to open). Mounted once inside the bell; also unlocks sound on the first tap. */
export function NotifyToastHost({ rtl = false, closeLabel }: { rtl?: boolean; closeLabel: string }) {
  const [toasts, setToasts] = useState<(AlertToast & { key: number })[]>([]);
  const seq = useRef(0);
  const drop = useCallback((key: number) => setToasts((t) => t.filter((x) => x.key !== key)), []);

  useEffect(() => {
    const on = (e: Event) => {
      const list = (e as CustomEvent<AlertToast[]>).detail || [];
      const stamped = list.map((t) => ({ ...t, key: ++seq.current }));
      setToasts((cur) => [...cur, ...stamped].slice(-4));
      for (const t of stamped) window.setTimeout(() => drop(t.key), SHOW_MS);
    };
    const unlock = () => unlockAudio();
    window.addEventListener(TOAST_EVENT, on);
    window.addEventListener("pointerdown", unlock, { once: true });
    window.addEventListener("keydown", unlock, { once: true });
    return () => { window.removeEventListener(TOAST_EVENT, on); window.removeEventListener("pointerdown", unlock); window.removeEventListener("keydown", unlock); };
  }, [drop]);

  if (!toasts.length || typeof document === "undefined") return null;
  return createPortal(
    <div dir={rtl ? "rtl" : "ltr"} className="pointer-events-none fixed end-3 top-16 z-[2147483001] flex w-[min(22rem,calc(100vw-1.5rem))] flex-col gap-2" data-testid="notify-toasts">
      {toasts.map((t) => (
        <div key={t.key} role="status" aria-live="polite" className="pointer-events-auto flex items-start gap-2 rounded-2xl border-s-4 border-[#f5c542] bg-[#1b3a57] p-3 text-white shadow-2xl" data-testid="notify-toast">
          <a
            href={t.href}
            className="flex min-w-0 flex-1 items-start gap-2 rounded-lg text-start focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#f5c542]"
            onClick={(e) => { if (t.onClick) { e.preventDefault(); t.onClick(); } drop(t.key); }}
          >
            <span aria-hidden className="shrink-0 text-lg leading-none">{t.icon}</span>
            <span className="min-w-0 flex-1 break-words" dir="auto">
              <span className="block text-sm font-bold">{t.heading}</span>
              {t.detail ? <span className="mt-0.5 block whitespace-pre-wrap break-words text-xs text-white">{t.detail.slice(0, 140)}</span> : null}
            </span>
          </a>
          <button type="button" className="shrink-0 rounded-full px-2 text-lg leading-none text-white hover:bg-white/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#f5c542]" aria-label={closeLabel} onClick={() => drop(t.key)}>×</button>
        </div>
      ))}
    </div>,
    document.body,
  );
}

/** Sound on/off (remembered in this browser) and the button that asks the browser for pop-up permission — never on load. */
export function NotifyControls({ tr }: { tr: (en: string, ar: string) => string }) {
  const [muted, setM] = useState(() => isMuted()); // only mounted after the bell is opened, so no server render to mismatch
  const [sys, setSys] = useState<SysState>(() => sysState());
  useEffect(() => {
    const sync = () => setM(isMuted());
    window.addEventListener(MUTE_EVENT, sync);
    return () => window.removeEventListener(MUTE_EVENT, sync);
  }, []);
  const btn = "rounded-full border border-black/25 px-2.5 py-1 text-xs font-bold text-heading hover:bg-black/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 dark:border-white/30 dark:hover:bg-white/10";
  return (
    <div className="flex flex-wrap items-center gap-1.5" data-testid="notify-controls">
      <button type="button" className={btn} aria-pressed={muted} onClick={() => { unlockAudio(); setMuted(!muted); }} data-testid="notify-mute">
        {muted ? `🔇 ${tr("Sound off", "الصوت متوقف")}` : `🔊 ${tr("Sound on", "الصوت يعمل")}`}
      </button>
      {sys === "default" && (
        <button type="button" className={btn} onClick={async () => setSys(await askSysPermission())} data-testid="notify-allow">🔔 {tr("Turn on pop-ups", "تفعيل النوافذ المنبثقة")}</button>
      )}
      {sys === "granted" && <span className="text-xs font-semibold text-heading" data-testid="notify-sys-on">✅ {tr("Pop-ups on", "النوافذ المنبثقة تعمل")}</span>}
      {sys === "denied" && <span className="text-xs font-semibold text-heading" data-testid="notify-sys-denied">{tr("Pop-ups blocked in browser settings", "النوافذ المنبثقة محظورة في إعدادات المتصفح")}</span>}
    </div>
  );
}
