"use client";

import { useEffect, useMemo, useState } from "react";
import { primaryBtn } from "@/components/assessment/AssessmentShell";
import { useTr, useLmsActor } from "@/components/lms/useLms";
import { lmsApi, lmsErrorText, lmsSession } from "@/lib/lms";
import { getServerSession } from "@/lib/adminServer";
import { SITE_TZ, fmtWhen, zoneLabel, zoneMs, zoneParts } from "@/lib/timeZone";
import { SchedulePreview, Time12Field, TimeZonePicker, useViewerZone } from "@/components/lms/TimeZonePicker";

const DURS = [15, 30, 40, 45, 60, 75, 90, 120];

export function canStartMeeting(): boolean {
  if (typeof window === "undefined") return false;
  if (getServerSession()) return true;
  const u = lmsSession()?.user;
  return !!(u && (u.role === "admin" || (u.perms || []).includes("liveInstant")));
}

export function useCanStartMeeting() {
  const { actor } = useLmsActor();
  if (actor?.role === "student") return false;
  if (actor?.role === "admin" || actor?.id === "admin") return true;
  if (actor && (actor.perms || []).includes("liveInstant")) return true;
  return !actor && !!getServerSession();
}

function joinUrl(token: string) {
  const origin = typeof window !== "undefined" ? window.location.origin : "https://www.shaiqmuhammad.com";
  return `${origin}/lms/live/join?t=${encodeURIComponent(token)}`;
}

function inviteText(title: string, starts: number, lang: string, zone: string, url: string) {
  return `${title}\n${fmtWhen(starts, lang, zone)} (${zoneLabel(zone, starts)})\n${url}`;
}

export function ShareMeeting({
  title, starts, token, roomId, onEnter,
}: {
  title: string; starts: number; token: string; roomId?: string; onEnter?: (roomId: string) => void;
}) {
  const { tr, lang } = useTr();
  const { zone } = useViewerZone();
  const url = joinUrl(token);
  const text = inviteText(title, starts, lang, zone, url);
  const [copied, setCopied] = useState("");
  const copy = async (v: string, kind: string) => {
    try { await navigator.clipboard.writeText(v); setCopied(kind); setTimeout(() => setCopied(""), 2000); } catch { setCopied(""); }
  };
  const share = async () => {
    try {
      if (navigator.share) await navigator.share({ title, text, url });
      else await copy(text, "share");
    } catch { /* cancelled */ }
  };
  const mail = `mailto:?subject=${encodeURIComponent(title)}&body=${encodeURIComponent(text)}`;
  const canShare = typeof navigator !== "undefined" && typeof navigator.share === "function";
  return (
    <div className="space-y-3" data-testid="meet-share">
      <p className="text-sm font-bold opacity-80">{fmtWhen(starts, lang, zone)} · {zoneLabel(zone, starts)}</p>
      <label className="block text-sm font-bold">{tr("Join link", "رابط الانضمام")}
        <input readOnly className="mt-1 w-full rounded-2xl border border-black/10 bg-white px-3 py-2 font-mono text-sm dark:bg-slate-900" value={url} data-testid="meet-link" onFocus={(e) => e.currentTarget.select()} />
      </label>
      <div className="flex flex-wrap gap-2">
        <button type="button" className="rounded-full bg-[#1b3a57] px-4 py-2 text-sm font-bold text-[#f5c542]" onClick={() => void copy(url, "link")} data-testid="meet-copy-link">📋 {copied === "link" ? tr("Copied!", "تم النسخ!") : tr("Copy link", "نسخ الرابط")}</button>
        <button type="button" className="rounded-full bg-black/10 px-4 py-2 text-sm font-bold dark:bg-white/10" onClick={() => void copy(text, "invite")} data-testid="meet-copy-invite">📝 {copied === "invite" ? tr("Copied!", "تم النسخ!") : tr("Copy invite text", "نسخ نص الدعوة")}</button>
        {canShare && <button type="button" className="rounded-full bg-black/10 px-4 py-2 text-sm font-bold dark:bg-white/10" onClick={() => void share()} data-testid="meet-share-btn">📤 {tr("Share", "مشاركة")}</button>}
        <a className="rounded-full bg-black/10 px-4 py-2 text-sm font-bold dark:bg-white/10" href={mail} data-testid="meet-email">✉️ {tr("Email", "بريد")}</a>
        {roomId && onEnter && <button type="button" className={primaryBtn} onClick={() => onEnter(roomId)} data-testid="meet-go">🎥 {tr("Go to meeting", "دخول الاجتماع")}</button>}
      </div>
      <p className="text-xs opacity-70">{tr("Guests and students who open the link wait in the waiting room until you admit them.", "الضيوف والطلاب الذين يفتحون الرابط ينتظرون في غرفة الانتظار حتى تسمح لهم بالدخول.")}</p>
    </div>
  );
}

export function StartMeetingPanel({ asAdmin = false, onEnter, variant = "card" }: { asAdmin?: boolean; onEnter?: (roomId: string) => void; variant?: "card" | "inline" }) {
  const { tr, lang } = useTr();
  const { zone: viewerZone } = useViewerZone(asAdmin);
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<"now" | "sched">("now");
  const [title, setTitle] = useState("");
  const [duration, setDuration] = useState(30);
  const [formTz, setFormTz] = useState(viewerZone || SITE_TZ);
  const later = useMemo(() => zoneParts(Date.now() + 60 * 60_000, formTz), [formTz]);
  const [date, setDate] = useState(later.date);
  const [time, setTime] = useState(later.time);
  useEffect(() => { if (viewerZone) setFormTz(viewerZone); }, [viewerZone]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [done, setDone] = useState<{ title: string; starts: number; token: string; roomId?: string } | null>(null);

  const start = async (now: boolean) => {
    setBusy(true); setErr("");
    try {
      const starts = now ? undefined : zoneMs(date, time, formTz);
      if (!now && !starts) throw new Error("bad_time");
      const r = await lmsApi.liveMeet({ title: title.trim() || undefined, duration, now, starts }, asAdmin);
      setDone({ title: r.title, starts: r.starts, token: r.token, roomId: r.roomId });
    } catch (e) { setErr(lmsErrorText(e, tr)); }
    finally { setBusy(false); }
  };

  if (done) {
    return (
      <div className="rounded-3xl bg-white p-4 shadow-sm ring-1 ring-black/5 dark:bg-slate-800" data-testid="meet-done">
        <h3 className="mb-2 text-lg font-black">✅ {done.title}</h3>
        <ShareMeeting title={done.title} starts={done.starts} token={done.token} roomId={done.roomId} onEnter={onEnter} />
        <button type="button" className="mt-3 text-sm font-bold underline" onClick={() => { setDone(null); setTitle(""); setMode("now"); }}>{tr("Start another", "ابدأ اجتماعاً آخر")}</button>
      </div>
    );
  }

  if (!open && variant === "card") {
    return (
      <button type="button" className="flex w-full items-center gap-3 rounded-3xl bg-gradient-to-r from-fuchsia-400 to-orange-400 px-5 py-4 text-start text-[#1b2f44] shadow-lg transition hover:scale-[1.01]" onClick={() => setOpen(true)} data-testid="meet-open">
        <span className="text-3xl" aria-hidden>🚀</span>
        <span className="min-w-0 flex-1">
          <b className="block text-lg">{tr("Start meeting", "بدء اجتماع")}</b>
          <span className="text-sm font-semibold opacity-80">{tr("Share a link in two taps. Guests wait until you let them in.", "شارك رابطاً بضغطتين. ينتظر الضيوف حتى تسمح لهم.")}</span>
        </span>
      </button>
    );
  }

  return (
    <div className="rounded-3xl bg-white p-4 shadow-sm ring-1 ring-black/5 dark:bg-slate-800" data-testid="meet-panel">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h3 className="text-lg font-black">🚀 {tr("Start meeting", "بدء اجتماع")}</h3>
        {variant === "card" && <button type="button" className="text-sm font-bold opacity-70" onClick={() => setOpen(false)}>{tr("Close", "إغلاق")}</button>}
      </div>
      {err && <p className="mb-2 rounded-2xl bg-rose-100 px-3 py-2 text-sm font-bold text-rose-800 dark:bg-rose-900/60 dark:text-rose-100" role="alert">{err}</p>}
      <label className="mb-3 block text-sm font-bold">{tr("Title (optional)", "العنوان (اختياري)")}
        <input className="mt-1 w-full rounded-2xl border border-black/10 bg-white px-3 py-2 font-semibold dark:bg-slate-900" value={title} onChange={(e) => setTitle(e.target.value)} placeholder={tr("Quick meeting", "اجتماع سريع")} data-testid="meet-title" />
      </label>
      <div className="mb-3 flex flex-wrap gap-2">
        <button type="button" className={`rounded-full px-3 py-1 text-sm font-bold ${mode === "now" ? "bg-emerald-300 text-[#10331c]" : "bg-black/5 dark:bg-white/10"}`} onClick={() => setMode("now")} data-testid="meet-mode-now">{tr("Start now", "ابدأ الآن")}</button>
        <button type="button" className={`rounded-full px-3 py-1 text-sm font-bold ${mode === "sched" ? "bg-emerald-300 text-[#10331c]" : "bg-black/5 dark:bg-white/10"}`} onClick={() => setMode("sched")} data-testid="meet-mode-sched">{tr("Schedule", "جدولة")}</button>
      </div>
      {mode === "sched" && (
        <div className="mb-3 grid gap-3 sm:grid-cols-2">
          <label className="text-sm font-bold">{tr("Date", "التاريخ")}
            <input type="date" className="mt-1 w-full rounded-2xl border border-black/10 bg-white px-3 py-2 font-semibold dark:bg-slate-900" value={date} onChange={(e) => setDate(e.target.value)} />
          </label>
          <label className="text-sm font-bold">{tr("Start time", "وقت البداية")}
            <div className="mt-1"><Time12Field value={time} onChange={setTime} testId="meet-time" /></div>
          </label>
          <label className="text-sm font-bold sm:col-span-2">{tr("Time zone", "المنطقة الزمنية")}
            <div className="mt-1"><TimeZonePicker value={formTz} onChange={setFormTz} id="meet-tz" /></div>
          </label>
          <div className="sm:col-span-2"><SchedulePreview date={date} time={time} tz={formTz} lang={lang} /></div>
        </div>
      )}
      <label className="mb-3 block text-sm font-bold">{tr("Duration", "المدة")}
        <select className="mt-1 w-full max-w-xs rounded-2xl border border-black/10 bg-white px-3 py-2 font-semibold dark:bg-slate-900" value={duration} onChange={(e) => setDuration(Number(e.target.value))} data-testid="meet-mins">
          {DURS.map((d) => <option key={d} value={d}>{d} {tr("minutes", "دقيقة")}</option>)}
        </select>
      </label>
      <button type="button" className={primaryBtn} disabled={busy} onClick={() => void start(mode === "now")} data-testid="meet-go-btn">
        {mode === "now" ? tr("Start now", "ابدأ الآن") : tr("Schedule and get link", "جدولة والحصول على الرابط")}
      </button>
    </div>
  );
}

export function StartMeetingButton({ asAdmin = false, onEnter, compact = false }: { asAdmin?: boolean; onEnter?: (roomId: string) => void; compact?: boolean }) {
  const { tr } = useTr();
  const ok = useCanStartMeeting();
  const [open, setOpen] = useState(false);
  if (!ok) return null;
  return (
    <>
      <button
        type="button"
        className={compact
          ? "rounded-full bg-gradient-to-b from-fuchsia-400 to-orange-400 px-3 py-1.5 text-sm font-extrabold text-[#1b2f44] shadow-sm"
          : "rounded-full bg-gradient-to-b from-fuchsia-400 to-orange-400 px-4 py-2 text-sm font-extrabold text-[#1b2f44] shadow-md"}
        onClick={() => setOpen(true)}
        data-testid="meet-header-btn"
        title={tr("Start meeting", "بدء اجتماع")}
      >
        🚀 {tr("Start meeting", "بدء اجتماع")}
      </button>
      {open && (
        <div className="fixed inset-0 z-[90] flex items-end justify-center bg-black/40 p-3 sm:items-center" onClick={() => setOpen(false)} role="presentation">
          <div className="w-full max-w-lg" onClick={(e) => e.stopPropagation()}>
            <StartMeetingPanel asAdmin={asAdmin} onEnter={(id) => { setOpen(false); onEnter?.(id); }} variant="inline" />
          </div>
        </div>
      )}
    </>
  );
}
