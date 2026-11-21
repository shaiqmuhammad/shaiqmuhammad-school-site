"use client";

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { primaryBtn } from "@/components/assessment/AssessmentShell";
import { useTr, useLmsActor } from "@/components/lms/useLms";
import { lmsApi, lmsErrorText, lmsSession } from "@/lib/lms";
import { getServerSession } from "@/lib/adminServer";
import { SITE_TZ, fmtWhen, zoneLabel, zoneMs, zoneParts } from "@/lib/timeZone";
import { SchedulePreview, Time12Field, TimeZonePicker, useViewerZone } from "@/components/lms/TimeZonePicker";
import { qrImageUrl } from "@/lib/groupSession";
import { classroomJoinUrl } from "@/lib/classroom";

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
  return classroomJoinUrl(token);
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
  const [showQr, setShowQr] = useState(false);
  const qrSrc = qrImageUrl(url, 640);
  const downloadQr = async () => {
    try {
      const r = await fetch(qrSrc);
      const blob = await r.blob();
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = "meeting-qr.png";
      a.click();
      URL.revokeObjectURL(a.href);
    } catch {
      window.open(qrSrc, "_blank", "noopener");
    }
  };
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
        <input readOnly className="lms-field mt-1 w-full rounded-2xl px-3 py-2 font-mono text-sm" value={url} data-testid="meet-link" onFocus={(e) => e.currentTarget.select()} />
      </label>
      <div className="flex flex-wrap gap-2">
        <button type="button" className="rounded-full bg-[#1b3a57] px-4 py-2 text-sm font-bold text-[#f5c542]" onClick={() => void copy(url, "link")} data-testid="meet-copy-link">📋 {copied === "link" ? tr("Copied!", "تم النسخ!") : tr("Copy link", "نسخ الرابط")}</button>
        <button type="button" className="rounded-full bg-black/10 px-4 py-2 text-sm font-bold dark:bg-white/10" onClick={() => void copy(text, "invite")} data-testid="meet-copy-invite">📝 {copied === "invite" ? tr("Copied!", "تم النسخ!") : tr("Copy invite text", "نسخ نص الدعوة")}</button>
        {canShare && <button type="button" className="rounded-full bg-black/10 px-4 py-2 text-sm font-bold dark:bg-white/10" onClick={() => void share()} data-testid="meet-share-btn">📤 {tr("Share", "مشاركة")}</button>}
        <a className="rounded-full bg-black/10 px-4 py-2 text-sm font-bold dark:bg-white/10" href={mail} data-testid="meet-email">✉️ {tr("Email", "بريد")}</a>
        <button type="button" className="rounded-full bg-black/10 px-4 py-2 text-sm font-bold dark:bg-white/10" onClick={() => setShowQr((v) => !v)} data-testid="meet-qr">{showQr ? tr("Hide QR", "إخفاء الرمز") : tr("Show QR", "عرض رمز QR")}</button>
        {roomId && onEnter && <button type="button" className={primaryBtn} onClick={() => onEnter(roomId)} data-testid="meet-go">🎥 {tr("Go to meeting", "دخول الاجتماع")}</button>}
      </div>
      {showQr && (
        <div className="lms-card flex flex-col items-center gap-3 rounded-3xl p-6 ring-1 ring-black/10 dark:ring-white/10" data-testid="meet-qr-panel">
          <p className="text-center text-sm font-bold">{tr("Project this QR so people can join with their camera.", "اعرض هذا الرمز على الشاشة لينضم الآخرون بكاميراتهم.")}</p>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={qrSrc} alt={tr("Join QR code", "رمز QR للانضمام")} width={320} height={320} className="h-auto w-full max-w-xs rounded-2xl bg-white p-2" data-testid="meet-qr-img" />
          <button type="button" className="rounded-full bg-[#1b3a57] px-4 py-2 text-sm font-bold text-[#f5c542]" onClick={() => void downloadQr()} data-testid="meet-qr-download">⬇️ {tr("Download PNG", "تنزيل PNG")}</button>
        </div>
      )}
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
      <div className="lms-card rounded-3xl p-5 shadow-sm ring-1 ring-black/10 dark:ring-white/10" data-testid="meet-done">
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
    <div className="lms-card rounded-3xl p-5 shadow-sm ring-1 ring-black/10 dark:ring-white/10" data-testid="meet-panel">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h3 className="text-lg font-black text-[#1b3a57] dark:text-[#fff8ec]">🚀 {tr("Start meeting", "بدء اجتماع")}</h3>
        {variant === "card" && <button type="button" className="text-sm font-bold text-[#1b3a57]/70 dark:text-[#fff8ec]/70" onClick={() => setOpen(false)}>{tr("Close", "إغلاق")}</button>}
      </div>
      {err && <p className="mb-2 rounded-2xl bg-rose-100 px-3 py-2 text-sm font-bold text-rose-800 dark:bg-rose-900/60 dark:text-rose-100" role="alert">{err}</p>}
      <label className="lms-label">{tr("Meeting title", "عنوان الاجتماع")}
        <input className="lms-field mt-1 w-full rounded-2xl px-3 py-2.5 font-semibold" value={title} onChange={(e) => setTitle(e.target.value)} placeholder={tr("Meeting title", "عنوان الاجتماع")} data-testid="meet-title" />
      </label>
      <div className="mb-4 flex flex-wrap gap-2">
        <button type="button" className={`rounded-full px-4 py-1.5 text-sm font-bold ${mode === "now" ? "lms-toggle-on" : "lms-toggle-off"}`} onClick={() => setMode("now")} data-testid="meet-mode-now">{tr("Start now", "ابدأ الآن")}</button>
        <button type="button" className={`rounded-full px-4 py-1.5 text-sm font-bold ${mode === "sched" ? "lms-toggle-on" : "lms-toggle-off"}`} onClick={() => setMode("sched")} data-testid="meet-mode-sched">{tr("Schedule", "جدولة")}</button>
      </div>
      {mode === "sched" && (
        <div className="mb-3 grid gap-3 sm:grid-cols-2">
          <label className="text-sm font-bold">{tr("Date", "التاريخ")}
            <input type="date" className="lms-field mt-1 w-full rounded-2xl px-3 py-2.5 font-semibold" value={date} onChange={(e) => setDate(e.target.value)} />
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
      <label className="lms-label">{tr("Duration (minutes)", "المدة (بالدقائق)")}
        <select className="lms-field mt-1 w-full max-w-xs rounded-2xl px-3 py-2.5 font-semibold" value={duration} onChange={(e) => setDuration(Number(e.target.value))} data-testid="meet-mins" aria-label={tr("Duration (minutes)", "المدة (بالدقائق)")}>
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
      {open && createPortal(
        <div className="fixed inset-0 z-[90] flex items-end justify-center bg-black/40 p-3 text-[#1b3a57] sm:items-center" onClick={() => setOpen(false)} role="presentation">
          <div className="w-full max-w-lg" onClick={(e) => e.stopPropagation()}>
            <StartMeetingPanel asAdmin={asAdmin} onEnter={(id) => { setOpen(false); onEnter?.(id); }} variant="inline" />
          </div>
        </div>,
        document.body,
      )}
    </>
  );
}
