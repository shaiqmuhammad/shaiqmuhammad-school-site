"use client";

import { clsCmp } from "@/lib/classSort";
import { SubjectPick, teacherSubjects } from "@/components/lms/SubjectPick";
import { useCallback, useEffect, useMemo, useState } from "react";
import { lmsSession } from "@/lib/lms";
import { AssessmentShell } from "@/components/assessment/AssessmentShell";
import { LmsStaffToolbar } from "@/components/lms/LmsEntry";
import { useLmsActor, useTr } from "@/components/lms/useLms";
import { modCall, modErr, pdfTable } from "@/lib/lmsMods";
import { classLabel } from "@/lib/classLabel";
import { RosterPicker, rosterIds, useRosterData } from "@/components/lms/ClassLaunch";
import { qrImageUrl } from "@/lib/groupSession";
import { siteOrigin } from "@/lib/siteOrigin";
import { ttGridDocx, ttGridPdf, ttGridXlsx, type TtGrid } from "@/lib/ttPrint";

export type TtRow = { id: string; dow: number; period: string; cls: string; sections: string[]; teacher: string; teacherName: string; subject: string; phase: string; dept: string; s?: string; e?: string; color?: string; title?: string; obs?: string };
export type TtShare = { id: string; by: string; byName: string; title: string; rows: TtRow[]; n: number; mine: boolean; at: number };
/** t317: a lesson's own times win over its period's saved times. */
export const seOf = (r: TtRow, times: Record<string, { s: string; e: string }>) => ({ s: r.s || times[r.period]?.s || "", e: r.e || times[r.period]?.e || "" });
export const SWATCHES = ["#bae6fd", "#fde68a", "#bbf7d0", "#ddd6fe", "#fecdd3", "#a5f3fc", "#fed7aa", "#e5e7eb"];
export type TtData = {
  times: Record<string, { s: string; e: string }>; timetable: TtRow[]; now: { dow: number; hm: string; period: string }; current: TtRow | null;
  teachers: { id: string; name: string; subject: string; phase: string }[]; catalog: { subjects: string[]; classes: { id: string; name: string; sections: string[] }[] };
  phases: string[]; depts: string[]; acc: { show: boolean; view: boolean; add: boolean; edit: boolean; delete: boolean; share?: boolean; xlsx?: boolean; pdf?: boolean; peers?: boolean; compare?: boolean; observe?: boolean; cover?: boolean }; lead: number; shared?: TtShare[];
  secMap?: Record<string, string[]>; peers?: { id: string; name: string; same: boolean }[]; obs?: TtObs[];
  covers?: { id: string; day: string; dow: number; absent: string; absentName: string; cover: string; coverName: string; s: string; e: string; cls: string; subject: string }[];
  staff?: { id: string; name: string; phase: string; subjects: string[]; depts: string[]; classes: string[] }[];
  scope?: { phase: string; depts: string[]; subjects: string[]; classes: string[] } | null;
};
export type TtObs = { id: string; req: string; reqName: string; target: string; targetName: string; day: string; dow: number; s: string; e: string; cls: string; subject: string; note: string; status: string };
export const DOW: [string, string][] = [["Sun", "الأحد"], ["Mon", "الاثنين"], ["Tue", "الثلاثاء"], ["Wed", "الأربعاء"], ["Thu", "الخميس"], ["Fri", "الجمعة"], ["Sat", "السبت"]];
const PIDS = ["P1", "P2", "P3", "P4", "P5", "P6", "P7", "P8"];
export const pidLabel = (pid: string, tr: (en: string, ar: string) => string) => {
  if (/^P\d+$/.test(pid)) return tr(`Period ${pid.slice(1)}`, `الحصة ${pid.slice(1)}`);
  if (/^D\d+$/.test(pid)) return tr(`Duty ${pid.slice(1)}`, `مناوبة ${pid.slice(1)}`);
  return pid;
};
const dutyKeys = (times: Record<string, unknown>) => Object.keys(times).filter((k) => /^D\d+$/.test(k)).sort((a, b) => Number(a.slice(1)) - Number(b.slice(1)));
const periodIds = (times: Record<string, unknown> = {}) => [...PIDS, ...dutyKeys(times)];
const card = "rounded-3xl bg-white/85 p-4 shadow-sm ring-1 ring-black/5 dark:bg-white/5 dark:ring-white/10";
const fld = "w-full rounded-xl border border-black/10 bg-white px-3 py-2 text-sm dark:border-white/15 dark:bg-white/5";
const pill = "rounded-full border border-black/10 px-3 py-1.5 text-sm font-bold dark:border-white/15";
const TONES = ["from-sky-100 to-sky-200", "from-amber-100 to-amber-200", "from-emerald-100 to-emerald-200", "from-violet-100 to-violet-200", "from-rose-100 to-rose-200", "from-cyan-100 to-cyan-200"];
const tone = (s: string) => { let h = 0; for (const c of s) h = (h * 31 + c.charCodeAt(0)) >>> 0; return TONES[h % TONES.length]; };
let SECMAP: Record<string, string[]> = {};
/** t393: 12-hour times, e.g. "8:30 AM". */
export const h12 = (hm?: string) => { if (!hm) return ""; const [h, m] = hm.split(":").map(Number); return `${((h + 11) % 12) + 1}:${String(m).padStart(2, "0")} ${h < 12 ? "AM" : "PM"}`; };
const toM = (hm: string) => { const [h, m] = (hm || "0:0").split(":").map(Number); return (h || 0) * 60 + (m || 0); };
const toHM = (m: number) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
const durMin = (t: { s: string; e: string }) => Math.max(15, (toM(t.e) - toM(t.s)) || 45);
const span12 = (t: { s: string; e: string }) => (t.s ? `${h12(t.s)} – ${h12(t.e)}` : "");
const secTxt = (r: TtRow) => classLabel(r.cls, r.sections, SECMAP[r.cls] || []);
/** t405: event title shown at the same size as the class label (only when it differs from it). */
const ttlOf = (r: TtRow) => (!r.obs && r.title && r.title !== secTxt(r) ? r.title : "");
/** t384: approved observations shown as extra (read-only) rows on both teachers' timetables. */
const obsRows = (obs: TtObs[] | undefined, me: string, tr: (en: string, ar: string) => string): TtRow[] => (obs || []).filter((o) => o.status === "approved").map((o) => ({ id: "obs-" + o.id + "-" + (o.req === me ? "r" : "t"), dow: o.dow, period: "", cls: o.cls, sections: [], teacher: o.req === me ? o.req : o.target, teacherName: "", subject: o.subject, phase: "", dept: "", s: o.s, e: o.e, color: "#fef3c7", title: o.req === me ? tr(`👀 Observing ${o.targetName} (${o.day})`, `👀 ملاحظة ${o.targetName} (${o.day})`) : tr(`👀 Observed by ${o.reqName} (${o.day})`, `👀 ملاحظة من ${o.reqName} (${o.day})`), obs: o.id }));
const nextDate = (dow: number) => { const d = new Date(Date.now() + 4 * 3600e3); const add = (dow - d.getUTCDay() + 7) % 7 || 7; return new Date(d.getTime() + add * 864e5).toISOString().slice(0, 10); };
/** t384: colourful glass strip of one day's lessons (dashboard, teacher and student areas; light and dark mode). */
export function GlassStrip({ rows, times, now, dow, onPick, testId = "tt-strip", empty, onEdit, onDel, canEdit, canDel }: { rows: TtRow[]; times: TtData["times"]; now: TtData["now"]; dow: number; onPick?: (r: TtRow) => void; testId?: string; empty?: string; onEdit?: (r: TtRow) => void; onDel?: (r: TtRow) => void; canEdit?: boolean; canDel?: boolean }) {
  const { tr } = useTr();
  const list = rows.filter((r) => r.dow === dow).sort((a, b) => (seOf(a, times).s || a.period).localeCompare(seOf(b, times).s || b.period));
  return (
    <div className="relative overflow-hidden rounded-3xl bg-gradient-to-r from-sky-300/60 via-fuchsia-300/50 to-amber-200/60 p-2 dark:from-[#1b3a57] dark:via-[#24476b] dark:to-[#3a3216]" data-testid={testId}>
      {!list.length ? <p className="rounded-2xl bg-white/70 px-3 py-3 text-sm font-semibold text-[#1b2f44] backdrop-blur" data-testid="tt-strip-none">{empty || tr("No lessons on this day 🎉", "لا توجد حصص في هذا اليوم 🎉")}</p> : (
        <ol className="flex gap-2 overflow-x-auto pb-1">
          {list.map((r) => { const t = seOf(r, times); const isToday = dow === now.dow; const live = isToday && !!t.s && t.s <= now.hm && now.hm < t.e; const past = isToday && !!t.e && t.e <= now.hm; const left = live ? Math.max(0, toM(t.e) - toM(now.hm)) : 0; const w = Math.min(22, Math.max(10, durMin(t) / 4)); const locked = !!r.obs || String(r.id).startsWith("cover-"); return (
            <li key={r.id} className={`shrink-0 rounded-2xl border border-white/60 bg-white/65 px-3 py-2 text-[#1b2f44] shadow-lg backdrop-blur-md ${live ? "ring-4 ring-emerald-400" : ""} ${past ? "opacity-55" : ""}`} style={{ minWidth: `${w}rem`, backgroundImage: `linear-gradient(135deg, ${r.color || "#ffffffcc"}cc, #ffffffaa)` }} data-testid="tt-strip-item"
              onContextMenu={(e) => { if (!canEdit || locked) return; e.preventDefault(); onEdit?.(r); }}
              onDoubleClick={() => { if (canEdit && !locked) onEdit?.(r); }}>
              <p className="text-xs font-extrabold">{r.period ? `${pidLabel(r.period, tr)} · ` : ""}{span12(t)}{live ? ` · ${tr("Now", "الآن")} · ${left}${tr("m left", " د متبقية")}` : ""}</p>
              <p className="text-[21px] font-black leading-tight" dir="auto">{r.obs ? r.title : secTxt(r) || r.title}</p>
              {ttlOf(r) && secTxt(r) && <p className="text-[21px] font-black leading-tight" dir="auto" data-testid="tt-title">{ttlOf(r)}</p>}
              <p className="text-xs opacity-80" dir="auto">{[r.teacherName, r.subject].filter(Boolean).join(" · ")}</p>
              {(canEdit || canDel) && !locked && <p className="mt-1 flex gap-1">{canEdit && <button type="button" className="rounded-full bg-white/80 px-1.5 text-xs" onClick={() => onEdit?.(r)} aria-label={tr("Edit", "تعديل")} data-testid="tt-edit">✎</button>}{canDel && <button type="button" className="rounded-full bg-white/80 px-1.5 text-xs" onClick={() => onDel?.(r)} aria-label={tr("Delete", "حذف")} data-testid="tt-del">🗑</button>}</p>}
              {onPick && <button type="button" className="mt-1 rounded-full bg-[#1b3a57] px-2 py-0.5 text-[11px] font-bold text-[#f5c542]" onClick={() => onPick(r)} data-testid="tt-obs-ask">👀 {tr("Request to observe", "طلب ملاحظة")}</button>}
            </li>); })}
        </ol>)}
    </div>
  );
}


/** t433: school-day hour timeline — duration-sized events, period bands, now line, scroll to current hour. */
function DayTimeline({ rows, times, now, dow, onEdit, onDel, canEdit, canDel, studentsOf }: { rows: TtRow[]; times: TtData["times"]; now: TtData["now"]; dow: number; onEdit?: (r: TtRow) => void; onDel?: (r: TtRow) => void; canEdit?: boolean; canDel?: boolean; studentsOf?: (r: TtRow) => number }) {
  const { tr } = useTr();
  const [el, setEl] = useState<HTMLDivElement | null>(null);
  const START = 0, END = 24, PX = 52;
  const list = rows.filter((r) => r.dow === dow).sort((a, b) => (seOf(a, times).s || "").localeCompare(seOf(b, times).s || ""));
  const isToday = dow === now.dow;
  const nowTop = (toM(now.hm) / 60 - START) * PX;
  useEffect(() => {
    if (!el) return;
    const hour = isToday ? toM(now.hm) / 60 : 7;
    el.scrollTop = Math.max(0, hour * PX - 120);
  }, [el, dow, isToday, now.hm]);
  const periods = Object.entries(times).filter(([, tm]) => tm.s && tm.e);
  return (
    <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-[#1b3a57]/10 to-amber-100/40 ring-1 ring-black/5 dark:from-[#1b3a57]/40 dark:to-[#3a3216]/30" data-testid="tt-timeline">
      <div ref={setEl} className="max-h-[70vh] overflow-y-auto px-2 py-2">
        <div className="relative ms-14" style={{ height: (END - START) * PX }}>
          {Array.from({ length: END - START + 1 }, (_, i) => START + i).map((h) => (
            <div key={h} className="absolute inset-x-0 border-t border-black/10 dark:border-white/10" style={{ top: (h - START) * PX }}>
              <span className="absolute -start-14 w-12 -translate-y-1/2 text-end text-[11px] font-bold opacity-60">{h12(`${String(h).padStart(2, "0")}:00`)}</span>
            </div>
          ))}
          {periods.map(([pid, tm]) => {
            const top = (toM(tm.s) / 60 - START) * PX, h = Math.max(8, ((toM(tm.e) - toM(tm.s)) / 60) * PX);
            return <div key={pid} className="pointer-events-none absolute inset-x-0 rounded-lg bg-[#f5c542]/15" style={{ top, height: h }} data-testid="tt-period-band"><span className="absolute start-1 top-0.5 text-[10px] font-extrabold text-[#1b3a57]/70">{pidLabel(pid, tr)}</span></div>;
          })}
          {list.map((r, i) => {
            const tm = seOf(r, times); if (!tm.s || !tm.e) return null;
            const top = (toM(tm.s) / 60 - START) * PX, h = Math.max(28, ((toM(tm.e) - toM(tm.s)) / 60) * PX);
            const live = isToday && tm.s <= now.hm && now.hm < tm.e;
            const left = live ? Math.max(0, toM(tm.e) - toM(now.hm)) : 0;
            const n = studentsOf?.(r);
            const locked = !!r.obs || String(r.id).startsWith("cover-");
            return (
              <div key={r.id} className={`absolute inset-x-0 mx-1 overflow-hidden rounded-xl border border-white/70 px-2 py-1 text-[#1b2f44] shadow-md ${live ? "ring-2 ring-emerald-500" : ""}`}
                style={{ top, height: h, marginInlineStart: `${(i % 3) * 4}px`, background: `linear-gradient(135deg, ${r.color || "#bae6fd"}ee, #ffffffcc)` }} data-testid="tt-tl-event"
                onContextMenu={(e) => { if (!canEdit || locked) return; e.preventDefault(); onEdit?.(r); }}
                onDoubleClick={() => { if (canEdit && !locked) onEdit?.(r); }}>
                <p className="text-[11px] font-extrabold leading-tight">{r.period ? `${pidLabel(r.period, tr)} · ` : ""}{span12(tm)}{live ? ` · ${left}${tr("m left", " د")}` : ""}</p>
                <p className="truncate text-sm font-black" dir="auto">{r.obs ? r.title : secTxt(r) || r.title}</p>
                <p className="truncate text-[11px] opacity-80">{[r.teacherName, r.subject, n ? `${n} 👥` : ""].filter(Boolean).join(" · ")}</p>
                {(canEdit || canDel) && !locked && <p className="absolute end-1 top-1 flex gap-0.5">{canEdit && <button type="button" className="rounded-full bg-white/90 px-1 text-[10px]" onClick={() => onEdit?.(r)} data-testid="tt-edit">✎</button>}{canDel && <button type="button" className="rounded-full bg-white/90 px-1 text-[10px]" onClick={() => onDel?.(r)} data-testid="tt-del">🗑</button>}</p>}
              </div>
            );
          })}
          {isToday && <div className="pointer-events-none absolute inset-x-0 z-20" style={{ top: nowTop }} data-testid="tt-now-line"><div className="h-0.5 bg-rose-500 shadow-[0_0_8px_#f43f5e]" /><span className="absolute -start-14 -translate-y-1/2 rounded-full bg-rose-500 px-1.5 py-0.5 text-[10px] font-bold text-white">{now.hm}</span></div>}
        </div>
      </div>
    </div>
  );
}

export function useTimetable(asAdmin = false) {
  const [d, setD] = useState<TtData | null>(null);
  const [err, setErr] = useState("");
  const { tr } = useTr();
  const load = useCallback(() => modCall<TtData>("att-times", {}, asAdmin).then((x) => { SECMAP = x.secMap || {}; setD(x); setErr(""); }).catch((e) => setErr(modErr(e, tr))), [asAdmin, tr]);
  useEffect(() => { load(); }, [load]);
  return { d, err, load };
}

/** t390: dashboard timetable: Day / Week toggle and Mon–Fri tabs (today first), navy & gold, glass lesson cards. */
export function TtDash({ rows, times, now, testId = "tt-dash" }: { rows: TtRow[]; times: TtData["times"]; now: TtData["now"]; testId?: string }) {
  const { tr } = useTr();
  const [view, setView] = useState<"today" | "day" | "week">("today");
  const [day, setDay] = useState(now.dow >= 1 && now.dow <= 5 ? now.dow : 1);
  const tab = (on: boolean) => `rounded-full px-3 py-1 text-sm font-bold ${on ? "bg-[#f5c542] text-[#1b3a57]" : "text-white/85"}`;
  return (
    <div className="space-y-2" data-testid={testId}>
      <div className="flex flex-wrap items-center gap-2">
        <div className="inline-flex rounded-full bg-[#1b3a57] p-1" role="tablist">{(["today", "day", "week"] as const).map((v) => <button key={v} type="button" role="tab" aria-selected={view === v} className={tab(view === v)} onClick={() => setView(v)} data-testid={`${testId}-view-${v}`}>{v === "today" ? tr("Today", "اليوم") : v === "day" ? tr("Day", "يوم") : tr("Week", "أسبوع")}</button>)}</div>
        {view === "day" && <div className="inline-flex flex-wrap rounded-full bg-[#1b3a57] p-1">{[1, 2, 3, 4, 5].map((x) => <button key={x} type="button" aria-pressed={day === x} className={tab(day === x)} onClick={() => setDay(x)} data-testid={`${testId}-day-${x}`}>{tr(DOW[x][0], DOW[x][1])}{x === now.dow ? " •" : ""}</button>)}</div>}
      </div>
      {view === "today" ? <GlassStrip rows={rows} times={times} now={now} dow={now.dow} testId={`${testId}-strip`} empty={tr("No events today 🌿 Enjoy your day!", "لا توجد أحداث اليوم 🌿 يومًا سعيدًا!")} /> : view === "day" ? <GlassStrip rows={rows} times={times} now={now} dow={day} testId={`${testId}-strip`} /> : (
        <div className="grid gap-2 overflow-x-auto rounded-3xl bg-gradient-to-r from-sky-300/60 via-fuchsia-300/50 to-amber-200/60 p-2 sm:grid-cols-5 dark:from-[#1b3a57] dark:via-[#24476b] dark:to-[#3a3216]" data-testid={`${testId}-week`}>
          {[1, 2, 3, 4, 5].map((x) => { const l = rows.filter((r) => r.dow === x).sort((a, b) => (seOf(a, times).s || "").localeCompare(seOf(b, times).s || "")); return (
            <div key={x} className="space-y-1.5"><p className={`rounded-full px-2 py-0.5 text-center text-xs font-extrabold ${x === now.dow ? "bg-[#f5c542] text-[#1b3a57]" : "bg-[#1b3a57] text-white"}`}>{tr(DOW[x][0], DOW[x][1])}</p>
              {l.map((r) => <div key={r.id} className="rounded-2xl border border-white/60 bg-white/70 px-2 py-1.5 text-xs text-[#1b2f44] shadow backdrop-blur-md" style={{ backgroundImage: `linear-gradient(135deg, ${r.color || "#ffffffcc"}cc, #ffffffaa)` }} data-testid="tt-week-card"><b className="block">{span12(seOf(r, times))}</b><span className="block text-[14px] font-black leading-tight">{r.obs ? r.title : secTxt(r)}</span>{ttlOf(r) && <span className="block text-[14px] font-black leading-tight" dir="auto" data-testid="tt-title">{ttlOf(r)}</span>}<span className="opacity-80">{[r.teacherName, r.subject].filter(Boolean).join(" · ")}</span></div>)}
              {!l.length && <p className="rounded-2xl bg-white/50 px-2 py-1 text-center text-xs text-[#1b2f44]/70">—</p>}</div>); })}
        </div>)}
    </div>
  );
}

/** t304: "Today's lessons" strip for the top of the dashboard (hidden when there is no timetable or it is switched off). */
export function TodayLessons() {
  const { tr } = useTr();
  const { d, load } = useTimetable(false);
  const { roster } = useRosterData();
  const [cmp, setCmp] = useState(false);
  const me = lmsSession()?.user;
  if (!d || !d.acc.view) return null;
  if (!d.timetable.length && !d.acc.add) return null;
  const rows = [...d.timetable, ...obsRows(d.obs, me?.id || "", tr)];
  const lessons = d.timetable.filter((r) => !String(r.id).startsWith("cover-")).length;
  const duties = d.timetable.filter((r) => !r.cls || /duty|مناوبة/i.test(`${r.title || ""} ${r.subject || ""}`)).length;
  const mySubj = new Set(String((me as { subject?: string } | undefined)?.subject || "").split(",").map((x) => x.trim()).filter(Boolean));
  const studentsInSubj = roster ? new Set(roster.filter((s) => d.timetable.some((r) => r.cls === s.cls && (!mySubj.size || mySubj.has(r.subject)))).map((s) => s.id)).size : 0;
  return (
    <section className={card + " !p-3"} data-testid="today-lessons">
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <h2 className="text-base font-extrabold">🗓️ {tr("Today's lessons", "حصص اليوم")}</h2>
        <span className="text-xs opacity-60">{tr(DOW[d.now.dow][0], DOW[d.now.dow][1])} · {d.now.hm}</span>
        <span className="rounded-full bg-[#1b3a57]/10 px-2 py-0.5 text-xs font-bold" data-testid="tt-stat-lessons">{lessons} {tr("lessons", "حصة")}</span>
        <span className="rounded-full bg-[#1b3a57]/10 px-2 py-0.5 text-xs font-bold" data-testid="tt-stat-students">{studentsInSubj} {tr("students", "طالب")}</span>
        <span className="rounded-full bg-[#1b3a57]/10 px-2 py-0.5 text-xs font-bold" data-testid="tt-stat-duties">{duties} {tr("duties", "مناوبة")}</span>
        <span className="flex-1" />
        {d.acc.add && <a href="/lms/timetable?new=1" className="rounded-full bg-sun px-3 py-1 text-xs font-bold text-[#0b1b2b]" data-testid="tt-dash-add">+ {tr("Add event", "إضافة حدث")}</a>}
        {d.acc.compare && !!d.peers?.length && <button type="button" className="rounded-full bg-[#1b3a57] px-3 py-1 text-xs font-bold text-[#f5c542]" onClick={() => setCmp(!cmp)} data-testid="tt-dash-compare">⚖️ {tr("Compare", "مقارنة")}</button>}
        {!!d.peers?.length && (d.acc.peers || d.acc.observe) && (
          <select className={fld + " !w-auto !py-1 text-xs"} defaultValue="" onChange={(e) => { if (e.target.value) location.href = `/lms/timetable?src=${e.target.value}`; }} aria-label={tr("Other teachers", "معلمون آخرون")} data-testid="tt-dash-peers">
            <option value="">{tr("Other teachers", "معلمون آخرون")}</option>
            {d.peers.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        )}
        {d.acc.observe && <a href="/lms/timetable?obs=1" className="rounded-full bg-[#f5c542] px-3 py-1 text-xs font-bold text-[#1b3a57]" data-testid="tt-dash-obs">👀 {tr("Peer observation", "ملاحظة زميل")}</a>}
        <a href="/lms/timetable?year=1" className="rounded-full bg-[#1b3a57] px-3 py-1 text-xs font-bold text-[#f5c542]" data-testid="tt-dash-year">📅 {tr("Year calendar", "التقويم السنوي")}</a>
        {d.acc.cover && <a href="/lms/timetable?cover=1" className="rounded-full bg-rose-100 px-3 py-1 text-xs font-bold text-rose-900" data-testid="tt-dash-cover">🛟 {tr("Assign Cover", "تعيين احتياط")}</a>}
        <a href="/lms/timetable" className="rounded-full border border-black/10 px-3 py-1 text-xs font-bold" data-testid="tt-dash-dl">⬇️ {tr("Download", "تنزيل")}</a>
      </div>
      <div className="mb-2"><LeadPicker d={d} asAdmin={false} onSaved={load} /></div>
      {cmp && <ComparePanel d={d} asAdmin={false} />}
      <TtDash rows={rows} times={d.times} now={d.now} testId="today-list" />
    </section>
  );
}

/** Reminder setting (minutes before each lesson; 0 = off). Push delivery uses the Push notifications switches in My account. */
function LeadPicker({ d, asAdmin, onSaved }: { d: TtData; asAdmin: boolean; onSaved: () => void }) {
  const { tr } = useTr();
  const [msg, setMsg] = useState("");
  return (
    <label className="flex flex-wrap items-center gap-2 text-sm font-bold" data-testid="tt-lead">🔔 {tr("Remind me before each lesson", "ذكّرني قبل كل حصة")}
      <select className={fld + " !w-auto"} value={d.lead} onChange={async (e) => { try { await modCall("att-times-save", { lead: Number(e.target.value) }, asAdmin); setMsg(tr("Saved", "تم الحفظ")); onSaved(); } catch (er) { setMsg(modErr(er, tr)); } }} data-testid="tt-lead-select">
        {[0, 2, 5, 10, 15, 30].map((n) => <option key={n} value={n}>{n ? tr(`${n} min before`, `قبل ${n} دقائق`) : tr("Off", "إيقاف")}</option>)}
      </select>
      {msg && <span className="text-xs opacity-70" role="status">{msg}</span>}
    </label>
  );
}

type Draft = { title: string; tAuto: boolean; id?: string; dows: number[]; period: string; cls: string; sections: string[]; teacher: string; subject: string; phase: string; dept: string; same: boolean; s: string; e: string; per: Record<number, { s: string; e: string }>; color: string };
const EMPTY: Draft = { title: "", tAuto: true, dows: [1], period: "", cls: "", sections: [], teacher: "", subject: "", phase: "", dept: "", same: true, s: "08:00", e: "08:45", per: {}, color: "" };

/** Full timetable: week grid (or list on phones), filters by phase / department / teacher / subject / class, and add / edit / delete per permission. */
export function TimetableManager({ asAdmin, full = false }: { asAdmin: boolean; full?: boolean }) {
  const { tr } = useTr();
  const { d, err, load } = useTimetable(asAdmin);
  const { roster } = useRosterData(); // t433: student counts in cells
  const [f, setF] = useState({ phase: "", dept: "", teacher: "", subject: "", cls: "", sec: "" });
  const [msg, setMsg] = useState("");
  const [view, setView] = useState<"today" | "day" | "week" | "timeline" | "year">("today");
  const [day, setDay] = useState<number | null>(null);
  const [weekOf, setWeekOf] = useState(() => new Date(Date.now() + 4 * 3600e3).toISOString().slice(0, 10));
  const [coverOpen, setCoverOpen] = useState(false);
  const [src, setSrc] = useState("");
  const [peer, setPeer] = useState<{ rows: TtRow[]; obs: TtObs[] } | null>(null);
  const [cmp, setCmp] = useState(false);
  const me = lmsSession()?.user?.id || "";
  useEffect(() => { if (!src) return; modCall<{ rows: TtRow[]; obs: TtObs[] }>("att-tt-view", { teacher: src }, asAdmin).then(setPeer).catch((e) => { setPeer({ rows: [], obs: [] }); setMsg(modErr(e, tr)); }); }, [src, asAdmin, tr]);
  const [ed, setEd] = useState<Draft | null>(null);
  useEffect(() => {
    if (typeof window === "undefined" || !d) return;
    const q = new URLSearchParams(window.location.search);
    const s = q.get("src"); if (s && !src) setSrc(s);
    if (q.get("cover") === "1" && (asAdmin || d.acc.cover)) setCoverOpen(true);
    if (q.get("year") === "1") setView("year");
    if (q.get("obs") === "1" && !asAdmin && d.acc.observe) { const p = (d.peers || []).find((x) => x.same || d.acc.observe); if (p && !s) setSrc(p.id); setView("day"); setMsg(p ? tr("Choose a colleague above, then press “Request to observe” on a lesson.", "اختر زميلًا أعلاه ثم اضغط «طلب ملاحظة» على حصة.") : tr("No colleagues in your department are available to observe yet.", "لا يوجد زملاء في قسمك متاحون للملاحظة بعد.")); }
    if (q.get("new") === "1" && d.acc.add && !ed) setEd({ ...EMPTY, teacher: asAdmin ? "" : d.teachers[0]?.id || "" });
  }, [d]); // eslint-disable-line react-hooks/exhaustive-deps
  const onTtSubject = useCallback((subject: string) => setEd((e) => (e && e.subject !== subject ? { ...e, subject } : e)), []);
  const base = useMemo(() => (src ? peer?.rows || [] : [...(d?.timetable || []), ...(asAdmin ? [] : obsRows(d?.obs, me, tr))]), [d, src, peer, asAdmin, me, tr]);
  const rows = useMemo(() => base.filter((r) => (!f.phase || r.phase === f.phase) && (!f.dept || r.dept === f.dept) && (!f.teacher || r.teacher === f.teacher) && (!f.subject || r.subject === f.subject) && (!f.cls || r.cls === f.cls) && (!f.sec || !r.sections.length || r.sections.includes(f.sec))), [base, f]);
  const studentsOf = useCallback((r: TtRow) => (!r.cls || !roster) ? 0 : roster.filter((s) => s.cls === r.cls && (!r.sections.length || r.sections.includes(s.section))).length, [roster]);
  if (err) return <p className="rounded-2xl bg-amber-100 px-4 py-3 text-amber-900" data-testid="tt-hidden">{/module_hidden|forbidden/.test(err) ? tr("The timetable is switched off for your account.", "الجدول متوقف لحسابك.") : err}</p>;
  if (!d) return <p className="py-8 text-center opacity-60">{tr("Loading…", "جارٍ التحميل…")}</p>;
  const days = [...new Set([1, 2, 3, 4, 5, ...d.timetable.map((r) => r.dow)])].sort((a, b) => ((a + 6) % 7) - ((b + 6) % 7));
  const uniq = (xs: string[]) => [...new Set(xs.filter(Boolean))].sort();
  const scope = !asAdmin && d.scope ? d.scope : null;
  const subjects = scope ? uniq(scope.subjects) : uniq([...d.catalog.subjects, ...d.timetable.map((r) => r.subject)]);
  const mySubj = teacherSubjects(lmsSession()?.user as never);
  const classes = d.catalog.classes.length ? d.catalog.classes : uniq(d.timetable.map((r) => r.cls)).map((n) => ({ id: n, name: n, sections: [] as string[] }));
  const classOpts = scope ? classes.filter((c) => !scope.classes.length || scope.classes.includes(c.name)) : classes;
  const phaseOpts = scope?.phase ? [scope.phase] : uniq([...d.phases, ...d.timetable.map((r) => r.phase)]);
  const deptOpts = scope ? uniq(scope.depts) : uniq([...d.depts]);
  const ro = !!src; const canAdd = d.acc.add && !ro, canEdit = d.acc.edit && !ro, canDel = d.acc.delete && !ro;
  const dSel = day ?? d.now.dow;
  const autoT = (cls: string, secs: string[]) => classLabel(cls, secs, classes.find((c) => c.name === cls)?.sections || []);
  const save = async () => {
    if (!ed) return;
    const days = ed.dows.map((dow) => ({ dow, ...(ed.same ? { s: ed.s, e: ed.e } : ed.per[dow] || { s: ed.s, e: ed.e }) }));
    if (days.some((x) => !x.s || !x.e || x.s >= x.e)) { setMsg(tr("Choose a start time before the end time for every day.", "اختر وقت بداية قبل النهاية لكل يوم.")); return; }
    const tid = asAdmin ? ed.teacher : (lmsSession()?.user?.id || "");
    const ov = (aS: string, aE: string, bS: string, bE: string) => !!aS && !!aE && !!bS && !!bE && aS < bE && bS < aE;
    if (tid) {
      for (const dd of days) {
        const hit = d.timetable.find((r) => r.teacher === tid && r.id !== ed.id && r.dow === dd.dow && !String(r.id).startsWith("cover-") && !r.obs && ov(seOf(r, d.times).s, seOf(r, d.times).e, dd.s, dd.e));
        if (hit) { setMsg(tr(`This teacher is already busy ${seOf(hit, d.times).s}–${seOf(hit, d.times).e} that day.`, `هذا المعلم مشغول ${seOf(hit, d.times).s}–${seOf(hit, d.times).e} في ذلك اليوم.`)); return; }
      }
    }
    try { await modCall("att-tt-save", { ...ed, period: ed.period || "", title: (ed.tAuto ? "" : ed.title.trim()) || (ed.cls ? autoT(ed.cls, ed.sections) : ed.subject), days }, asAdmin); setMsg(ed.id ? tr("Event updated.", "تم تحديث الحدث.") : tr("Event added.", "تمت إضافة الحدث.")); setEd(null); load(); } catch (e) { const m = String((e as Error).message || e); setMsg(/teacher_busy/.test(m) ? tr("This teacher already has a lesson at that time.", "هذا المعلم لديه حصة في ذلك الوقت.") : modErr(e, tr)); }
  };
  const askObs = async (r: TtRow) => {
    const t = seOf(r, d.times); const date = prompt(tr("Date to observe (YYYY-MM-DD)", "تاريخ الملاحظة (YYYY-MM-DD)"), nextDate(r.dow)); if (!date) return;
    const note = prompt(tr("Note for your colleague (optional)", "ملاحظة لزميلك (اختياري)"), "") || "";
    try { await modCall("att-tt-obs-req", { teacher: src, day: date, s: t.s, e: t.e, cls: secTxt(r), subject: r.subject, note }, asAdmin); setMsg(tr("Request sent — it is added to both timetables once approved.", "تم إرسال الطلب — يُضاف إلى الجدولين بعد الموافقة.")); load(); } catch (e) { setMsg(modErr(e, tr)); }
  };
  const del = async (r: TtRow) => { if (!confirm(tr("Delete this lesson?", "حذف هذه الحصة؟"))) return; try { await modCall("att-tt-del", { id: r.id }, asAdmin); load(); } catch (e) { setMsg(modErr(e, tr)); } };
  const sel = (k: keyof typeof f, label: string, opts: [string, string][], id: string) => (
    <select className={fld + " !w-auto"} value={f[k]} onChange={(e) => setF({ ...f, [k]: e.target.value })} aria-label={label} data-testid={id}><option value="">{label}</option>{opts.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
  );
  const cell = (r: TtRow) => (
    <div key={r.id} style={r.color ? { background: r.color } : undefined} className={`rounded-xl bg-gradient-to-br ${r.color ? "" : tone(r.subject)} px-2 py-1.5 text-start text-xs text-[#1b2f44]`} data-testid="tt-cell">
      <p className="font-extrabold" data-testid="tt-cell-time">{r.period ? `${pidLabel(r.period, tr)} · ` : ""}{span12(seOf(r, d.times))}</p><p className="text-base font-black leading-tight" dir="auto">{r.obs ? r.title : secTxt(r)}</p>{ttlOf(r) && <p className="text-base font-black leading-tight" dir="auto" data-testid="tt-title">{ttlOf(r)}</p>}<p className="opacity-80" dir="auto">{[r.teacherName, r.subject].filter(Boolean).join(" · ")}{studentsOf(r) ? ` · ${studentsOf(r)} 👥` : ""}</p>
      {(canEdit || canDel) && !r.obs && <p className="mt-1 flex gap-1">{canEdit && <button type="button" className="rounded-full bg-white/70 px-1.5" onClick={() => { const t = seOf(r, d.times); setEd({ title: r.title || "", tAuto: !r.title, id: r.id, dows: [r.dow], period: r.period || "", cls: r.cls, sections: r.sections, teacher: r.teacher, subject: r.subject, phase: r.phase, dept: r.dept, same: true, s: t.s || "08:00", e: t.e || "08:45", per: {}, color: r.color || "" }); }} aria-label={tr("Edit", "تعديل")} data-testid="tt-edit">✎</button>}{canDel && <button type="button" className="rounded-full bg-white/70 px-1.5" onClick={() => del(r)} aria-label={tr("Delete", "حذف")} data-testid="tt-del">🗑</button>}</p>}
    </div>
  );
  const clsSections = classes.find((c) => c.name === ed?.cls)?.sections || [];
  const slotKey = (r: TtRow) => { const t = seOf(r, d.times); return t.s ? `${t.s}-${t.e}` : r.period; };
  const slots = [...new Map(rows.map((r) => { const t = seOf(r, d.times); return [slotKey(r), { k: slotKey(r), s: t.s, e: t.e, label: [r.period ? pidLabel(r.period, tr) : "", t.s ? span12(t) : ""].filter(Boolean).join(" · ") || r.period }]; })).values()].sort((a, b) => (a.s || a.k).localeCompare(b.s || b.k));
  return (
    <div className="space-y-3" data-testid="att-timetable">
      <div className="flex flex-wrap items-center gap-2">
        <p className="text-sm font-semibold opacity-80" data-testid="tt-now">🕒 {tr(DOW[d.now.dow][0], DOW[d.now.dow][1])} {d.now.hm} {tr("(Dubai)", "(دبي)")} · {d.now.period ? `${tr("Now:", "الآن:")} ${pidLabel(d.now.period, tr)}` : tr("No period running now", "لا توجد حصة الآن")}</p>
        <span className="flex-1" />
        <LeadPicker d={d} asAdmin={asAdmin} onSaved={load} />
        {asAdmin && <AdminLeads asAdmin={asAdmin} />}
      </div>
      <div className="flex flex-wrap gap-2" data-testid="tt-filters">
        {sel("phase", tr("All phases", "كل المراحل"), phaseOpts.map((x) => [x, x]), "tt-f-phase")}
        {sel("dept", tr("All departments", "كل الأقسام"), deptOpts.map((x) => [x, x]), "tt-f-dept")}
        {asAdmin && d.teachers.length > 1 && sel("teacher", tr("All teachers", "كل المعلمين"), d.teachers.map((t) => [t.id, t.name]), "tt-f-teacher")}
        {sel("subject", tr("All subjects", "كل المواد"), subjects.map((x) => [x, x]), "tt-f-subject")}
        {sel("cls", tr("All classes", "كل الصفوف"), uniq([...classOpts.map((c) => c.name), ...(scope ? [] : d.timetable.map((r) => r.cls))]).sort(clsCmp).map((x) => [x, x]), "tt-f-cls")}
        {(asAdmin || full) && f.cls && sel("sec", tr("All sections", "كل الشعب"), (classes.find((c) => c.name === f.cls)?.sections || []).map((x) => [x, x]), "tt-f-sec")}
        {canAdd && <button type="button" className="rounded-full bg-sun px-4 py-1.5 text-sm font-bold text-[#0b1b2b]" onClick={() => setEd({ ...EMPTY, teacher: asAdmin ? "" : d.teachers[0]?.id || "" })} data-testid="tt-new">+ {tr("Add Event", "إضافة حدث")}</button>}
        <button type="button" className="rounded-full bg-[#1b3a57] px-4 py-1.5 text-sm font-bold text-[#f5c542]" onClick={() => setView("year")} data-testid="tt-year-open">📅 {tr("Year calendar", "التقويم السنوي")}</button>
        {(asAdmin || d.acc.cover) && <button type="button" className="rounded-full bg-rose-100 px-4 py-1.5 text-sm font-bold text-rose-900" onClick={() => setCoverOpen(true)} data-testid="tt-cover-open">🛟 {tr("Assign Cover", "تعيين احتياط")}</button>}
      </div>
      <div className="flex flex-wrap items-center gap-2" data-testid="tt-views">
        <div className="inline-flex overflow-hidden rounded-full bg-[#1b3a57] p-1" role="tablist">{(["today", "day", "timeline", "week", "year"] as const).map((v) => <button key={v} type="button" role="tab" aria-selected={view === v} onClick={() => setView(v)} className={`rounded-full px-3 py-1.5 text-sm font-bold ${view === v ? "bg-[#f5c542] text-[#1b3a57]" : "text-white/85"}`} data-testid={`tt-view-${v}`}>{v === "today" ? tr("Today", "اليوم") : v === "day" ? tr("Day", "يوم") : v === "timeline" ? tr("Timeline", "خط زمني") : v === "week" ? tr("Week", "أسبوع") : tr("Year", "سنة")}</button>)}</div>
        {(view === "day" || view === "timeline") && <div className="flex flex-wrap gap-1">{days.map((x) => <button key={x} type="button" aria-pressed={dSel === x} onClick={() => setDay(x)} className={`${pill} ${dSel === x ? "!bg-[#1b3a57] !text-[#f5c542]" : ""}`} data-testid={`tt-day-${x}`}>{tr(DOW[x][0], DOW[x][1])}</button>)}</div>}
        <div className="flex items-center gap-1" data-testid="tt-date-nav">
          <button type="button" className={pill} onClick={() => { const d0 = new Date(weekOf + "T12:00:00Z"); d0.setUTCDate(d0.getUTCDate() - 7); setWeekOf(d0.toISOString().slice(0, 10)); }} aria-label={tr("Previous week", "الأسبوع السابق")}>‹</button>
          <input type="date" className={fld + " !w-auto"} value={weekOf} onChange={(e) => setWeekOf(e.target.value || weekOf)} data-testid="tt-date" />
          <button type="button" className={pill} onClick={() => { const d0 = new Date(weekOf + "T12:00:00Z"); d0.setUTCDate(d0.getUTCDate() + 7); setWeekOf(d0.toISOString().slice(0, 10)); }} aria-label={tr("Next week", "الأسبوع التالي")}>›</button>
        </div>
        <span className="flex-1" />
        {!asAdmin && !!d.peers?.length && (d.acc.peers || d.acc.observe) && <select className={fld + " !w-auto"} value={src} onChange={(e) => setSrc(e.target.value)} aria-label={tr("Whose timetable", "جدول من")} data-testid="tt-src"><option value="">{tr("My timetable", "جدولي")}</option>{d.peers.filter((p) => p.same || d.acc.observe).map((p) => <option key={p.id} value={p.id}>{p.name}{p.same ? "" : " ·"}</option>)}</select>}
        {!asAdmin && d.acc.observe && <button type="button" className="rounded-full bg-[#f5c542] px-4 py-1.5 text-sm font-bold text-[#1b3a57]" onClick={() => { const p = (d.peers || []).find((x) => x.same || d.acc.observe); if (!p) { setMsg(tr("No colleagues in your department are available to observe yet.", "لا يوجد زملاء في قسمك متاحون للملاحظة بعد.")); return; } if (!src) setSrc(p.id); setView("day"); setMsg(tr("Choose a colleague above, then press “Request to observe” on a lesson.", "اختر زميلًا أعلاه ثم اضغط «طلب ملاحظة» على حصة.")); }} data-testid="tt-obs-request">👀 {tr("Request peer observation", "طلب ملاحظة زميل")}</button>}
        {(asAdmin || (d.acc.compare && !!d.peers?.length)) && <button type="button" className="rounded-full bg-[#1b3a57] px-4 py-1.5 text-sm font-bold text-[#f5c542]" onClick={() => setCmp(!cmp)} data-testid="tt-compare-btn">⚖️ {tr("Compare teachers", "مقارنة المعلمين")}</button>}
      </div>
      {ro && <p className="rounded-xl bg-sky-100 px-3 py-2 text-sm font-bold text-sky-900" data-testid="tt-ro">👁️ {tr(`Viewing ${d.peers?.find((p) => p.id === src)?.name || ""}'s timetable (read-only).`, `عرض جدول ${d.peers?.find((p) => p.id === src)?.name || ""} (للقراءة فقط).`)}</p>}
      {coverOpen && <CoverPanel d={d} asAdmin={asAdmin} day0={weekOf} onClose={() => setCoverOpen(false)} onSaved={load} />}
      {cmp && <ComparePanel d={d} asAdmin={asAdmin} />}
      {!asAdmin && <ObsPanel d={d} onChange={load} />}
      {msg && <p className="rounded-xl bg-emerald-100 px-3 py-2 text-sm font-bold text-emerald-900" role="status" data-testid="tt-msg">{msg}</p>}
      {asAdmin && <PeriodTimes onSaved={load} />}
      {ed && (
        <div className={card + " grid gap-3 sm:grid-cols-2 lg:grid-cols-4"} data-testid="tt-add">
          <fieldset className="sm:col-span-2 lg:col-span-4"><legend className="text-sm font-bold">{tr("Days", "الأيام")}</legend><div className="mt-1 flex flex-wrap gap-1.5">{DOW.map((x, i) => <button key={i} type="button" aria-pressed={ed.dows.includes(i)} onClick={() => setEd({ ...ed, dows: ed.dows.includes(i) ? (ed.dows.length > 1 ? ed.dows.filter((y) => y !== i) : ed.dows) : [...ed.dows, i] })} className={`${pill} ${ed.dows.includes(i) ? "!bg-header !text-white" : ""}`} data-testid={`tt-dow-${i}`}>{tr(x[0], x[1])}</button>)}</div></fieldset>
          <div className="space-y-2 sm:col-span-2 lg:col-span-4" data-testid="tt-times">
            <label className="flex flex-wrap items-center gap-2 text-sm font-bold">{tr("Period (optional)", "الحصة (اختياري)")}
              <select className={fld + " !w-auto"} value={ed.period} onChange={(e) => { const pid = e.target.value; const tm = d.times[pid]; setEd({ ...ed, period: pid, ...(tm ? { s: tm.s, e: tm.e, same: true } : {}) }); }} data-testid="tt-period">
                <option value="">{tr("— custom time —", "— وقت مخصص —")}</option>
                {periodIds(d.times).map((pid) => <option key={pid} value={pid}>{pidLabel(pid, tr)}{d.times[pid]?.s ? ` · ${h12(d.times[pid].s)}–${h12(d.times[pid].e)}` : ""}</option>)}
              </select>
            </label>
            <label className="flex items-center gap-2 text-sm font-bold"><input type="checkbox" checked={ed.same} onChange={(e) => setEd({ ...ed, same: e.target.checked })} data-testid="tt-same" /> {tr("Same start and end time for all chosen days", "نفس وقت البداية والنهاية لكل الأيام")}</label>
            {ed.same ? <div className="flex flex-wrap items-center gap-2"><label className="text-sm font-bold">{tr("Start", "البداية")} <input type="time" className={fld + " !w-auto"} value={ed.s} onChange={(e) => setEd({ ...ed, s: e.target.value })} data-testid="tt-start" /></label><label className="text-sm font-bold">{tr("End", "النهاية")} <input type="time" className={fld + " !w-auto"} value={ed.e} onChange={(e) => setEd({ ...ed, e: e.target.value })} data-testid="tt-end" /></label></div>
              : <div className="grid gap-1.5" data-testid="tt-per-day">{ed.dows.map((x) => { const v = ed.per[x] || { s: ed.s, e: ed.e }; return <div key={x} className="flex flex-wrap items-center gap-2 text-sm"><b className="w-20">{tr(DOW[x][0], DOW[x][1])}</b><input type="time" className={fld + " !w-auto"} value={v.s} onChange={(e) => setEd({ ...ed, per: { ...ed.per, [x]: { ...v, s: e.target.value } } })} data-testid={`tt-start-${x}`} />–<input type="time" className={fld + " !w-auto"} value={v.e} onChange={(e) => setEd({ ...ed, per: { ...ed.per, [x]: { ...v, e: e.target.value } } })} data-testid={`tt-end-${x}`} /></div>; })}</div>}
            <div className="flex flex-wrap items-center gap-1.5 text-sm font-bold" data-testid="tt-color">{tr("Colour", "اللون")}{SWATCHES.map((c) => <button key={c} type="button" aria-label={c} aria-pressed={ed.color === c} onClick={() => setEd({ ...ed, color: c })} className={`h-7 w-7 rounded-full border-2 ${ed.color === c ? "border-header" : "border-black/10"}`} style={{ background: c }} data-testid="tt-swatch" />)}<input type="color" value={ed.color || "#bae6fd"} onChange={(e) => setEd({ ...ed, color: e.target.value })} aria-label={tr("Custom colour", "لون مخصص")} data-testid="tt-color-custom" />{ed.color && <button type="button" className="text-xs underline" onClick={() => setEd({ ...ed, color: "" })}>{tr("Auto", "تلقائي")}</button>}</div>
          </div>
          <label className="text-sm font-bold sm:col-span-2">{tr("Title", "العنوان")}<input className={fld + " mt-1"} value={ed.tAuto ? autoT(ed.cls, ed.sections) : ed.title} onChange={(e) => setEd({ ...ed, title: e.target.value, tAuto: false })} placeholder={tr("Fills in from the class and sections", "يُملأ من الصف والشعب")} maxLength={120} data-testid="tt-title" /></label>
          <label className="text-sm font-bold">{tr("Phase", "المرحلة")}<select className={fld + " mt-1"} value={ed.phase} onChange={(e) => setEd({ ...ed, phase: e.target.value })} data-testid="tt-phase"><option value="">—</option>{uniq([...phaseOpts, ed.phase]).map((x) => <option key={x}>{x}</option>)}</select></label>
          <label className="text-sm font-bold">{tr("Department", "القسم")}<input className={fld + " mt-1"} list="tt-depts" value={ed.dept} onChange={(e) => setEd({ ...ed, dept: e.target.value })} placeholder={tr("Choose or type", "اختر أو اكتب")} data-testid="tt-dept" /><datalist id="tt-depts">{deptOpts.map((x) => <option key={x} value={x} />)}</datalist></label>
          <label className="text-sm font-bold">{tr("Subject", "المادة")}<SubjectPick className={fld + " mt-1"} value={ed.subject} onChange={onTtSubject} mine={asAdmin ? [] : mySubj} all={subjects} admin={asAdmin} testId="tt-subject" /></label>
          {asAdmin ? <label className="text-sm font-bold">{tr("Teacher", "المعلم")}<select className={fld + " mt-1"} value={ed.teacher} onChange={(e) => { const t = d.teachers.find((x) => x.id === e.target.value); setEd({ ...ed, teacher: e.target.value, subject: ed.subject || t?.subject?.split(",")[0] || "", phase: ed.phase || t?.phase || "" }); }} data-testid="tt-teacher"><option value="">—</option>{d.teachers.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</select></label> : null}
          {/* t433: From a group removed */}
          <label className="text-sm font-bold">{tr("Class (optional)", "الصف (اختياري)")}<select className={fld + " mt-1"} value={ed.cls} onChange={(e) => setEd({ ...ed, cls: e.target.value, sections: [], ...(ed.tAuto ? {} : {}) })} data-testid="tt-cls"><option value="">—</option>{uniq([...classOpts.map((c) => c.name), ed.cls]).map((x) => <option key={x}>{x}</option>)}</select></label>
          <fieldset className="sm:col-span-2"><legend className="text-sm font-bold">{tr("Sections (choose one or more; none = whole class)", "الشعب (واحدة أو أكثر؛ بلا اختيار = الصف كله)")}</legend>
            <div className="mt-1 flex flex-wrap gap-1.5" data-testid="tt-sections">{clsSections.length ? clsSections.map((x) => <button key={x} type="button" aria-pressed={ed.sections.includes(x)} onClick={() => setEd({ ...ed, sections: ed.sections.includes(x) ? ed.sections.filter((y) => y !== x) : [...ed.sections, x] })} className={`${pill} ${ed.sections.includes(x) ? "!bg-sun !text-[#0b1b2b]" : ""}`} data-testid="tt-sec">{x}</button>) : <span className="text-xs opacity-60">{ed.cls ? tr("This class has no sections.", "لا توجد شعب لهذا الصف.") : tr("Choose a class first.", "اختر الصف أولًا.")}</span>}</div>
          </fieldset>
          <div className="flex items-end gap-2 sm:col-span-2 lg:col-span-4"><button type="button" className="rounded-full bg-sun px-5 py-2 text-sm font-bold text-[#0b1b2b] disabled:opacity-50" disabled={!ed.dows.length} onClick={save} data-testid="tt-add-btn">{ed.id ? tr("Save changes", "حفظ التغييرات") : tr(`Add ${ed.dows.length > 1 ? `${ed.dows.length} events` : "Event"}`, "إضافة")}</button><button type="button" className={pill} onClick={() => setEd(null)}>{tr("Cancel", "إلغاء")}</button></div>
        </div>
      )}
      <TtTools d={d} rows={rows} asAdmin={asAdmin} studentsOf={studentsOf} filt={[f.phase, f.dept, d.teachers.find((t) => t.id === f.teacher)?.name || "", f.subject, f.cls].filter(Boolean).join(" · ")} />
      {view === "today" && <GlassStrip rows={rows} times={d.times} now={d.now} dow={d.now.dow} testId="tt-today" onPick={ro && d.acc.observe ? (r) => askObs(r) : undefined} empty={tr("No events today 🌿 Enjoy your day!", "لا توجد أحداث اليوم 🌿 يومًا سعيدًا!")} canEdit={canEdit} canDel={canDel} onEdit={(r) => { const t = seOf(r, d.times); setEd({ title: r.title || "", tAuto: !r.title, id: r.id, dows: [r.dow], period: r.period || "", cls: r.cls, sections: r.sections, teacher: r.teacher, subject: r.subject, phase: r.phase, dept: r.dept, same: true, s: t.s || "08:00", e: t.e || "08:45", per: {}, color: r.color || "" }); }} onDel={del} />}
      {view === "day" && <div className="space-y-2" data-testid="tt-dayview">{rows.filter((r) => r.dow === dSel).sort((a, b) => (seOf(a, d.times).s || "").localeCompare(seOf(b, d.times).s || "")).map((r) => <div key={r.id} className="flex items-start gap-3"><span className="w-28 shrink-0 pt-2 text-sm font-extrabold">{r.period ? <span className="block text-[11px] opacity-70">{pidLabel(r.period, tr)}</span> : null}{h12(seOf(r, d.times).s)}<br />{h12(seOf(r, d.times).e)}</span><div className="flex-1">{cell(r)}{ro && d.acc.observe && <button type="button" className="mt-1 rounded-full bg-[#1b3a57] px-2 py-0.5 text-xs font-bold text-[#f5c542]" onClick={() => askObs(r)} data-testid="tt-obs-ask">👀 {tr("Request to observe", "طلب ملاحظة")}</button>}</div></div>)}{!rows.some((r) => r.dow === dSel) && <p className="py-6 text-center opacity-60">{tr("No lessons on this day.", "لا توجد حصص في هذا اليوم.")}</p>}</div>}
      {view === "week" && <>
      <div className="hidden overflow-x-auto md:block"><table className="w-full table-fixed border-separate border-spacing-1 text-sm" data-testid="tt-table"><thead><tr><th className="w-24 text-xs opacity-60">{tr("Time", "الوقت")}</th>{days.map((x) => <th key={x} className={`text-sm ${x === d.now.dow ? "text-emerald-600" : ""}`}>{tr(DOW[x][0], DOW[x][1])}</th>)}</tr></thead>
        <tbody>{slots.map((sl) => <tr key={sl.k}><td className="align-top text-xs font-bold opacity-70">{sl.label}</td>{days.map((x) => <td key={x} className={`align-top ${x === d.now.dow && sl.s && sl.s <= d.now.hm && d.now.hm < sl.e ? "rounded-xl ring-2 ring-emerald-400" : ""}`}><div className="space-y-1">{rows.filter((r) => r.dow === x && slotKey(r) === sl.k).map(cell)}</div></td>)}</tr>)}
        {!rows.length && <tr><td colSpan={days.length + 1} className="py-6 text-center opacity-60">{tr("No lessons yet.", "لا توجد حصص بعد.")}</td></tr>}</tbody></table></div>
      <div className="space-y-3 md:hidden" data-testid="tt-list">{days.map((x) => { const l = rows.filter((r) => r.dow === x); return l.length ? <section key={x}><h3 className={`mb-1 font-extrabold ${x === d.now.dow ? "text-emerald-600" : ""}`}>{tr(DOW[x][0], DOW[x][1])}</h3><div className="grid gap-1.5">{l.sort((a, b) => (seOf(a, d.times).s || a.period).localeCompare(seOf(b, d.times).s || b.period)).map((r) => <div key={r.id} className="flex items-start gap-2"><span className="w-16 shrink-0 pt-1 text-xs font-bold opacity-70">{r.period ? <span className="block">{pidLabel(r.period, tr)}</span> : null}{seOf(r, d.times).s || ""}</span><div className="flex-1">{cell(r)}</div></div>)}</div></section> : null; })}{!rows.length && <p className="py-6 text-center opacity-60">{tr("No lessons yet.", "لا توجد حصص بعد.")}</p>}</div></>}
      {view === "timeline" && <DayTimeline rows={rows} times={d.times} now={d.now} dow={dSel} canEdit={canEdit} canDel={canDel} studentsOf={studentsOf} onEdit={(r) => { const t = seOf(r, d.times); setEd({ title: r.title || "", tAuto: !r.title, id: r.id, dows: [r.dow], period: r.period || "", cls: r.cls, sections: r.sections, teacher: r.teacher, subject: r.subject, phase: r.phase, dept: r.dept, same: true, s: t.s || "08:00", e: t.e || "08:45", per: {}, color: r.color || "" }); }} onDel={del} />}
      {view === "year" && <YearCalendar rows={rows} times={d.times} weekOf={weekOf} canAdd={canAdd} onAdd={(iso) => { const dow = new Date(iso + "T12:00:00Z").getUTCDay(); setWeekOf(iso); setDay(dow); setEd({ ...EMPTY, teacher: asAdmin ? "" : d.teachers[0]?.id || "", dows: [dow] }); }} onPickDate={(iso) => { const dow = new Date(iso + "T12:00:00Z").getUTCDay(); setWeekOf(iso); setDay(dow); setView("timeline"); }} />}
      {!!d.shared?.length && <SharedList list={d.shared} times={d.times} asAdmin={asAdmin} onChange={load} />}
    </div>
  );
}

function ParentShared() {
  const { tr } = useTr();
  const [list, setList] = useState<TtShare[] | null>(null);
  useEffect(() => { modCall<{ shared: TtShare[] }>("att-tt-shared", {}, false).then((r) => setList(r.shared)).catch(() => setList([])); }, []);
  if (!list) return <p className="opacity-60">…</p>;
  return list.length ? <SharedList list={list} times={{}} asAdmin={false} /> : <p className="opacity-70" data-testid="tt-shared-none">{tr("No timetable has been shared with you yet.", "لم تتم مشاركة أي جدول معك بعد.")}</p>;
}

/** /lms/timetable — the separate Timetable tab for students and teachers. */
export function TimetablePage() {
  const { tr } = useTr();
  const { actor, ready } = useLmsActor();
  return (
    <AssessmentShell title={tr("Timetable", "الجدول الدراسي")} exitHref="/lms" wide toolbar={<LmsStaffToolbar />}>
      <div className="mx-auto w-full max-w-7xl flex-1 px-3 py-6 sm:px-6" data-testid="lms-timetable">
        <h1 className="mb-4 text-2xl font-extrabold">🗓️ {tr("Timetable", "الجدول الدراسي")}</h1>
        {!ready ? null : !actor ? <p>{tr("Please sign in.", "سجّل الدخول.")}</p> : actor.role === "parent" ? <ParentShared /> : <TimetableManager asAdmin={false} />}
      </div>
    </AssessmentShell>
  );
}

const rowsOut = (rows: TtRow[], times: TtData["times"], tr: (en: string, ar: string) => string) => [...rows].sort((a, b) => ((a.dow + 6) % 7) - ((b.dow + 6) % 7) || (seOf(a, times).s || a.period).localeCompare(seOf(b, times).s || b.period));
/** t317: one-click PDF / Excel of the timetable shown (filters respected, EN or AR as the page) and Share. */
function TtTools({ d, rows, asAdmin, filt, studentsOf }: { d: TtData; rows: TtRow[]; asAdmin: boolean; filt: string; studentsOf?: (r: TtRow) => number }) {
  const { tr, lang } = useTr();
  const [share, setShare] = useState(false);
  const ar = lang === "ar";
  const heads = [tr("Day", "اليوم"), tr("Start", "البداية"), tr("End", "النهاية"), tr("Subject", "المادة"), tr("Class", "الصف"), tr("Teacher", "المعلم")];
  const out = rowsOut(rows, d.times, tr);
  const data = out.map((r) => { const t = seOf(r, d.times); return [tr(DOW[r.dow][0], DOW[r.dow][1]), t.s || r.period, t.e, r.subject, secTxt(r), r.teacherName]; });
  const colors = out.map((r) => r.color || undefined);
  const title = `${tr("Timetable", "الجدول الدراسي")}${filt ? ` — ${filt}` : ""}`;
  const okX = d.acc.xlsx !== false, okP = d.acc.pdf !== false, okS = d.acc.share !== false && (asAdmin || d.acc.add || d.acc.edit);
  // t437: period × day grid like the school sample
  const grid = (): TtGrid => {
    const lbl = (k: string) => /^P\d+$/.test(k) ? k.slice(1) : k;
    const cols = new Map<string, { label: string; s: string; e: string }>();
    Object.entries(d.times).filter(([, t]) => t.s && t.e).forEach(([k, t]) => cols.set(`${t.s}-${t.e}`, { label: lbl(k), s: t.s, e: t.e }));
    rows.forEach((r) => { const t = seOf(r, d.times); const k = t.s ? `${t.s}-${t.e}` : r.period; if (!cols.has(k)) cols.set(k, { label: r.period && !r.s ? lbl(r.period) : (t.s ? h12(t.s) : lbl(r.period)), s: t.s, e: t.e }); });
    const keys = [...cols.keys()].sort((a, b) => (cols.get(a)!.s || a).localeCompare(cols.get(b)!.s || b));
    const dset = [...new Set([1, 2, 3, 4, 5, ...rows.map((r) => r.dow)])].sort((a, b) => ((a + 6) % 7) - ((b + 6) % 7));
    const useDays = rows.some((r) => r.dow === 0) && !rows.some((r) => r.dow === 5) ? dset.filter((x) => x !== 5) : dset;
    const txt = (r: TtRow) => { if (r.obs || (!r.cls && r.title)) return r.title || r.subject; const n = studentsOf?.(r) || 0; const base = secTxt(r).replace(/\s+/g, ""); return `${base}${n ? `(${n})` : ""}${ttlOf(r) ? `\n${ttlOf(r)}` : ""}`; };
    let tot = 0;
    const dayRows = useDays.map((x) => { const l = rows.filter((r) => r.dow === x); const cnt = l.filter((r) => r.cls && !r.obs).length; tot += cnt;
      return { name: tr(DOW[x][0], DOW[x][1]), count: cnt, cells: keys.map((k) => { const hit = l.filter((r) => { const t = seOf(r, d.times); return (t.s ? `${t.s}-${t.e}` : r.period) === k; }); return hit.length ? { text: hit.map(txt).join("\n"), color: hit[0].color || undefined } : null; }) }; });
    const keyed = new Map<string, number>(); rows.forEach((r) => { if (r.cls && !r.obs) keyed.set(`${r.cls}|${[...r.sections].sort().join("")}`, studentsOf?.(r) || 0); });
    const totalStudents = [...keyed.values()].reduce((a, b) => a + b, 0);
    const teachers = [...new Set(rows.map((r) => r.teacherName).filter(Boolean))];
    const subj = [...new Set(rows.map((r) => r.subject).filter(Boolean))];
    return { title: `${subj.length === 1 ? subj[0] + " – " : ""}${tr("Timetable", "الجدول الدراسي")} 2026 – 27`, subtitle: `${teachers.length === 1 ? tr("Teacher: ", "المعلم: ") + teachers[0] + "  |  " : filt ? filt + "  |  " : ""}${tr("Raffles International School, Dubai", "مدرسة رافلز الدولية، دبي")}`,
      cols: keys.map((k) => { const c = cols.get(k)!; return { label: c.label, s: c.s ? h12(c.s).replace(/\s?[AP]M/i, "") : "", e: c.e ? h12(c.e).replace(/\s?[AP]M/i, "") : "" }; }), days: dayRows, totalLessons: tot, totalStudents, rtl: ar,
      L: { period: tr("Period", "الحصة"), days: tr("Days", "الأيام"), lessons: tr("Lessons", "حصص"), totalL: tr("Total Lessons", "مجموع الحصص"), totalS: tr("Total Students", "مجموع الطلاب") } };
  };
  if (!rows.length) return null;
  const btn = "rounded-full border border-black/10 bg-white px-3 py-1.5 text-sm font-bold text-[#1b2f44] hover:bg-sky-50";
  return (
    <div className="space-y-2" data-testid="tt-tools">
      <div className="flex flex-wrap items-center gap-2">
        {okP && <button type="button" className={btn} onClick={() => ttGridPdf(grid(), `timetable${ar ? "-ar" : ""}.pdf`)} data-testid="tt-pdf">⬇️ PDF</button>}
        {okP && <button type="button" className={btn} onClick={() => ttGridDocx(grid(), `timetable${ar ? "-ar" : ""}.docx`)} data-testid="tt-docx">⬇️ Word</button>}
        {okX && <button type="button" className={btn} onClick={() => ttGridXlsx(grid(), `timetable${ar ? "-ar" : ""}.xlsx`)} data-testid="tt-xlsx">⬇️ Excel</button>}
        {okS && <button type="button" className={btn} onClick={() => setShare(!share)} data-testid="tt-share">📤 {tr("Share", "مشاركة")}</button>}
        <img src={qrImageUrl(`${siteOrigin()}/lms/timetable`, 56)} alt="QR" className="ms-auto h-12 w-12 rounded-lg ring-1 ring-black/10" data-testid="tt-qr" />
      </div>
      {share && <SharePanel d={d} rows={rows} title={title} asAdmin={asAdmin} onDone={() => setShare(false)} />}
    </div>
  );
}

function SharePanel({ d, rows, title, asAdmin, onDone }: { d: TtData; rows: TtRow[]; title: string; asAdmin: boolean; onDone: () => void }) {
  const { tr } = useTr();
  const { roster, groups } = useRosterData();
  const [keys, setKeys] = useState<string[]>([]);
  const [teachers, setTeachers] = useState<string[]>([]);
  const [who, setWho] = useState({ students: true, parents: false });
  const [msg, setMsg] = useState("");
  const kids = rosterIds(keys, roster, groups);
  const send = async () => {
    try {
      const r = await modCall<{ n: number }>("att-tt-share", { title, rows: rows.map((x) => x.id), to: [...teachers, ...(who.students ? kids : [])], parentsOf: who.parents ? kids : [] }, asAdmin);
      setMsg(tr(`Shared with ${r.n} people — it is in their Timetable tab now.`, `تمت المشاركة مع ${r.n} — موجود الآن في تبويب الجدول لديهم.`)); setTimeout(onDone, 2500);
    } catch (e) { setMsg((e as Error).message === "no_recipients" ? tr("Choose who to share with.", "اختر من تشارك معه.") : modErr(e, tr)); }
  };
  return (
    <div className="space-y-2 rounded-2xl border border-sky-200 bg-sky-50 p-3 text-sm text-[#1b2f44]" data-testid="tt-share-panel">
      <p className="font-extrabold">📤 {tr("Share this timetable", "مشاركة هذا الجدول")} <span className="font-normal opacity-70">({rows.length} {tr("lessons", "حصة")})</span></p>
      {d.teachers.length > 0 && <div><p className="font-bold">{tr("Teachers", "المعلمون")}</p><div className="flex flex-wrap gap-1.5">{d.teachers.map((t) => <button key={t.id} type="button" aria-pressed={teachers.includes(t.id)} onClick={() => setTeachers((x) => (x.includes(t.id) ? x.filter((y) => y !== t.id) : [...x, t.id]))} className={`rounded-full px-3 py-1 font-bold ring-1 ring-black/10 ${teachers.includes(t.id) ? "bg-header text-sun" : "bg-white"}`} data-testid="tt-share-teacher">{t.name}</button>)}</div></div>}
      <div><p className="font-bold">{tr("Students / parents of (year group, class, section or group)", "الطلاب / أولياء أمور (السنة أو الصف أو الشعبة أو المجموعة)")}</p><RosterPicker value={keys} onChange={setKeys} roster={roster} groups={groups} />
        <div className="mt-1 flex gap-3"><label className="flex items-center gap-1"><input type="checkbox" checked={who.students} onChange={(e) => setWho({ ...who, students: e.target.checked })} data-testid="tt-share-students" /> {tr("Students", "الطلاب")} ({kids.length})</label><label className="flex items-center gap-1"><input type="checkbox" checked={who.parents} onChange={(e) => setWho({ ...who, parents: e.target.checked })} data-testid="tt-share-parents" /> {tr("Their parents", "أولياء أمورهم")}</label></div></div>
      <button type="button" className="rounded-full bg-header px-4 py-1.5 font-extrabold text-sun" onClick={send} data-testid="tt-share-send">{tr("Share and notify", "مشاركة وإشعار")}</button>
      {msg && <p className="font-semibold" role="status" data-testid="tt-share-msg">{msg}</p>}
    </div>
  );
}

/** Timetables other people shared with me (and the ones I shared). */
export function SharedList({ list, times, asAdmin, onChange }: { list: TtShare[]; times: TtData["times"]; asAdmin: boolean; onChange?: () => void }) {
  const { tr } = useTr();
  return (
    <section className="space-y-2" data-testid="tt-shared">
      <h2 className="text-lg font-extrabold">📥 {tr("Shared timetables", "جداول مشتركة")}</h2>
      {list.map((x) => (
        <details key={x.id} className={card} data-testid="tt-shared-item">
          <summary className="cursor-pointer font-bold" dir="auto">{x.title} <span className="text-xs font-normal opacity-70">· {x.mine ? tr(`you shared with ${x.n}`, `شاركته مع ${x.n}`) : tr(`from ${x.byName}`, `من ${x.byName}`)}</span></summary>
          <ul className="mt-2 grid gap-1 sm:grid-cols-2">{rowsOut(x.rows, times, tr).map((r) => <li key={r.id} style={r.color ? { background: r.color } : undefined} className={`rounded-xl px-2 py-1 text-xs text-[#1b2f44] ${r.color ? "" : "bg-sky-100"}`}><b>{tr(DOW[r.dow][0], DOW[r.dow][1])} {seOf(r, times).s || r.period}–{seOf(r, times).e}</b> · {r.subject} · {secTxt(r)}{r.teacherName ? ` · ${r.teacherName}` : ""}</li>)}</ul>
          {x.mine && onChange && <button type="button" className="mt-2 text-xs font-bold text-rose-700 underline" onClick={() => modCall("att-tt-unshare", { id: x.id }, asAdmin).then(onChange)} data-testid="tt-unshare">{tr("Stop sharing", "إيقاف المشاركة")}</button>}
        </details>))}
    </section>
  );
}


/** t433 #8: admin sets reminder minutes for specific / multiple teachers. */
function AdminLeads({ asAdmin }: { asAdmin: boolean }) {
  const { tr } = useTr();
  const [list, setList] = useState<{ id: string; name: string; lead: number }[] | null>(null);
  const [pick, setPick] = useState<string[]>([]);
  const [lead, setLead] = useState(5);
  const [msg, setMsg] = useState("");
  useEffect(() => { modCall<{ leads: { id: string; name: string; lead: number }[] }>("att-tt-leads", {}, asAdmin).then((r) => setList(r.leads)).catch(() => setList([])); }, [asAdmin]);
  if (!list) return null;
  const save = async () => {
    try {
      const ids = pick.length ? pick : list.map((x) => x.id);
      await modCall("att-times-save", { leads: ids.map((id) => ({ id, lead })) }, asAdmin);
      setMsg(tr(`Reminders set for ${ids.length} teachers.`, `تم ضبط التذكير لـ ${ids.length} معلمين.`));
      setList(list.map((x) => (ids.includes(x.id) ? { ...x, lead } : x)));
    } catch (e) { setMsg(modErr(e, tr)); }
  };
  return (
    <details className={card + " !p-3"} data-testid="tt-admin-leads">
      <summary className="cursor-pointer font-extrabold">🔔 {tr("Set reminders for teachers", "ضبط تذكيرات المعلمين")}</summary>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <select className={fld + " !w-auto"} value={lead} onChange={(e) => setLead(Number(e.target.value))} data-testid="tt-admin-lead-val">
          {[0, 2, 5, 10, 15, 30].map((n) => <option key={n} value={n}>{n ? tr(`${n} min before`, `قبل ${n} دقائق`) : tr("Off", "إيقاف")}</option>)}
        </select>
        <button type="button" className="rounded-full bg-[#1b3a57] px-3 py-1 text-sm font-bold text-[#f5c542]" onClick={() => setPick(list.map((x) => x.id))}>{tr("Select all", "تحديد الكل")}</button>
        <button type="button" className="rounded-full bg-[#f5c542] px-3 py-1 text-sm font-bold text-[#1b3a57]" onClick={save} data-testid="tt-admin-lead-save">{tr("Apply", "تطبيق")}</button>
      </div>
      <div className="mt-2 flex max-h-36 flex-wrap gap-1 overflow-y-auto">{list.map((t) => <button key={t.id} type="button" aria-pressed={pick.includes(t.id)} onClick={() => setPick((x) => (x.includes(t.id) ? x.filter((y) => y !== t.id) : [...x, t.id]))} className={`rounded-full px-2 py-0.5 text-xs font-bold ring-1 ring-black/10 ${pick.includes(t.id) ? "bg-[#1b3a57] text-[#f5c542]" : "bg-white"}`}>{t.name} · {t.lead || "off"}</button>)}</div>
      {msg && <p className="mt-1 text-xs font-semibold" role="status">{msg}</p>}
    </details>
  );
}

/** t433 #20–21: year calendar of the weekly pattern + print with QR. */
function YearCalendar({ rows, times, weekOf, onPickDate, canAdd, onAdd }: { rows: TtRow[]; times: TtData["times"]; weekOf: string; onPickDate: (iso: string) => void; canAdd?: boolean; onAdd?: (iso: string) => void }) {
  const { tr, lang } = useTr();
  const y0 = Number(weekOf.slice(0, 4)) || new Date().getFullYear();
  const [year, setYear] = useState(y0);
  useEffect(() => setYear(y0), [y0]);
  const printYear = async () => {
    const heads = [tr("Date", "التاريخ"), tr("Day", "اليوم"), tr("Time", "الوقت"), tr("Class", "الصف"), tr("Subject", "المادة"), tr("Teacher", "المعلم")];
    const data: (string | number)[][] = [];
    for (let m = 0; m < 12; m++) {
      const dim = new Date(Date.UTC(year, m + 1, 0)).getUTCDate();
      for (let day = 1; day <= dim; day++) {
        const iso = `${year}-${String(m + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
        const dow = new Date(iso + "T12:00:00Z").getUTCDay();
        rows.filter((r) => r.dow === dow).forEach((r) => { const tm = seOf(r, times); data.push([iso, tr(DOW[dow][0], DOW[dow][1]), span12(tm), secTxt(r), r.subject, r.teacherName]); });
      }
    }
    await pdfTable({ title: tr(`School year ${year}`, `العام الدراسي ${year}`), subtitle: tr(`${data.length} events`, `${data.length} حدث`), headers: heads, rows: data, filename: `year-${year}-timetable.pdf`, rtl: lang === "ar" });
  };
  return (
    <section className={card} data-testid="tt-year">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <h3 className="text-lg font-extrabold">📅 {tr("Year calendar", "تقويم السنة")}</h3>
        <button type="button" className={pill} onClick={() => setYear(year - 1)}>‹</button>
        <b className="tabular-nums">{year}</b>
        <button type="button" className={pill} onClick={() => setYear(year + 1)}>›</button>
        <span className="flex-1" />
        {canAdd && <button type="button" className="rounded-full bg-sun px-4 py-1.5 text-sm font-bold text-[#0b1b2b]" onClick={() => onAdd?.(weekOf)} data-testid="tt-year-add">+ {tr("Add event", "إضافة حدث")}</button>}
        <button type="button" className="rounded-full bg-[#1b3a57] px-4 py-1.5 text-sm font-bold text-[#f5c542]" onClick={printYear} data-testid="tt-year-print">⬇️ {tr("Print year", "طباعة السنة")}</button>
        <img src={qrImageUrl(`${siteOrigin()}/lms/timetable?year=${year}`, 72)} alt="QR" className="h-14 w-14 rounded-lg ring-1 ring-black/10" />
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {Array.from({ length: 12 }, (_, m) => {
          const dim = new Date(Date.UTC(year, m + 1, 0)).getUTCDate();
          const name = new Date(Date.UTC(year, m, 1)).toLocaleString(lang === "ar" ? "ar" : "en", { month: "long", timeZone: "UTC" });
          return (
            <div key={m} className="rounded-2xl bg-white/70 p-2 ring-1 ring-black/5 dark:bg-white/5">
              <p className="mb-1 text-center text-sm font-extrabold text-[#1b3a57]">{name}</p>
              <div className="grid grid-cols-7 gap-0.5 text-center text-[10px] font-bold opacity-60">{["S", "M", "T", "W", "T", "F", "S"].map((x, i) => <span key={i}>{x}</span>)}</div>
              <div className="grid grid-cols-7 gap-0.5">
                {Array.from({ length: new Date(Date.UTC(year, m, 1)).getUTCDay() }, (_, i) => <span key={"e" + i} />)}
                {Array.from({ length: dim }, (_, i) => {
                  const day = i + 1;
                  const iso = `${year}-${String(m + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
                  const dow = new Date(iso + "T12:00:00Z").getUTCDay();
                  const n = rows.filter((r) => r.dow === dow).length;
                  return <button key={day} type="button" onClick={() => (canAdd && onAdd ? onAdd(iso) : onPickDate(iso))} className={`rounded-md py-1 text-xs font-bold ${n ? "bg-[#f5c542]/40 text-[#1b3a57]" : "hover:bg-black/5"}`} data-testid="tt-year-day">{day}{n ? <span className="block text-[9px] opacity-70">{n}</span> : null}</button>;
                })}
              </div>
            </div>
          );
        })}
      </div>
      <p className="mt-2 text-xs opacity-60">{tr("Gold days follow the weekly timetable pattern. Tap a day to add an event for that weekday, or use Add event.", "الأيام الذهبية تتبع النمط الأسبوعي. اضغط يومًا لإضافة حدث لذلك اليوم، أو استخدم إضافة حدث.")}</p>
    </section>
  );
}

/** t433 #22: Assign Cover — absent teachers → free slots → notify cover teacher. */
function CoverPanel({ d, asAdmin, day0, onClose, onSaved }: { d: TtData; asAdmin: boolean; day0: string; onClose: () => void; onSaved: () => void }) {
  const { tr } = useTr();
  const [day, setDay] = useState(day0);
  const [absent, setAbsent] = useState<string[]>([]);
  const [data, setData] = useState<{ lessons: (TtRow & { free: { id: string; name: string }[] })[]; covers: { id: string; s: string; e: string; absentName: string; coverName: string }[] } | null>(null);
  const [msg, setMsg] = useState("");
  const [pick, setPick] = useState<Record<string, string>>({});
  const [srvT, setSrvT] = useState<{ id: string; name: string }[]>([]);
  const teachers = srvT.length ? srvT : d.staff?.length ? d.staff : d.teachers;
  const load = async (ids: string[], dy = day) => {
    try { const r = await modCall<{ teachers?: { id: string; name: string }[]; lessons: (TtRow & { free: { id: string; name: string }[] })[]; covers: { id: string; s: string; e: string; absentName: string; coverName: string }[] }>("att-tt-cover", { day: dy, absent: ids }, asAdmin); if (r.teachers?.length) setSrvT(r.teachers); setData(r); setMsg(""); }
    catch (e) { setMsg(modErr(e, tr)); }
  };
  useEffect(() => { load(absent, day); }, [day]); // eslint-disable-line react-hooks/exhaustive-deps
  const assign = async (lesson: TtRow & { free: { id: string; name: string }[] }) => {
    const cover = pick[lesson.id]; if (!cover) { setMsg(tr("Choose a cover teacher.", "اختر معلم الاحتياط.")); return; }
    const tm = seOf(lesson, d.times);
    try {
      await modCall("att-tt-cover-save", { day, ttId: lesson.id, absent: lesson.teacher, cover, s: tm.s, e: tm.e, cls: lesson.cls, section: lesson.sections.join(","), subject: lesson.subject, title: lesson.title || secTxt(lesson) }, asAdmin);
      setMsg(tr("Cover assigned and teacher notified.", "تم تعيين الاحتياط وإشعار المعلم."));
      setPick({ ...pick, [lesson.id]: "" }); await load(absent); onSaved();
    } catch (e) { setMsg(modErr(e, tr)); }
  };
  return (
    <section className="space-y-3 rounded-3xl bg-white/95 p-4 text-[#1b2f44] shadow-xl ring-2 ring-[#1b3a57]/20" data-testid="tt-cover">
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="text-lg font-extrabold">🛟 {tr("Assign Cover", "تعيين احتياط")}</h3>
        <input type="date" className={fld + " !w-auto"} value={day} onChange={(e) => setDay(e.target.value)} data-testid="tt-cover-day" />
        <span className="flex-1" />
        <button type="button" className={pill} onClick={onClose}>{tr("Close", "إغلاق")}</button>
      </div>
      <p className="text-sm opacity-80">{tr("Select absent teachers, then a free colleague for each lesson.", "اختر المعلمين الغائبين ثم زميلًا متاحًا لكل حصة.")}</p>
      <div className="flex max-h-28 flex-wrap gap-1.5 overflow-y-auto" data-testid="tt-cover-absent">
        {teachers.map((t) => <button key={t.id} type="button" aria-pressed={absent.includes(t.id)} onClick={() => { const next = absent.includes(t.id) ? absent.filter((x) => x !== t.id) : [...absent, t.id]; setAbsent(next); load(next); }} className={`rounded-full px-3 py-1 text-sm font-bold ring-1 ring-black/10 ${absent.includes(t.id) ? "bg-rose-600 text-white" : "bg-white"}`} data-testid="tt-cover-abs">{t.name}</button>)}
      </div>
      {msg && <p className="text-sm font-bold" role="status">{msg}</p>}
      {data && (
        <ul className="space-y-2" data-testid="tt-cover-lessons">
          {!data.lessons.length && <li className="opacity-70">{tr("No uncovered lessons for the selected teachers on this weekday.", "لا توجد حصص بلا احتياط للمعلمين المختارين في هذا اليوم.")}</li>}
          {data.lessons.map((r) => {
            const tm = seOf(r, d.times);
            return (
              <li key={r.id} className="flex flex-wrap items-center gap-2 rounded-2xl bg-rose-50 px-3 py-2 text-sm">
                <b>{span12(tm)}</b><span>{r.teacherName}</span><span className="font-bold">{secTxt(r)}</span><span>{r.subject}</span>
                <select className={fld + " !w-auto"} value={pick[r.id] || ""} onChange={(e) => setPick({ ...pick, [r.id]: e.target.value })} data-testid="tt-cover-pick">
                  <option value="">{tr("Free teacher…", "معلم متاح…")}</option>
                  {!r.free.length && <option value="" disabled>{tr("No free teacher at this time", "لا يوجد معلم متاح")}</option>}{r.free.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
                </select>
                <button type="button" className="rounded-full bg-[#1b3a57] px-3 py-1 font-bold text-[#f5c542]" onClick={() => assign(r)} data-testid="tt-cover-save">{tr("Assign", "تعيين")}</button>
              </li>
            );
          })}
          {!!data.covers?.length && <li className="pt-2 text-xs font-bold opacity-70">{tr("Already covered today:", "مغطى اليوم:")} {data.covers.map((c) => `${h12(c.s)} ${c.absentName}→${c.coverName}`).join(" · ")}</li>}
        </ul>
      )}
    </section>
  );
}

/** t384/t433: pick several teachers and see one grid; green cells are free for everyone chosen. Admin can filter all teachers. */
function ComparePanel({ d, asAdmin }: { d: TtData; asAdmin: boolean }) {
  const { tr } = useTr();
  const me = lmsSession()?.user;
  const [f, setF] = useState({ phase: "", dept: "", subject: "", cls: "" });
  const all = useMemo(() => (asAdmin ? (d.staff || []).filter((t) => (!f.phase || t.phase === f.phase) && (!f.dept || t.depts.includes(f.dept)) && (!f.subject || t.subjects.includes(f.subject)) && (!f.cls || t.classes.includes(f.cls))).map((t) => ({ id: t.id, name: t.name })) : [{ id: me?.id || "", name: tr("Me", "أنا") }, ...(d.peers || [])]), [asAdmin, d, f, me, tr]);
  const [pick, setPick] = useState<string[]>(asAdmin ? [] : [me?.id || ""]);
  const [res, setRes] = useState<{ rows: TtRow[]; obs: TtObs[] } | null>(null);
  const [msg, setMsg] = useState("");
  const run = async () => { try { setRes(await modCall<{ rows: TtRow[]; obs: TtObs[] }>("att-tt-compare", { teachers: pick }, asAdmin)); setMsg(""); } catch (e) { setMsg(modErr(e, tr)); } };
  const names = Object.fromEntries(all.map((t) => [t.id, t.name]));
  const days = [1, 2, 3, 4, 5];
  const rr = res?.rows || [];
  const lo = Math.min(450, ...rr.map((r) => toM(r.s || "07:30"))), hi = Math.max(900, ...rr.map((r) => toM(r.e || "15:00")));
  const slots: number[] = []; for (let m = Math.floor(lo / 30) * 30; m < hi; m += 30) slots.push(m);
  const myId = me?.id || "";
  const busyRows = (dow: number, m: number) => rr.filter((r) => r.dow === dow && r.s && r.e && toM(r.s) < m + 30 && toM(r.e) > m);
  const sel = "rounded-xl border border-black/10 bg-white px-2 py-1 text-sm text-[#1b2f44]";
  const uniq = (xs: string[]) => [...new Set(xs.filter(Boolean))].sort();
  return (
    <section className="space-y-3 rounded-3xl bg-white/90 p-4 text-[#1b2f44] shadow ring-1 ring-black/5" data-testid="tt-compare">
      <h3 className="text-lg font-extrabold">⚖️ {tr("Compare timetables", "مقارنة الجداول")}</h3>
      {asAdmin && <div className="flex flex-wrap gap-2" data-testid="tt-cmp-filters">
        <select className={sel} value={f.phase} onChange={(e) => setF({ ...f, phase: e.target.value })} data-testid="tt-cmp-phase"><option value="">{tr("All phases", "كل المراحل")}</option>{uniq((d.staff || []).map((t) => t.phase)).map((x) => <option key={x}>{x}</option>)}</select>
        <select className={sel} value={f.dept} onChange={(e) => setF({ ...f, dept: e.target.value })} data-testid="tt-cmp-dept"><option value="">{tr("All departments", "كل الأقسام")}</option>{uniq((d.staff || []).flatMap((t) => t.depts)).map((x) => <option key={x}>{x}</option>)}</select>
        <select className={sel} value={f.subject} onChange={(e) => setF({ ...f, subject: e.target.value })} data-testid="tt-cmp-subject"><option value="">{tr("All subjects", "كل المواد")}</option>{uniq((d.staff || []).flatMap((t) => t.subjects)).map((x) => <option key={x}>{x}</option>)}</select>
        <select className={sel} value={f.cls} onChange={(e) => setF({ ...f, cls: e.target.value })} data-testid="tt-cmp-cls"><option value="">{tr("All classes", "كل الصفوف")}</option>{uniq((d.staff || []).flatMap((t) => t.classes)).map((x) => <option key={x}>{x}</option>)}</select>
        <button type="button" className="rounded-full bg-[#1b3a57] px-3 py-1 text-sm font-bold text-[#f5c542]" onClick={() => setPick(all.map((t) => t.id))} data-testid="tt-cmp-all">{tr(`Select all (${all.length})`, `تحديد الكل (${all.length})`)}</button>
      </div>}
      <div className="flex max-h-40 flex-wrap gap-1.5 overflow-y-auto" data-testid="tt-cmp-list">{all.map((t) => <button key={t.id} type="button" aria-pressed={pick.includes(t.id)} onClick={() => setPick((x) => (x.includes(t.id) ? x.filter((y) => y !== t.id) : [...x, t.id]))} className={`rounded-full px-3 py-1 text-sm font-bold ring-1 ring-black/10 ${pick.includes(t.id) ? "bg-[#1b3a57] text-[#f5c542]" : "bg-white"}`} data-testid="tt-cmp-t">{t.name}</button>)}</div>
      <button type="button" disabled={pick.length < 1} className="rounded-full bg-[#f5c542] px-5 py-1.5 font-extrabold text-[#1b3a57] disabled:opacity-50" onClick={run} data-testid="tt-cmp-run">{tr("Show combined grid", "عرض الجدول المجمّع")}</button>
      {msg && <p className="text-sm font-bold text-rose-700">{msg}</p>}
      {res && <div className="overflow-x-auto"><table className="w-full border-separate border-spacing-1 text-xs" data-testid="tt-cmp-grid"><thead><tr><th className="w-16">{tr("Time", "الوقت")}</th>{days.map((x) => <th key={x}>{tr(DOW[x][0], DOW[x][1])}</th>)}</tr></thead>
        <tbody>{slots.map((m) => <tr key={m}><td className="font-bold">{h12(toHM(m))}</td>{days.map((x) => { const b = busyRows(x, m); const meBusy = b.some((r) => r.teacher === myId); const others = b.some((r) => r.teacher !== myId); const tone = meBusy ? "bg-rose-500 text-white" : others ? "bg-amber-300 text-[#1b2f44]" : "bg-emerald-400 font-bold text-emerald-950"; const label = meBusy ? tr("Busy for me", "مشغول لي") : others ? tr("Busy for others", "مشغول للآخرين") : tr("Free for all", "متاح للجميع"); const detail = b.map((r) => `${names[r.teacher] || r.teacherName || r.teacher}${secTxt(r) ? ` · ${secTxt(r)}` : r.cls ? ` · ${r.cls}` : ""}`).join("; "); return <td key={x} className={`rounded-lg px-1.5 py-1 align-top ${tone}`} data-testid={meBusy ? "tt-cmp-me" : others ? "tt-cmp-others" : "tt-cmp-free"} title={detail || label}><span className="block text-[10px] font-extrabold opacity-90">{label}</span>{b.length ? detail : "✓"}</td>; })}</tr>)}</tbody></table>
        <p className="mt-1 flex flex-wrap gap-3 text-xs opacity-80"><span><i className="me-1 inline-block h-3 w-3 rounded-sm bg-rose-500" />{tr("Red = Busy for me", "أحمر = مشغول لي")}</span><span><i className="me-1 inline-block h-3 w-3 rounded-sm bg-amber-300" />{tr("Yellow = Busy for others", "أصفر = مشغول للآخرين")}</span><span><i className="me-1 inline-block h-3 w-3 rounded-sm bg-emerald-400" />{tr("Green = Free for all", "أخضر = متاح للجميع")}</span></p></div>}
    </section>
  );
}

/** t384: peer observation requests — approve / decline the ones for me, see the status of mine. */
function ObsPanel({ d, onChange }: { d: TtData; onChange: () => void }) {
  const { tr } = useTr();
  const me = lmsSession()?.user?.id || "";
  const list = d.obs || [];
  if (!list.length) return null;
  const reply = async (id: string, approve: boolean) => { try { await modCall("att-tt-obs-reply", { id, approve }, false); onChange(); } catch { /* */ } };
  const del = async (id: string) => { try { await modCall("att-tt-obs-del", { id }, false); onChange(); } catch { /* */ } };
  return (
    <section className="space-y-2 rounded-3xl bg-white/90 p-3 text-[#1b2f44] ring-1 ring-black/5" data-testid="tt-obs">
      <h3 className="font-extrabold">👀 {tr("Peer observations", "ملاحظات الزملاء")}</h3>
      {list.map((o) => { const mine = o.req === me; return (
        <div key={o.id} className="flex flex-wrap items-center gap-2 rounded-2xl bg-amber-50 px-3 py-2 text-sm" data-testid="tt-obs-item">
          <span className="font-bold">{o.day} {h12(o.s)} – {h12(o.e)}</span><span>{mine ? tr(`You → ${o.targetName}`, `أنت ← ${o.targetName}`) : tr(`${o.reqName} would like to observe you`, `${o.reqName} يرغب في ملاحظتك`)}</span><span className="opacity-70">{o.cls} {o.subject}</span>{o.note && <i className="opacity-70">“{o.note}”</i>}
          <span className="flex-1" />
          <b className={o.status === "approved" ? "text-emerald-700" : o.status === "declined" ? "text-rose-700" : "text-amber-700"} data-testid="tt-obs-status">{o.status === "approved" ? tr("Approved", "موافق عليه") : o.status === "declined" ? tr("Declined", "مرفوض") : tr("Waiting", "بانتظار الرد")}</b>
          {!mine && o.status === "pending" && <><button type="button" className="rounded-full bg-emerald-600 px-3 py-1 font-bold text-white" onClick={() => reply(o.id, true)} data-testid="tt-obs-approve">{tr("Approve", "موافقة")}</button><button type="button" className="rounded-full bg-rose-600 px-3 py-1 font-bold text-white" onClick={() => reply(o.id, false)} data-testid="tt-obs-decline">{tr("Decline", "رفض")}</button></>}
          {(mine || o.status !== "pending") && <button type="button" className="text-xs underline" onClick={() => del(o.id)} data-testid="tt-obs-del">{tr("Remove", "إزالة")}</button>}
        </div>); })}
    </section>
  );
}

/** t516: period + duty timings editor — used on the admin timetable page and Attendance settings. */
export function PeriodTimes({ onSaved }: { onSaved?: () => void } = {}) {
  const { tr } = useTr();
  const [t, setT] = useState<Record<string, { s: string; e: string }>>({});
  const [msg, setMsg] = useState("");
  useEffect(() => { modCall<{ times: Record<string, { s: string; e: string }> }>("att-times", {}, true).then((r) => setT(r.times || {})).catch(() => undefined); }, []);
  const save = async () => {
    try {
      const r = await modCall<{ times: Record<string, { s: string; e: string }> }>("att-times-save", { times: t }, true);
      setT(r.times); setMsg(tr("Saved.", "تم الحفظ.")); onSaved?.();
    } catch (e) { setMsg(modErr(e, tr)); }
  };
  const duties = dutyKeys(t);
  const addDuty = () => {
    const n = duties.reduce((m, k) => Math.max(m, Number(k.slice(1)) || 0), 0) + 1;
    setT({ ...t, [`D${n}`]: { s: "07:30", e: "08:00" } });
  };
  const row = (pid: string, label: string) => (
    <div key={pid} className="flex flex-wrap items-center gap-2 text-sm" data-testid={`tt-time-row-${pid}`}>
      <b className="w-28">{label}</b>
      <input type="time" className={fld + " !w-auto"} value={t[pid]?.s || ""} onChange={(e) => setT({ ...t, [pid]: { s: e.target.value, e: t[pid]?.e || "" } })} aria-label={tr("Start", "البداية")} data-testid={`att-time-s-${pid}`} />
      <span>–</span>
      <input type="time" className={fld + " !w-auto"} value={t[pid]?.e || ""} onChange={(e) => setT({ ...t, [pid]: { s: t[pid]?.s || "", e: e.target.value } })} aria-label={tr("End", "النهاية")} data-testid={`att-time-e-${pid}`} />
      {pid.startsWith("D") && <button type="button" className="text-xs font-bold text-rose-700 underline" onClick={() => { const n = { ...t }; delete n[pid]; setT(n); }} data-testid={`tt-duty-del-${pid}`}>{tr("Remove", "إزالة")}</button>}
    </div>
  );
  return (
    <section className={card + " max-w-xl space-y-2"} data-testid="att-times">
      <h3 className="font-extrabold">⏱ {tr("Timetable settings — period timings", "إعدادات الجدول — أوقات الحصص")}</h3>
      {PIDS.map((p) => row(p, pidLabel(p, tr)))}
      <h4 className="pt-2 font-extrabold">🛡️ {tr("Duty timings", "أوقات المناوبة")}</h4>
      <p className="text-xs opacity-70">{tr("Add start and end times for duties (morning duty, break duty, and so on). They appear as choices when you add a timetable event.", "أضف وقت بداية ونهاية للمناوبات (صباحية أو الاستراحة وغيرها). تظهر كخيارات عند إضافة حدث في الجدول.")}</p>
      {duties.map((p) => row(p, pidLabel(p, tr)))}
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" className={pill} onClick={addDuty} data-testid="tt-duty-add">+ {tr("Add duty timing", "إضافة وقت مناوبة")}</button>
        <button type="button" className="rounded-full bg-sun px-5 py-2 text-sm font-bold text-[#0b1b2b]" onClick={save} data-testid="att-times-save">{tr("Save timings", "حفظ الأوقات")}</button>
      </div>
      {msg && <p className="text-sm font-semibold" role="status">{msg}</p>}
    </section>
  );
}

/** t388: admin Dashboard widget — today's glass strip for all teachers (or one), plus a link to the full Timetable page. */
export function AdminTtWidget({ onOpen }: { onOpen: () => void }) {
  const { tr } = useTr();
  const { d, load } = useTimetable(true);
  const [t, setT] = useState("");
  const [cmp, setCmp] = useState(false);
  const [cov, setCov] = useState(false);
  const [today0] = useState(() => new Date(Date.now() + 4 * 3600e3).toISOString().slice(0, 10));
  if (!d) return null;
  SECMAP = d.secMap || SECMAP;
  const rows = d.timetable.filter((r) => !t || r.teacher === t);
  const names = [...new Map(d.timetable.filter((r) => r.teacher).map((r) => [r.teacher, r.teacherName || r.teacher])).entries()].sort((a, b) => a[1].localeCompare(b[1]));
  const lessons = d.timetable.filter((r) => !String(r.id).startsWith("cover-")).length;
  return (
    <section className="space-y-2 rounded-3xl bg-white/85 p-4 text-[#1b2f44] shadow-sm ring-1 ring-black/5" data-testid="admin-tt-widget">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="text-lg font-extrabold">🗓️ {tr("Today's timetable", "جدول اليوم")}</h2>
        <span className="text-xs opacity-60">{tr(DOW[d.now.dow][0], DOW[d.now.dow][1])} · {d.now.hm}</span>
        <span className="rounded-full bg-[#1b3a57]/10 px-2 py-0.5 text-xs font-bold">{lessons} {tr("lessons", "حصة")}</span>
        <span className="flex-1" />
        <LeadPicker d={d} asAdmin={true} onSaved={load} />
        <select className="rounded-xl border border-black/10 bg-white px-2 py-1 text-sm" value={t} onChange={(e) => setT(e.target.value)} aria-label={tr("Teacher", "المعلم")} data-testid="admin-tt-teacher"><option value="">{tr("All teachers", "كل المعلمين")}</option>{names.map(([id, n]) => <option key={id} value={id}>{n}</option>)}</select>
        {d.acc.add && <button type="button" onClick={onOpen} className="rounded-full bg-sun px-3 py-1.5 text-sm font-bold text-[#0b1b2b]" data-testid="admin-tt-add">+ {tr("Add event", "إضافة حدث")}</button>}
        <button type="button" onClick={() => { history.replaceState(history.state, "", location.pathname + "?year=1" + location.hash); onOpen(); }} className="rounded-full bg-[#1b3a57] px-3 py-1.5 text-sm font-bold text-[#f5c542]" data-testid="admin-tt-year">📅 {tr("Year calendar", "التقويم السنوي")}</button>
        <button type="button" onClick={() => setCov(!cov)} className="rounded-full bg-rose-100 px-3 py-1.5 text-sm font-bold text-rose-900" data-testid="admin-tt-cover">🛟 {tr("Assign Cover", "تعيين احتياط")}</button>
        <button type="button" onClick={() => setCmp(!cmp)} className="rounded-full bg-[#1b3a57] px-3 py-1.5 text-sm font-bold text-[#f5c542]" data-testid="admin-tt-compare">⚖️ {tr("Compare", "مقارنة")}</button>
        <button type="button" onClick={onOpen} className="rounded-full border border-black/10 px-3 py-1.5 text-sm font-bold" data-testid="admin-tt-open">⬇️ {tr("Download / manage", "تنزيل / إدارة")}</button>
      </div>
      {cov && <CoverPanel d={d} asAdmin={true} day0={today0} onClose={() => setCov(false)} onSaved={load} />}
      {cmp && <ComparePanel d={d} asAdmin={true} />}
      {d.acc.add && <AdminLeads asAdmin={true} />}
      <TtDash rows={rows} times={d.times} now={d.now} testId="admin-tt-strip" />
    </section>
  );
}