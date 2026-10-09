"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { lmsApi, type Note } from "@/lib/lms";
import { useI18n } from "@/lib/i18n";

const ICON: Record<Note["kind"], string> = { hw_new: "📚", sub_new: "📥", feedback: "💬", feedback_audio: "🎙️", approved: "✅", returned: "↺", graded: "🚦" };

/**
 * Notification bell with dropdown. Students: new homework, feedback, approved, try again. Teachers: new submissions.
 * Admin (asAdmin): new submissions + the forum queue as an extra row. Polls every 60 s; opening marks everything read.
 */
export function LmsBell({ asAdmin = false, variant = "navy", extra, testId = "lms-bell" }: { asAdmin?: boolean; variant?: "glass" | "navy"; extra?: { count: number; label: string; onClick: () => void }; testId?: string }) {
  const { lang } = useI18n();
  const ar = lang === "ar";
  const tr = (en: string, a: string) => (ar ? a : en);
  const [items, setItems] = useState<Note[]>([]);
  const [unread, setUnread] = useState(0);
  const [open, setOpen] = useState(false);
  const [now, setNow] = useState(0);
  const box = useRef<HTMLDivElement>(null);

  const load = useCallback(() => {
    if (typeof document !== "undefined" && document.hidden) return;
    lmsApi.notes(asAdmin).then((r) => { setItems(r.items); setUnread(r.unread); setNow(Date.now()); }).catch(() => undefined);
  }, [asAdmin]);
  useEffect(() => {
    load();
    const t = setInterval(load, 60_000);
    const vis = () => { if (!document.hidden) load(); };
    document.addEventListener("visibilitychange", vis);
    return () => { clearInterval(t); document.removeEventListener("visibilitychange", vis); };
  }, [load]);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent | KeyboardEvent) => { if (e instanceof KeyboardEvent ? e.key === "Escape" : !box.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", close);
    return () => { document.removeEventListener("mousedown", close); document.removeEventListener("keydown", close); };
  }, [open]);

  const total = unread + (extra?.count || 0);
  const text = (n: Note) => {
    const t = n.data.title ? `“${n.data.title}”` : "";
    switch (n.kind) {
      case "hw_new": return tr(`New homework: ${t}`, `واجب جديد: ${t}`);
      case "sub_new": return tr(`${n.data.student} handed in ${t}`, `سلّم ${n.data.student} ${t}`);
      case "feedback": return tr(`${n.data.by} commented on ${t}`, `علّق ${n.data.by} على ${t}`);
      case "feedback_audio": return tr(`${n.data.by} sent voice feedback on ${t}`, `أرسل ${n.data.by} تعليقًا صوتيًا على ${t}`);
      case "graded": return n.data.grade === "red" ? tr(`${t}: 🔴 practise again and re-record`, `${t}: 🔴 تدرّب مجددًا وأعد التسجيل`) : tr(`${t}: ${n.data.grade === "green" ? "🟢" : "🟡"} passed — well done!`, `${t}: ${n.data.grade === "green" ? "🟢" : "🟡"} نجحت — أحسنت!`);
      case "approved": return tr(`${t} was approved`, `تم قبول ${t}`);
      case "returned": return tr(`${t}: please try again`, `${t}: حاول مرة أخرى`);
    }
  };
  const ago = (ts: number) => {
    const m = Math.round((now - ts) / 60000);
    if (m < 1) return tr("now", "الآن");
    if (m < 60) return tr(`${m} min ago`, `قبل ${m} د`);
    const h = Math.round(m / 60);
    return h < 24 ? tr(`${h} h ago`, `قبل ${h} س`) : new Date(ts).toLocaleDateString(ar ? "ar" : "en-GB", { day: "numeric", month: "short" });
  };
  const href = (n: Note) => (asAdmin ? "/admin#lmshw" : n.data.hw ? `/lms/homework?id=${encodeURIComponent(n.data.hw)}` : "/lms");
  const label = total ? tr(`${total} new notifications`, `${total} إشعارات جديدة`) : tr("Notifications", "الإشعارات");
  const btn = `relative inline-flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-full transition focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary/30 ${variant === "navy" ? "pill-on-navy !p-0" : "glass text-heading hover:ring-2 hover:ring-[var(--yellow-border)]"}`;

  return (
    <div className="relative" ref={box}>
      <button
        type="button"
        className={btn}
        title={label}
        aria-label={label}
        aria-expanded={open}
        aria-haspopup="true"
        data-testid={testId}
        onClick={() => {
          const next = !open;
          setOpen(next);
          if (next && unread) {
            setUnread(0);
            lmsApi.notesRead(undefined, asAdmin).catch(() => undefined);
          }
        }}
      >
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4" aria-hidden>
          <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
          <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
        </svg>
        {total > 0 && (
          <span data-testid={`${testId}-badge`} className="absolute -end-1.5 -top-1.5 inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-rose-600 px-1 text-[10px] font-extrabold leading-none text-white ring-2 ring-white dark:ring-navy">
            {total > 99 ? "99+" : total}
          </span>
        )}
      </button>
      {open && (
        <div className="absolute end-0 top-full z-50 mt-2 w-80 max-w-[calc(100vw-1.5rem)] overflow-hidden rounded-2xl border border-black/10 bg-white text-start text-sm text-heading shadow-2xl dark:border-white/15 dark:bg-[#13202e] dark:text-white" role="dialog" aria-label={tr("Notifications", "الإشعارات")} data-testid={`${testId}-panel`}>
          <p className="border-b border-black/5 px-4 py-2.5 font-bold dark:border-white/10">{tr("Notifications", "الإشعارات")}</p>
          <ul className="max-h-96 overflow-y-auto">
            {extra && extra.count > 0 && (
              <li>
                <button type="button" className="flex w-full items-start gap-2 bg-amber-50 px-4 py-2.5 text-start hover:bg-amber-100 dark:bg-amber-900/30" onClick={() => { setOpen(false); extra.onClick(); }} data-testid={`${testId}-extra`}>
                  <span aria-hidden>🗨️</span><span className="font-semibold">{extra.label}</span>
                </button>
              </li>
            )}
            {items.map((n) => (
              <li key={n.id}>
                <a href={href(n)} className={`flex items-start gap-2 px-4 py-2.5 hover:bg-black/5 dark:hover:bg-white/5 ${n.read ? "" : "bg-sky-50 font-semibold dark:bg-sky-900/30"}`} onClick={() => setOpen(false)} data-testid={`${testId}-item`}>
                  <span aria-hidden>{ICON[n.kind] || "🔔"}</span>
                  <span className="min-w-0 flex-1" dir="auto">{text(n)}</span>
                  <span className="shrink-0 text-xs opacity-60">{ago(n.created)}</span>
                </a>
              </li>
            ))}
            {!items.length && !(extra && extra.count > 0) && <li className="px-4 py-6 text-center opacity-60">{tr("Nothing new.", "لا جديد.")}</li>}
          </ul>
        </div>
      )}
    </div>
  );
}
