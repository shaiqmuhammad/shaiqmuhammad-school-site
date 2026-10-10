"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { mailApi } from "@/lib/mail";
import { lmsApi, type Note } from "@/lib/lms";
import { useI18n } from "@/lib/i18n";

const ICON: Record<Note["kind"], string> = { hw_new: "📚", sub_new: "📥", feedback: "💬", feedback_audio: "🎙️", approved: "✅", returned: "↺", graded: "🚦", reminder: "⏰", revise: "🔁", mistakes: "📝", announcement: "📣", message: "💬" };

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
  const [mail, setMail] = useState(0);
  const [open, setOpen] = useState(false);
  const [now, setNow] = useState(0);
  const box = useRef<HTMLDivElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number; right: number; mobile: boolean } | null>(null);

  const load = useCallback(() => {
    if (typeof document !== "undefined" && document.hidden) return;
    lmsApi.notes(asAdmin).then((r) => { setItems(r.items); setUnread(r.unread); setNow(Date.now()); }).catch(() => undefined);
    // Admin: unread contact-form messages + unread emails in contact@ inbox.
    if (asAdmin) Promise.all([mailApi.contacts().then((r) => r.unread).catch(() => 0), mailApi.status().then((r) => r.unread || 0).catch(() => 0)]).then(([a, b]) => setMail(a + b));
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
    const close = (e: MouseEvent | KeyboardEvent) => { if (e instanceof KeyboardEvent ? e.key === "Escape" : !box.current?.contains(e.target as Node) && !panel.current?.contains(e.target as Node)) setOpen(false); };
    const place = () => { const r = box.current?.getBoundingClientRect(); if (r) setPos({ top: r.bottom + 8, left: r.left, right: window.innerWidth - r.right, mobile: window.innerWidth < 640 }); };
    place();
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", close);
    return () => { document.removeEventListener("mousedown", close); document.removeEventListener("keydown", close); window.removeEventListener("resize", place); window.removeEventListener("scroll", place, true); };
  }, [open]);

  const total = unread + (extra?.count || 0) + mail;
  const text = (n: Note) => {
    const t = n.data.title ? `“${n.data.title}”` : "";
    switch (n.kind) {
      case "hw_new": return tr(`New homework: ${t}`, `واجب جديد: ${t}`);
      case "sub_new": return tr(`${n.data.student} handed in ${t}`, `سلّم ${n.data.student} ${t}`);
      case "feedback": return tr(`${n.data.by} commented on ${t}`, `علّق ${n.data.by} على ${t}`);
      case "feedback_audio": return tr(`${n.data.by} sent voice feedback on ${t}`, `أرسل ${n.data.by} تعليقًا صوتيًا على ${t}`);
      case "graded": return n.data.grade === "red" ? tr(`${t}: 🔴 practise again and re-record`, `${t}: 🔴 تدرّب مجددًا وأعد التسجيل`) : tr(`${t}: ${n.data.grade === "green" ? "🟢" : "🟡"} passed — well done!`, `${t}: ${n.data.grade === "green" ? "🟢" : "🟡"} نجحت — أحسنت!`);
      case "reminder": return n.data.overdue ? tr(`${t} is overdue — hand it in soon`, `${t} متأخر — سلّمه قريبًا`) : tr(`${t} is due within 24 hours`, `موعد تسليم ${t} خلال 24 ساعة`);
      case "revise": return tr(`Time to revise ${t}`, `حان وقت مراجعة ${t}`);
      case "mistakes": return tr(`${n.data.by} marked ${n.data.count} word(s) to fix in ${t}`, `حدّد ${n.data.by} ${n.data.count} كلمة للتصحيح في ${t}`);
      case "announcement": return tr(`Announcement: ${t}`, `إعلان: ${t}`);
      case "message": return tr(`New message from ${n.data.by}`, `رسالة جديدة من ${n.data.by}`);
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
  const href = (n: Note) => (n.kind === "message" ? (asAdmin ? "/admin#messages" : "/lms/messages") : n.kind === "announcement" && !asAdmin ? "/lms" : asAdmin ? "/admin#lmshw" : n.kind === "revise" ? "/lms#revision" : n.data.hw ? `/lms/homework?id=${encodeURIComponent(n.data.hw)}` : "/lms");
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
      {open && pos && createPortal(
        // Portal on <body> with a top-layer z-index so page headers, drawers and sliders never cover it; full-width sheet on phones.
        <div ref={panel} dir={ar ? "rtl" : "ltr"} style={pos.mobile ? { top: pos.top } : ar ? { top: pos.top, left: Math.max(8, pos.left) } : { top: pos.top, right: Math.max(8, pos.right) }} className={`fixed z-[2147483000] overflow-hidden ${pos.mobile ? "inset-x-2 rounded-2xl" : "w-80 rounded-2xl"} border border-black/10 bg-white text-start text-sm text-heading shadow-2xl dark:border-white/15 dark:bg-[#13202e] dark:text-white`} role="dialog" aria-label={tr("Notifications", "الإشعارات")} data-testid={`${testId}-panel`}>
          <p className="border-b border-black/5 px-4 py-2.5 font-bold dark:border-white/10">{tr("Notifications", "الإشعارات")}</p>
          <ul className="max-h-[min(24rem,70vh)] overflow-y-auto">
            {extra && extra.count > 0 && (
              <li>
                <button type="button" className="flex w-full items-start gap-2 bg-amber-50 px-4 py-2.5 text-start hover:bg-amber-100 dark:bg-amber-900/30" onClick={() => { setOpen(false); extra.onClick(); }} data-testid={`${testId}-extra`}>
                  <span aria-hidden>🗨️</span><span className="font-semibold">{extra.label}</span>
                </button>
              </li>
            )}
            {mail > 0 && (
              <li>
                <a href="/admin#mail" className="flex w-full items-start gap-2 bg-sky-50 px-4 py-2.5 text-start font-semibold hover:bg-sky-100 dark:bg-sky-900/30" onClick={() => { setOpen(false); window.dispatchEvent(new HashChangeEvent("hashchange")); }} data-testid={`${testId}-mail`}>
                  <span aria-hidden>✉️</span><span>{tr(`${mail} unread message${mail === 1 ? "" : "s"} (email / contact form)`, `${mail} رسالة غير مقروءة (البريد / نموذج التواصل)`)}</span>
                </a>
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
            {!items.length && !mail && !(extra && extra.count > 0) && <li className="px-4 py-6 text-center opacity-60">{tr("Nothing new.", "لا جديد.")}</li>}
          </ul>
        </div>,
        document.body,
      )}
    </div>
  );
}
