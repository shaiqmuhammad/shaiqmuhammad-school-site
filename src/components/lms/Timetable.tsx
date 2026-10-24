"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AssessmentShell } from "@/components/assessment/AssessmentShell";
import { LmsStaffToolbar } from "@/components/lms/LmsEntry";
import { useLmsActor, useTr } from "@/components/lms/useLms";
import { modCall, modErr, pdfTable, xlsxTable } from "@/lib/lmsMods";
import { RosterPicker, rosterIds, useRosterData } from "@/components/lms/ClassLaunch";

export type TtRow = { id: string; dow: number; period: string; cls: string; sections: string[]; teacher: string; teacherName: string; subject: string; phase: string; dept: string; s?: string; e?: string; color?: string };
export type TtShare = { id: string; by: string; byName: string; title: string; rows: TtRow[]; n: number; mine: boolean; at: number };
/** t317: a lesson's own times win over its period's saved times. */
export const seOf = (r: TtRow, times: Record<string, { s: string; e: string }>) => ({ s: r.s || times[r.period]?.s || "", e: r.e || times[r.period]?.e || "" });
export const SWATCHES = ["#bae6fd", "#fde68a", "#bbf7d0", "#ddd6fe", "#fecdd3", "#a5f3fc", "#fed7aa", "#e5e7eb"];
export type TtData = {
  times: Record<string, { s: string; e: string }>; timetable: TtRow[]; now: { dow: number; hm: string; period: string }; current: TtRow | null;
  teachers: { id: string; name: string; subject: string; phase: string }[]; catalog: { subjects: string[]; classes: { id: string; name: string; sections: string[] }[] };
  phases: string[]; depts: string[]; acc: { show: boolean; view: boolean; add: boolean; edit: boolean; delete: boolean; share?: boolean; xlsx?: boolean; pdf?: boolean }; lead: number; shared?: TtShare[];
};
export const DOW: [string, string][] = [["Sun", "الأحد"], ["Mon", "الاثنين"], ["Tue", "الثلاثاء"], ["Wed", "الأربعاء"], ["Thu", "الخميس"], ["Fri", "الجمعة"], ["Sat", "السبت"]];
const PIDS = ["P1", "P2", "P3", "P4", "P5", "P6", "P7", "P8"];
const card = "rounded-3xl bg-white/85 p-4 shadow-sm ring-1 ring-black/5 dark:bg-white/5 dark:ring-white/10";
const fld = "w-full rounded-xl border border-black/10 bg-white px-3 py-2 text-sm dark:border-white/15 dark:bg-white/5";
const pill = "rounded-full border border-black/10 px-3 py-1.5 text-sm font-bold dark:border-white/15";
const TONES = ["from-sky-100 to-sky-200", "from-amber-100 to-amber-200", "from-emerald-100 to-emerald-200", "from-violet-100 to-violet-200", "from-rose-100 to-rose-200", "from-cyan-100 to-cyan-200"];
const tone = (s: string) => { let h = 0; for (const c of s) h = (h * 31 + c.charCodeAt(0)) >>> 0; return TONES[h % TONES.length]; };
const secTxt = (r: TtRow) => `${r.cls}${r.sections.length ? " " + r.sections.join("") : ""}`;

export function useTimetable(asAdmin = false) {
  const [d, setD] = useState<TtData | null>(null);
  const [err, setErr] = useState("");
  const { tr } = useTr();
  const load = useCallback(() => modCall<TtData>("att-times", {}, asAdmin).then((x) => { setD(x); setErr(""); }).catch((e) => setErr(modErr(e, tr))), [asAdmin, tr]);
  useEffect(() => { load(); }, [load]);
  return { d, err, load };
}

/** t304: "Today's lessons" strip for the top of the dashboard (hidden when there is no timetable or it is switched off). */
export function TodayLessons() {
  const { tr } = useTr();
  const { d } = useTimetable(false);
  if (!d || !d.acc.view) return null;
  const today = d.timetable.filter((r) => r.dow === d.now.dow).sort((a, b) => (seOf(a, d.times).s || a.period).localeCompare(seOf(b, d.times).s || b.period));
  if (!d.timetable.length) return null;
  return (
    <section className={card + " !p-3"} data-testid="today-lessons">
      <div className="mb-2 flex items-center gap-2"><h2 className="text-base font-extrabold">🗓️ {tr("Today's lessons", "حصص اليوم")}</h2><span className="text-xs opacity-60">{tr(DOW[d.now.dow][0], DOW[d.now.dow][1])} · {d.now.hm}</span><span className="flex-1" /><a href="/lms/timetable" className="text-sm font-bold text-header underline dark:text-sun" data-testid="today-full">{tr("Full timetable", "الجدول كاملًا")} →</a></div>
      {!today.length ? <p className="text-sm opacity-70" data-testid="today-none">{tr("No lessons today 🎉", "لا توجد حصص اليوم 🎉")}</p> : (
        <ol className="flex gap-2 overflow-x-auto pb-1" data-testid="today-list">
          {today.map((r) => { const t0 = seOf(r, d.times); const t = t0.s ? t0 : null; const live = !!t && t.s <= d.now.hm && d.now.hm < t.e; const past = !!t && t.e <= d.now.hm; return (
            <li key={r.id} style={r.color ? { background: r.color } : undefined} className={`min-w-[9.5rem] shrink-0 rounded-2xl bg-gradient-to-br ${r.color ? "" : tone(r.subject)} px-3 py-2 text-[#1b2f44] ${live ? "ring-4 ring-emerald-400" : ""} ${past ? "opacity-50" : ""}`} data-testid="today-lesson">
              <p className="text-xs font-bold opacity-70">{t ? `${t.s}–${t.e}` : tr(`Period ${r.period.slice(1)}`, `الحصة ${r.period.slice(1)}`)}{live ? ` · ${tr("Now", "الآن")}` : ""}</p>
              <p className="font-extrabold" dir="auto">{r.subject || tr("Lesson", "حصة")}</p>
              <p className="text-xs" dir="auto">{secTxt(r)}{r.teacherName ? ` · ${r.teacherName}` : ""}</p>
            </li>
          ); })}
        </ol>
      )}
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

type Draft = { id?: string; dows: number[]; period: string; cls: string; sections: string[]; teacher: string; subject: string; phase: string; dept: string; same: boolean; s: string; e: string; per: Record<number, { s: string; e: string }>; color: string };
const EMPTY: Draft = { dows: [1], period: "", cls: "", sections: [], teacher: "", subject: "", phase: "", dept: "", same: true, s: "08:00", e: "08:45", per: {}, color: "" };

/** Full timetable: week grid (or list on phones), filters by phase / department / teacher / subject / class, and add / edit / delete per permission. */
export function TimetableManager({ asAdmin }: { asAdmin: boolean }) {
  const { tr } = useTr();
  const { d, err, load } = useTimetable(asAdmin);
  const [f, setF] = useState({ phase: "", dept: "", teacher: "", subject: "", cls: "" });
  const [ed, setEd] = useState<Draft | null>(null);
  const [msg, setMsg] = useState("");
  const rows = useMemo(() => (d?.timetable || []).filter((r) => (!f.phase || r.phase === f.phase) && (!f.dept || r.dept === f.dept) && (!f.teacher || r.teacher === f.teacher) && (!f.subject || r.subject === f.subject) && (!f.cls || r.cls === f.cls)), [d, f]);
  if (err) return <p className="rounded-2xl bg-amber-100 px-4 py-3 text-amber-900" data-testid="tt-hidden">{/module_hidden|forbidden/.test(err) ? tr("The timetable is switched off for your account.", "الجدول متوقف لحسابك.") : err}</p>;
  if (!d) return <p className="py-8 text-center opacity-60">{tr("Loading…", "جارٍ التحميل…")}</p>;
  const days = [...new Set([1, 2, 3, 4, 5, ...d.timetable.map((r) => r.dow)])].sort((a, b) => ((a + 6) % 7) - ((b + 6) % 7));
  const uniq = (xs: string[]) => [...new Set(xs.filter(Boolean))].sort();
  const subjects = uniq([...d.catalog.subjects, ...d.timetable.map((r) => r.subject)]);
  const classes = d.catalog.classes.length ? d.catalog.classes : uniq(d.timetable.map((r) => r.cls)).map((n) => ({ id: n, name: n, sections: [] as string[] }));
  const canAdd = d.acc.add, canEdit = d.acc.edit, canDel = d.acc.delete;
  const save = async () => {
    if (!ed) return;
    const days = ed.dows.map((dow) => ({ dow, ...(ed.period ? { s: "", e: "" } : ed.same ? { s: ed.s, e: ed.e } : ed.per[dow] || { s: ed.s, e: ed.e }) }));
    if (!ed.period && days.some((x) => !x.s || !x.e || x.s >= x.e)) { setMsg(tr("Choose a start time before the end time for every day.", "اختر وقت بداية قبل النهاية لكل يوم.")); return; }
    try { await modCall("att-tt-save", { ...ed, days }, asAdmin); setMsg(ed.id ? tr("Lesson updated.", "تم تحديث الحصة.") : tr("Lesson added.", "تمت إضافة الحصة.")); setEd(null); load(); } catch (e) { setMsg(modErr(e, tr)); }
  };
  const del = async (r: TtRow) => { if (!confirm(tr("Delete this lesson?", "حذف هذه الحصة؟"))) return; try { await modCall("att-tt-del", { id: r.id }, asAdmin); load(); } catch (e) { setMsg(modErr(e, tr)); } };
  const sel = (k: keyof typeof f, label: string, opts: [string, string][], id: string) => (
    <select className={fld + " !w-auto"} value={f[k]} onChange={(e) => setF({ ...f, [k]: e.target.value })} aria-label={label} data-testid={id}><option value="">{label}</option>{opts.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
  );
  const cell = (r: TtRow) => (
    <div key={r.id} style={r.color ? { background: r.color } : undefined} className={`rounded-xl bg-gradient-to-br ${r.color ? "" : tone(r.subject)} px-2 py-1.5 text-start text-xs text-[#1b2f44]`} data-testid="tt-cell">
      <p className="font-extrabold" dir="auto">{r.subject || "—"}</p><p className="opacity-70" data-testid="tt-cell-time">{seOf(r, d.times).s ? `${seOf(r, d.times).s}–${seOf(r, d.times).e}` : ""}</p><p dir="auto">{secTxt(r)}</p>{r.teacherName && <p className="opacity-70" dir="auto">{r.teacherName}</p>}
      {(canEdit || canDel) && <p className="mt-1 flex gap-1">{canEdit && <button type="button" className="rounded-full bg-white/70 px-1.5" onClick={() => { const t = seOf(r, d.times); setEd({ id: r.id, dows: [r.dow], period: r.s ? "" : r.period, cls: r.cls, sections: r.sections, teacher: r.teacher, subject: r.subject, phase: r.phase, dept: r.dept, same: true, s: t.s || "08:00", e: t.e || "08:45", per: {}, color: r.color || "" }); }} aria-label={tr("Edit", "تعديل")} data-testid="tt-edit">✎</button>}{canDel && <button type="button" className="rounded-full bg-white/70 px-1.5" onClick={() => del(r)} aria-label={tr("Delete", "حذف")} data-testid="tt-del">🗑</button>}</p>}
    </div>
  );
  const clsSections = classes.find((c) => c.name === ed?.cls)?.sections || [];
  const slotKey = (r: TtRow) => { const t = seOf(r, d.times); return t.s ? `${t.s}-${t.e}` : r.period; };
  const slots = [...new Map(rows.map((r) => { const t = seOf(r, d.times); return [slotKey(r), { k: slotKey(r), s: t.s, e: t.e, label: t.s ? `${t.s}–${t.e}` : tr(`Period ${r.period.slice(1)}`, `الحصة ${r.period.slice(1)}`) }]; })).values()].sort((a, b) => (a.s || a.k).localeCompare(b.s || b.k));
  return (
    <div className="space-y-3" data-testid="att-timetable">
      <div className="flex flex-wrap items-center gap-2">
        <p className="text-sm font-semibold opacity-80" data-testid="tt-now">🕒 {tr(DOW[d.now.dow][0], DOW[d.now.dow][1])} {d.now.hm} {tr("(Dubai)", "(دبي)")} · {d.now.period ? tr(`Now: Period ${d.now.period.slice(1)}`, `الآن: الحصة ${d.now.period.slice(1)}`) : tr("No period running now", "لا توجد حصة الآن")}</p>
        <span className="flex-1" />
        {!asAdmin && <LeadPicker d={d} asAdmin={asAdmin} onSaved={load} />}
      </div>
      <div className="flex flex-wrap gap-2" data-testid="tt-filters">
        {sel("phase", tr("All phases", "كل المراحل"), uniq([...d.phases, ...d.timetable.map((r) => r.phase)]).map((x) => [x, x]), "tt-f-phase")}
        {sel("dept", tr("All departments", "كل الأقسام"), uniq([...d.depts]).map((x) => [x, x]), "tt-f-dept")}
        {d.teachers.length > 1 && sel("teacher", tr("All teachers", "كل المعلمين"), d.teachers.map((t) => [t.id, t.name]), "tt-f-teacher")}
        {sel("subject", tr("All subjects", "كل المواد"), subjects.map((x) => [x, x]), "tt-f-subject")}
        {sel("cls", tr("All classes", "كل الصفوف"), uniq([...classes.map((c) => c.name), ...d.timetable.map((r) => r.cls)]).map((x) => [x, x]), "tt-f-cls")}
        {canAdd && <button type="button" className="rounded-full bg-sun px-4 py-1.5 text-sm font-bold text-[#0b1b2b]" onClick={() => setEd({ ...EMPTY, teacher: asAdmin ? "" : d.teachers[0]?.id || "" })} data-testid="tt-new">+ {tr("Add lesson", "إضافة حصة")}</button>}
      </div>
      {msg && <p className="rounded-xl bg-emerald-100 px-3 py-2 text-sm font-bold text-emerald-900" role="status" data-testid="tt-msg">{msg}</p>}
      {ed && (
        <div className={card + " grid gap-3 sm:grid-cols-2 lg:grid-cols-4"} data-testid="tt-add">
          <fieldset className="sm:col-span-2 lg:col-span-4"><legend className="text-sm font-bold">{tr("Days", "الأيام")}</legend><div className="mt-1 flex flex-wrap gap-1.5">{DOW.map((x, i) => <button key={i} type="button" aria-pressed={ed.dows.includes(i)} disabled={!!ed.id && !ed.dows.includes(i) && ed.dows.length >= 1} onClick={() => setEd({ ...ed, dows: ed.dows.includes(i) ? ed.dows.filter((y) => y !== i) : [...ed.dows, i] })} className={`${pill} ${ed.dows.includes(i) ? "!bg-header !text-white" : ""} disabled:opacity-40`} data-testid={`tt-dow-${i}`}>{tr(x[0], x[1])}</button>)}</div></fieldset>
          <div className="space-y-2 sm:col-span-2 lg:col-span-4" data-testid="tt-times">
            <label className="flex items-center gap-2 text-sm font-bold"><input type="checkbox" checked={ed.same} disabled={!!ed.id} onChange={(e) => setEd({ ...ed, same: e.target.checked })} data-testid="tt-same" /> {tr("Same start and end time for all chosen days", "نفس وقت البداية والنهاية لكل الأيام")}</label>
            {ed.same ? <div className="flex flex-wrap items-center gap-2"><label className="text-sm font-bold">{tr("Start", "البداية")} <input type="time" className={fld + " !w-auto"} value={ed.s} onChange={(e) => setEd({ ...ed, s: e.target.value })} data-testid="tt-start" /></label><label className="text-sm font-bold">{tr("End", "النهاية")} <input type="time" className={fld + " !w-auto"} value={ed.e} onChange={(e) => setEd({ ...ed, e: e.target.value })} data-testid="tt-end" /></label></div>
              : <div className="grid gap-1.5" data-testid="tt-per-day">{ed.dows.map((x) => { const v = ed.per[x] || { s: ed.s, e: ed.e }; return <div key={x} className="flex flex-wrap items-center gap-2 text-sm"><b className="w-20">{tr(DOW[x][0], DOW[x][1])}</b><input type="time" className={fld + " !w-auto"} value={v.s} onChange={(e) => setEd({ ...ed, per: { ...ed.per, [x]: { ...v, s: e.target.value } } })} data-testid={`tt-start-${x}`} />–<input type="time" className={fld + " !w-auto"} value={v.e} onChange={(e) => setEd({ ...ed, per: { ...ed.per, [x]: { ...v, e: e.target.value } } })} data-testid={`tt-end-${x}`} /></div>; })}</div>}
            <div className="flex flex-wrap items-center gap-1.5 text-sm font-bold" data-testid="tt-color">{tr("Colour", "اللون")}{SWATCHES.map((c) => <button key={c} type="button" aria-label={c} aria-pressed={ed.color === c} onClick={() => setEd({ ...ed, color: c })} className={`h-7 w-7 rounded-full border-2 ${ed.color === c ? "border-header" : "border-black/10"}`} style={{ background: c }} data-testid="tt-swatch" />)}<input type="color" value={ed.color || "#bae6fd"} onChange={(e) => setEd({ ...ed, color: e.target.value })} aria-label={tr("Custom colour", "لون مخصص")} data-testid="tt-color-custom" />{ed.color && <button type="button" className="text-xs underline" onClick={() => setEd({ ...ed, color: "" })}>{tr("Auto", "تلقائي")}</button>}</div>
          </div>
          <label className="text-sm font-bold">{tr("Period (optional — uses its saved times)", "الحصة (اختياري — تستخدم أوقاتها المحفوظة)")}<select className={fld + " mt-1"} value={ed.period} onChange={(e) => setEd({ ...ed, period: e.target.value })} data-testid="tt-period"><option value="">{tr("— own times above —", "— الأوقات أعلاه —")}</option>{PIDS.map((p) => <option key={p} value={p}>{tr(`Period ${p.slice(1)}`, `الحصة ${p.slice(1)}`)}{d.times[p] ? ` (${d.times[p].s}–${d.times[p].e})` : ""}</option>)}</select></label>
          <label className="text-sm font-bold">{tr("Phase", "المرحلة")}<select className={fld + " mt-1"} value={ed.phase} onChange={(e) => setEd({ ...ed, phase: e.target.value })} data-testid="tt-phase"><option value="">—</option>{uniq([...d.phases, ed.phase]).map((x) => <option key={x}>{x}</option>)}</select></label>
          <label className="text-sm font-bold">{tr("Department", "القسم")}<input className={fld + " mt-1"} list="tt-depts" value={ed.dept} onChange={(e) => setEd({ ...ed, dept: e.target.value })} placeholder={tr("Choose or type", "اختر أو اكتب")} data-testid="tt-dept" /><datalist id="tt-depts">{d.depts.map((x) => <option key={x} value={x} />)}</datalist></label>
          <label className="text-sm font-bold">{tr("Subject", "المادة")}<select className={fld + " mt-1"} value={ed.subject} onChange={(e) => setEd({ ...ed, subject: e.target.value })} data-testid="tt-subject"><option value="">—</option>{uniq([...subjects, ed.subject]).map((x) => <option key={x}>{x}</option>)}</select></label>
          {asAdmin ? <label className="text-sm font-bold">{tr("Teacher", "المعلم")}<select className={fld + " mt-1"} value={ed.teacher} onChange={(e) => { const t = d.teachers.find((x) => x.id === e.target.value); setEd({ ...ed, teacher: e.target.value, subject: ed.subject || t?.subject?.split(",")[0] || "", phase: ed.phase || t?.phase || "" }); }} data-testid="tt-teacher"><option value="">—</option>{d.teachers.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</select></label> : null}
          <label className="text-sm font-bold">{tr("Class", "الصف")}<select className={fld + " mt-1"} value={ed.cls} onChange={(e) => setEd({ ...ed, cls: e.target.value, sections: [] })} data-testid="tt-cls"><option value="">—</option>{uniq([...classes.map((c) => c.name), ed.cls]).map((x) => <option key={x}>{x}</option>)}</select></label>
          <fieldset className="sm:col-span-2"><legend className="text-sm font-bold">{tr("Sections (choose one or more; none = whole class)", "الشعب (واحدة أو أكثر؛ بلا اختيار = الصف كله)")}</legend>
            <div className="mt-1 flex flex-wrap gap-1.5" data-testid="tt-sections">{clsSections.length ? clsSections.map((x) => <button key={x} type="button" aria-pressed={ed.sections.includes(x)} onClick={() => setEd({ ...ed, sections: ed.sections.includes(x) ? ed.sections.filter((y) => y !== x) : [...ed.sections, x] })} className={`${pill} ${ed.sections.includes(x) ? "!bg-sun !text-[#0b1b2b]" : ""}`} data-testid="tt-sec">{x}</button>) : <span className="text-xs opacity-60">{ed.cls ? tr("This class has no sections.", "لا توجد شعب لهذا الصف.") : tr("Choose a class first.", "اختر الصف أولًا.")}</span>}</div>
          </fieldset>
          <div className="flex items-end gap-2 sm:col-span-2 lg:col-span-4"><button type="button" className="rounded-full bg-sun px-5 py-2 text-sm font-bold text-[#0b1b2b] disabled:opacity-50" disabled={!ed.dows.length || !ed.cls} onClick={save} data-testid="tt-add-btn">{ed.id ? tr("Save changes", "حفظ التغييرات") : tr(`Add ${ed.dows.length > 1 ? `${ed.dows.length} lessons` : "lesson"}`, "إضافة")}</button><button type="button" className={pill} onClick={() => setEd(null)}>{tr("Cancel", "إلغاء")}</button></div>
        </div>
      )}
      <TtTools d={d} rows={rows} asAdmin={asAdmin} filt={[f.phase, f.dept, d.teachers.find((t) => t.id === f.teacher)?.name || "", f.subject, f.cls].filter(Boolean).join(" · ")} />
      <div className="hidden overflow-x-auto md:block"><table className="w-full table-fixed border-separate border-spacing-1 text-sm" data-testid="tt-table"><thead><tr><th className="w-24 text-xs opacity-60">{tr("Time", "الوقت")}</th>{days.map((x) => <th key={x} className={`text-sm ${x === d.now.dow ? "text-emerald-600" : ""}`}>{tr(DOW[x][0], DOW[x][1])}</th>)}</tr></thead>
        <tbody>{slots.map((sl) => <tr key={sl.k}><td className="align-top text-xs font-bold opacity-70">{sl.label}</td>{days.map((x) => <td key={x} className={`align-top ${x === d.now.dow && sl.s && sl.s <= d.now.hm && d.now.hm < sl.e ? "rounded-xl ring-2 ring-emerald-400" : ""}`}><div className="space-y-1">{rows.filter((r) => r.dow === x && slotKey(r) === sl.k).map(cell)}</div></td>)}</tr>)}
        {!rows.length && <tr><td colSpan={days.length + 1} className="py-6 text-center opacity-60">{tr("No lessons yet.", "لا توجد حصص بعد.")}</td></tr>}</tbody></table></div>
      <div className="space-y-3 md:hidden" data-testid="tt-list">{days.map((x) => { const l = rows.filter((r) => r.dow === x); return l.length ? <section key={x}><h3 className={`mb-1 font-extrabold ${x === d.now.dow ? "text-emerald-600" : ""}`}>{tr(DOW[x][0], DOW[x][1])}</h3><div className="grid gap-1.5">{l.sort((a, b) => (seOf(a, d.times).s || a.period).localeCompare(seOf(b, d.times).s || b.period)).map((r) => <div key={r.id} className="flex items-start gap-2"><span className="w-14 shrink-0 pt-1 text-xs font-bold opacity-70">{seOf(r, d.times).s || r.period}</span><div className="flex-1">{cell(r)}</div></div>)}</div></section> : null; })}{!rows.length && <p className="py-6 text-center opacity-60">{tr("No lessons yet.", "لا توجد حصص بعد.")}</p>}</div>
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
function TtTools({ d, rows, asAdmin, filt }: { d: TtData; rows: TtRow[]; asAdmin: boolean; filt: string }) {
  const { tr, lang } = useTr();
  const [share, setShare] = useState(false);
  const ar = lang === "ar";
  const heads = [tr("Day", "اليوم"), tr("Start", "البداية"), tr("End", "النهاية"), tr("Subject", "المادة"), tr("Class", "الصف"), tr("Teacher", "المعلم")];
  const out = rowsOut(rows, d.times, tr);
  const data = out.map((r) => { const t = seOf(r, d.times); return [tr(DOW[r.dow][0], DOW[r.dow][1]), t.s || r.period, t.e, r.subject, secTxt(r), r.teacherName]; });
  const colors = out.map((r) => r.color || undefined);
  const title = `${tr("Timetable", "الجدول الدراسي")}${filt ? ` — ${filt}` : ""}`;
  const okX = d.acc.xlsx !== false, okP = d.acc.pdf !== false, okS = d.acc.share !== false && (asAdmin || d.acc.add || d.acc.edit);
  if (!rows.length) return null;
  const btn = "rounded-full border border-black/10 bg-white px-3 py-1.5 text-sm font-bold text-[#1b2f44] hover:bg-sky-50";
  return (
    <div className="space-y-2" data-testid="tt-tools">
      <div className="flex flex-wrap gap-2">
        {okP && <button type="button" className={btn} onClick={() => pdfTable({ title, subtitle: tr(`${rows.length} lessons`, `${rows.length} حصة`), headers: ar ? [...heads].reverse() : heads, rows: ar ? data.map((x) => [...x].reverse()) : data, filename: `timetable${ar ? "-ar" : ""}.pdf`, rtl: ar, rowColors: colors })} data-testid="tt-pdf">⬇️ PDF</button>}
        {okX && <button type="button" className={btn} onClick={() => xlsxTable(tr("Timetable", "الجدول"), heads, data, `timetable${ar ? "-ar" : ""}.xlsx`, [12, 9, 9, 22, 14, 22], colors, ar)} data-testid="tt-xlsx">⬇️ Excel</button>}
        {okS && <button type="button" className={btn} onClick={() => setShare(!share)} data-testid="tt-share">📤 {tr("Share", "مشاركة")}</button>}
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
