"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useLmsActor, useTr } from "@/components/lms/useLms";
import { btn, btnCta, ClassSelect, cardCls, field, groupLabel, Head, Modal, ModPage, td, th, Tabs, Toast, useRoster } from "@/components/lms/mods/ModUi";
import { addDays, modCall, modErr, modPerm, pdfTable, STATUS_CLS, STATUS_LABEL, todayStr, weekStart, xlsxTable, type AttGroup, type AttReport, type AttRoster, type Status } from "@/lib/lmsMods";

const PERIODS = ["Day", "AM", "PM", "P1", "P2", "P3", "P4", "P5", "P6", "P7", "P8"];
const ST: Status[] = ["P", "A", "L", "E"];

export function AttendancePage() { return <ModPage title="Attendance Register" perm="att">{(asAdmin) => <Attendance asAdmin={asAdmin} />}</ModPage>; }

/** Attendance Register: take a register, reports with attendance %, admin overview. */
export function Attendance({ asAdmin }: { asAdmin: boolean }) {
  const { tr } = useTr();
  const { actor } = useLmsActor();
  const perm = modPerm(actor?.perms, asAdmin, "att");
  const [tab, setTab] = useState<"register" | "reports" | "overview" | "settings">("register");
  return (
    <div data-testid="attendance" className="space-y-1">
      <Head hide={asAdmin} icon="🗓️" title={tr("Attendance Register", "سجل الحضور")} sub={tr("Take the register per class, date and period; see attendance % and who needs attention.", "سجّل الحضور لكل صف وتاريخ وحصة، وراقب النسب ومن يحتاج متابعة.")} />
      <Tabs testId="att-tabs" value={tab} onChange={setTab} items={[["register", tr("Register", "التسجيل")], ["reports", tr("Reports", "التقارير")], ["overview", tr("Overview", "نظرة عامة")], ...(asAdmin ? [["settings", tr("Settings", "الإعدادات")] as ["settings", string]] : [])]} />
      {tab === "register" && <Register asAdmin={asAdmin} canEdit={perm.edit} />}
      {tab === "reports" && <Reports asAdmin={asAdmin} />}
      {tab === "overview" && <Overview asAdmin={asAdmin} />}
      {tab === "settings" && asAdmin && <Settings />}
    </div>
  );
}

function Register({ asAdmin, canEdit }: { asAdmin: boolean; canEdit: boolean }) {
  const { tr } = useTr();
  const { groups, students } = useRoster(asAdmin);
  const [g, setG] = useState("");
  const [day, setDay] = useState(todayStr());
  const [period, setPeriod] = useState("Day");
  const [data, setData] = useState<AttRoster | null>(null);
  const [marks, setMarks] = useState<Record<string, { status: Status | ""; note: string }>>({});
  const [dirty, setDirty] = useState(false);
  const [msg, setMsg] = useState(""); const [bad, setBad] = useState(false);
  const [busy, setBusy] = useState(false);
  const [alert, setAlert] = useState<{ id: string; name: string; html?: string; body: string; subject: string; err?: string } | null>(null);
  const cur = g || groups[0]?.key || "";
  const [cls, section] = cur.split("|");
  const load = useCallback(() => {
    if (!cls && !groups.length) return;
    modCall<AttRoster>("att-roster", { cls, section, day, period }, asAdmin).then((r) => { setData(r); setMarks(Object.fromEntries(r.students.map((s) => [s.id, { status: s.status, note: s.note }]))); setDirty(false); }).catch((e) => { setMsg(modErr(e, tr)); setBad(true); });
  }, [cls, section, day, period, asAdmin, groups.length, tr]);
  useEffect(() => { if (students) load(); }, [load, students]);
  const set = (id: string, patch: Partial<{ status: Status | ""; note: string }>) => { setMarks((m) => ({ ...m, [id]: { ...m[id], ...patch } })); setDirty(true); setMsg(""); };
  const counts = useMemo(() => { const c = { P: 0, A: 0, L: 0, E: 0, none: 0 }; for (const s of data?.students || []) { const m = marks[s.id]?.status; if (m) c[m]++; else c.none++; } return c; }, [data, marks]);
  const save = async () => {
    setBusy(true); setMsg("");
    try {
      const list = (data?.students || []).filter((s) => marks[s.id]?.status).map((s) => ({ student: s.id, status: marks[s.id].status, note: marks[s.id].note }));
      const r = await modCall<{ saved: number }>("att-save", { day, period, marks: list }, asAdmin);
      setBad(false); setMsg(tr(`Register saved (${r.saved} students).`, `تم حفظ السجل (${r.saved} طالبًا).`)); load();
    } catch (e) { setBad(true); setMsg(modErr(e, tr)); }
    setBusy(false);
  };
  const openAlert = async (id: string, name: string) => {
    setAlert({ id, name, body: "", subject: "" });
    try { const r = await modCall<{ html: string; subject: string; body: string }>("att-parent-alert", { student: id, day }, asAdmin); setAlert({ id, name, html: r.html, body: r.body, subject: r.subject }); }
    catch (e) { setAlert({ id, name, body: "", subject: "", err: modErr(e, tr) }); }
  };
  const sendAlert = async () => {
    if (!alert) return;
    try { await modCall("att-parent-alert", { student: alert.id, day, body: alert.body, confirm: true }, asAdmin); setAlert(null); setBad(false); setMsg(tr("Absence notice sent to the parent.", "تم إرسال إشعار الغياب إلى ولي الأمر.")); load(); }
    catch (e) { setAlert({ ...alert, err: modErr(e, tr) }); }
  };
  const editable = !!data?.editable && canEdit;
  return (
    <div className={cardCls}>
      <div className="flex flex-wrap items-center gap-2">
        <ClassSelect groups={groups} value={cur} onChange={(v) => { setG(v); }} testId="att-class" />
        <input type="date" className={field + " w-auto!"} value={day} max={todayStr()} onChange={(e) => e.target.value && setDay(e.target.value)} aria-label={tr("Date", "التاريخ")} data-testid="att-date" />
        <select className={field + " w-auto!"} value={period} onChange={(e) => setPeriod(e.target.value)} aria-label={tr("Period", "الحصة")} data-testid="att-period">
          {PERIODS.map((p) => <option key={p} value={p}>{p === "Day" ? tr("Whole day", "اليوم كله") : p === "AM" ? tr("Morning", "صباحًا") : p === "PM" ? tr("Afternoon", "ظهرًا") : tr(`Period ${p.slice(1)}`, `الحصة ${p.slice(1)}`)}{data?.periods.includes(p) ? " ✓" : ""}</option>)}
        </select>
        <span className="flex-1" />
        {editable && <button type="button" className={btn} onClick={() => { (data?.students || []).forEach((s) => setMarks((m) => ({ ...m, [s.id]: { ...m[s.id], status: m[s.id]?.status || "P" } }))); setDirty(true); }} data-testid="att-all-present">✅ {tr("All present", "الكل حاضر")}</button>}
        {editable && <button type="button" className={btnCta} onClick={save} disabled={busy || !dirty} data-testid="att-save">{tr("Save register", "حفظ السجل")}{dirty ? " •" : ""}</button>}
      </div>
      <Toast msg={msg} bad={bad} />
      {data && !editable && <p className="mt-3 rounded-xl bg-amber-100 px-3 py-2 text-sm font-semibold text-amber-900" data-testid="att-locked">{!canEdit ? tr("View only — you don't have permission to take registers.", "للعرض فقط — ليست لديك صلاحية تسجيل الحضور.") : tr(`Locked: registers can be edited for ${data.settings.windowDays} days. Ask the admin to change an older register.`, `مقفل: يمكن تعديل السجل خلال ${data.settings.windowDays} أيام. اطلب من الإدارة تعديل سجل أقدم.`)}</p>}
      {data && (
        <p className="mt-3 flex flex-wrap gap-2 text-xs font-bold" data-testid="att-counts">
          {ST.map((s) => <span key={s} className={`rounded-full border px-2.5 py-0.5 ${STATUS_CLS[s]}`}>{tr(...STATUS_LABEL[s])} {counts[s]}</span>)}
          <span className="rounded-full border border-black/15 px-2.5 py-0.5 dark:border-white/20">{tr("Not marked", "غير مسجل")} {counts.none}</span>
        </p>
      )}
      {!data ? <p className="py-8 text-center opacity-60">{tr("Loading…", "جارٍ التحميل…")}</p> : !data.students.length ? <p className="py-8 text-center opacity-60">{tr("No students in this class.", "لا يوجد طلاب في هذا الصف.")}</p> : (
        <ul className="mt-3 divide-y divide-black/10 dark:divide-white/10" data-testid="att-rows">
          {data.students.map((s, i) => {
            const m = marks[s.id] || { status: "", note: "" };
            return (
              <li key={s.id} className="flex flex-wrap items-center gap-x-3 gap-y-2 py-2.5" data-testid="att-row">
                <span className="w-6 text-xs opacity-50">{i + 1}</span>
                <span className="min-w-[8rem] flex-1 font-semibold" dir="auto">{s.name}</span>
                <span className="flex gap-1" role="group" aria-label={tr("Status", "الحالة")}>
                  {ST.map((st) => <button key={st} type="button" disabled={!editable} aria-pressed={m.status === st} title={tr(...STATUS_LABEL[st])} onClick={() => set(s.id, { status: m.status === st ? "" : st })} data-testid={`att-${st}`} className={`h-9 min-w-9 rounded-full border px-2.5 text-sm font-extrabold transition disabled:cursor-default ${m.status === st ? STATUS_CLS[st] : "border-black/15 bg-white/70 opacity-70 hover:opacity-100 dark:border-white/20 dark:bg-white/5"}`}>{st}</button>)}
                </span>
                {(m.status === "A" || m.status === "L" || m.status === "E" || m.note) && <input className={field + " min-w-[9rem] flex-1 basis-40"} disabled={!editable} value={m.note} maxLength={200} placeholder={tr("Note (optional)", "ملاحظة (اختياري)")} onChange={(e) => set(s.id, { note: e.target.value })} dir="auto" data-testid="att-note" />}
                {s.status === "A" && !dirty && canEdit && (
                  <button type="button" className={btn} onClick={() => openAlert(s.id, s.name)} disabled={!s.parentEmail && !asAdmin} title={s.parentEmail ? "" : tr("No parent email on file", "لا يوجد بريد لولي الأمر")} data-testid="att-alert">{s.alerted ? "✉️✓" : "✉️"} {tr("Notify parent", "أبلغ ولي الأمر")}</button>
                )}
              </li>
            );
          })}
        </ul>
      )}
      {alert && (
        <Modal title={tr(`Absence notice — ${alert.name}`, `إشعار غياب — ${alert.name}`)} onClose={() => setAlert(null)} wide>
          <p className="mb-2 text-sm opacity-80">{tr("Nothing is sent until you press Send. The parent's address is never shown to you.", "لا يُرسل شيء قبل الضغط على إرسال. لا يظهر لك عنوان ولي الأمر.")}</p>
          {alert.err && <p className="mb-2 rounded-xl bg-rose-100 px-3 py-2 text-sm font-semibold text-rose-900">{alert.err}</p>}
          {!alert.html && !alert.err ? <p className="py-4 text-center opacity-60">…</p> : alert.html && (<>
            <label className="text-sm font-bold">{tr("Message", "الرسالة")}<textarea className={field + " mt-1 min-h-24"} value={alert.body} onChange={(e) => setAlert({ ...alert, body: e.target.value, html: alert.html })} dir="auto" data-testid="att-alert-body" /></label>
            <p className="mt-2 text-xs opacity-60">{tr("Subject", "الموضوع")}: {alert.subject}</p>
            <div className="mt-3 flex justify-end gap-2"><button type="button" className={btn} onClick={() => setAlert(null)}>{tr("Cancel", "إلغاء")}</button><button type="button" className={btnCta} onClick={sendAlert} data-testid="att-alert-send">✉️ {tr("Send to parent", "إرسال لولي الأمر")}</button></div>
          </>)}
        </Modal>
      )}
    </div>
  );
}

function Reports({ asAdmin }: { asAdmin: boolean }) {
  const { tr } = useTr();
  const { groups } = useRoster(asAdmin);
  const [range, setRange] = useState<"day" | "week" | "month" | "custom">("month");
  const [from, setFrom] = useState(todayStr().slice(0, 8) + "01"); const [to, setTo] = useState(todayStr());
  const [g, setG] = useState("");
  const [rep, setRep] = useState<AttReport | null>(null);
  const [one, setOne] = useState<{ id: string; name: string; rep: AttReport } | null>(null);
  const [err, setErr] = useState("");
  const pick = (r: typeof range) => { setRange(r); const t = todayStr(); if (r === "day") { setFrom(t); setTo(t); } if (r === "week") { setFrom(weekStart(t)); setTo(t); } if (r === "month") { setFrom(t.slice(0, 8) + "01"); setTo(t); } };
  const [cls, section] = g.split("|");
  useEffect(() => { modCall<AttReport>("att-report", { from, to, cls: cls || "", section: section || "" }, asAdmin).then((r) => { setRep(r); setErr(""); }).catch((e) => setErr(modErr(e, tr))); }, [from, to, cls, section, asAdmin, tr]);
  const rows = rep?.students || [];
  const tot = rows.reduce((a, r) => ({ P: a.P + r.P, A: a.A + r.A, L: a.L + r.L, E: a.E + r.E }), { P: 0, A: 0, L: 0, E: 0 });
  const counted = tot.P + tot.L + tot.A;
  const avg = counted ? Math.round(((tot.P + tot.L) / counted) * 1000) / 10 : null;
  const lowN = rows.filter((r) => r.low).length;
  const name = `attendance-${from}-to-${to}`;
  const head = [tr("Student", "الطالب"), tr("Class", "الصف"), tr("Present", "حاضر"), tr("Absent", "غائب"), tr("Late", "متأخر"), tr("Excused", "بعذر"), tr("Sessions", "الحصص"), "%", tr("Flag", "تنبيه")];
  const body = rows.map((r) => [r.name, `${r.cls} ${r.section}`.trim(), r.P, r.A, r.L, r.E, r.total, r.pct ?? "", r.low ? tr("Low", "منخفض") : ""]);
  const openOne = async (r: { id: string; name: string }) => { try { setOne({ ...r, rep: await modCall<AttReport>("att-report", { from, to, student: r.id }, asAdmin) }); } catch (e) { setErr(modErr(e, tr)); } };
  const max = Math.max(1, ...(rep?.daily || []).map((d) => d.P + d.A + d.L + d.E));
  return (
    <div className="space-y-4">
      <div className={cardCls + " flex flex-wrap items-center gap-2"}>
        <div className="flex gap-1">{(["day", "week", "month", "custom"] as const).map((r) => <button key={r} type="button" className={btn + (range === r ? " !bg-[var(--cta)] !text-[var(--cta-foreground)]" : "")} onClick={() => pick(r)} data-testid={`att-range-${r}`}>{{ day: tr("Daily", "يومي"), week: tr("Weekly", "أسبوعي"), month: tr("Monthly", "شهري"), custom: tr("Custom", "مخصص") }[r]}</button>)}</div>
        <input type="date" className={field + " w-auto!"} value={from} onChange={(e) => { setRange("custom"); setFrom(e.target.value); }} aria-label={tr("From", "من")} />
        <input type="date" className={field + " w-auto!"} value={to} max={todayStr()} onChange={(e) => { setRange("custom"); setTo(e.target.value); }} aria-label={tr("To", "إلى")} />
        <ClassSelect groups={groups} value={g} onChange={setG} all={tr("All my classes", "كل صفوفي")} testId="att-rep-class" />
        <span className="flex-1" />
        <button type="button" className={btn} onClick={() => xlsxTable("Attendance", head, body, `${name}.xlsx`)} disabled={!rows.length} data-testid="att-xlsx">⬇ Excel</button>
        <button type="button" className={btn} onClick={() => pdfTable({ title: tr("Attendance report", "تقرير الحضور"), subtitle: `${from} → ${to}${g ? " · " + groupLabel({ cls: cls, section: section }, tr) : ""} · ${tr("Low attendance below", "حضور منخفض أقل من")} ${rep?.settings.low}%`, headers: head, rows: body, filename: `${name}.pdf` })} disabled={!rows.length} data-testid="att-pdf">⬇ PDF</button>
      </div>
      {err && <Toast msg={err} bad />}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4" data-testid="att-summary">
        {[[tr("Average attendance", "متوسط الحضور"), avg === null ? "—" : `${avg}%`], [tr("Absences", "الغياب"), String(tot.A)], [tr("Late", "التأخر"), String(tot.L)], [tr("Below threshold", "تحت الحد"), `${lowN} · <${rep?.settings.low ?? 90}%`]].map(([l, v]) => <div key={l} className={cardCls}><p className="text-xs font-bold uppercase opacity-60">{l}</p><p className="mt-1 text-2xl font-extrabold">{v}</p></div>)}
      </div>
      {!!rep?.daily.length && (
        <div className={cardCls} data-testid="att-chart">
          <p className="mb-2 text-sm font-bold">{tr("Daily attendance", "الحضور اليومي")}</p>
          <div className="flex h-28 items-end gap-1 overflow-x-auto">{rep.daily.map((d) => { const t = d.P + d.A + d.L + d.E; return <div key={d.day} className="flex h-full min-w-[1.4rem] flex-1 flex-col justify-end" title={`${d.day}: P${d.P} A${d.A} L${d.L} E${d.E}`}><div className="flex flex-col-reverse overflow-hidden rounded-t" style={{ height: `${(t / max) * 100}%` }}><div className="bg-emerald-600" style={{ flex: d.P }} /><div className="bg-amber-500" style={{ flex: d.L }} /><div className="bg-sky-600" style={{ flex: d.E }} /><div className="bg-rose-600" style={{ flex: d.A }} /></div><span className="mt-1 text-center text-[10px] opacity-60">{d.day.slice(8)}</span></div>; })}</div>
        </div>
      )}
      <div className={cardCls + " overflow-x-auto p-0"}>
        <table className="w-full min-w-[640px]" data-testid="att-table">
          <thead className="border-b border-black/10 dark:border-white/10"><tr>{head.map((h) => <th key={h} className={th}>{h}</th>)}</tr></thead>
          <tbody className="divide-y divide-black/5 dark:divide-white/10">
            {rows.map((r) => (
              <tr key={r.id} className={r.low ? "bg-rose-50 dark:bg-rose-900/20" : ""} data-testid="att-trow">
                <td className={td + " font-semibold"} dir="auto"><button type="button" className="text-start underline-offset-2 hover:underline" onClick={() => openOne(r)}>{r.name}</button></td>
                <td className={td}>{r.cls} {r.section}</td><td className={td}>{r.P}</td><td className={td}>{r.A}</td><td className={td}>{r.L}</td><td className={td}>{r.E}</td><td className={td}>{r.total}</td>
                <td className={td + " font-bold"}>{r.pct === null ? "—" : `${r.pct}%`}</td><td className={td}>{r.low && <span className="rounded-full bg-rose-600 px-2 py-0.5 text-xs font-bold text-white" data-testid="att-low">⚠ {tr("Low", "منخفض")}</span>}</td>
              </tr>
            ))}
            {rep && !rows.length && <tr><td className={td + " text-center opacity-60"} colSpan={9}>{tr("No students.", "لا يوجد طلاب.")}</td></tr>}
          </tbody>
        </table>
      </div>
      <p className="text-xs opacity-60">{tr("Attendance % = (Present + Late) ÷ (Present + Late + Absent). Excused sessions don't count against a student.", "نسبة الحضور = (حاضر + متأخر) ÷ (حاضر + متأخر + غائب). الغياب بعذر لا يُحتسب.")}</p>
      {one && (
        <Modal title={`${one.name} — ${from} → ${to}`} onClose={() => setOne(null)} wide>
          <p className="mb-2 text-sm font-bold">{(() => { const r = one.rep.students[0]; return r ? `${r.pct === null ? "—" : r.pct + "%"} · P${r.P} A${r.A} L${r.L} E${r.E}` : ""; })()}</p>
          <ul className="divide-y divide-black/10 text-sm dark:divide-white/10">{(one.rep.records || []).slice().reverse().map((x, i) => <li key={i} className="flex items-center gap-3 py-1.5"><span className="w-24 shrink-0 opacity-70">{x.day}</span><span className="w-12 shrink-0 text-xs opacity-60">{x.period}</span><span className={`rounded-full border px-2 text-xs font-extrabold ${STATUS_CLS[x.status]}`}>{x.status}</span><span className="min-w-0 flex-1 truncate" dir="auto">{x.note}</span></li>)}{!(one.rep.records || []).length && <li className="py-3 opacity-60">{tr("No records.", "لا سجلات.")}</li>}</ul>
        </Modal>
      )}
    </div>
  );
}

function Overview({ asAdmin }: { asAdmin: boolean }) {
  const { tr } = useTr();
  const [day, setDay] = useState(todayStr());
  const [d, setD] = useState<{ groups: AttGroup[]; absent: { student: string; name: string; cls: string; section: string; note: string }[] } | null>(null);
  const [err, setErr] = useState("");
  useEffect(() => { modCall<{ groups: AttGroup[]; absent: { student: string; name: string; cls: string; section: string; note: string }[] }>("att-overview", { day }, asAdmin).then((r) => { setD(r); setErr(""); }).catch((e) => setErr(modErr(e, tr))); }, [day, asAdmin, tr]);
  const head = [tr("Class", "الصف"), tr("Students", "الطلاب"), tr("Marked", "المسجلون"), tr("Present", "حاضر"), tr("Absent", "غائب"), tr("Late", "متأخر"), tr("Excused", "بعذر"), tr("Registers", "السجلات")];
  const body = (d?.groups || []).map((g) => [`${g.cls} ${g.section}`.trim(), g.students, g.marked, g.P, g.A, g.L, g.E, g.periods.join(", ") || "—"]);
  return (
    <div className="space-y-4">
      <div className={cardCls + " flex flex-wrap items-center gap-2"}>
        <input type="date" className={field + " w-auto!"} value={day} max={todayStr()} onChange={(e) => e.target.value && setDay(e.target.value)} aria-label={tr("Date", "التاريخ")} data-testid="att-ov-date" />
        <button type="button" className={btn} onClick={() => setDay(addDays(day, -1))}>‹</button><button type="button" className={btn} onClick={() => day < todayStr() && setDay(addDays(day, 1))}>›</button>
        <span className="flex-1" />
        <button type="button" className={btn} onClick={() => xlsxTable("Overview", head, body, `attendance-overview-${day}.xlsx`)} disabled={!body.length}>⬇ Excel</button>
        <button type="button" className={btn} onClick={() => pdfTable({ title: tr("Attendance overview", "نظرة عامة على الحضور"), subtitle: day, headers: head, rows: body, filename: `attendance-overview-${day}.pdf` })} disabled={!body.length}>⬇ PDF</button>
      </div>
      {err && <Toast msg={err} bad />}
      <div className={cardCls + " overflow-x-auto p-0"}>
        <table className="w-full min-w-[560px]" data-testid="att-ov-table">
          <thead className="border-b border-black/10 dark:border-white/10"><tr>{head.map((h) => <th key={h} className={th}>{h}</th>)}</tr></thead>
          <tbody className="divide-y divide-black/5 dark:divide-white/10">
            {(d?.groups || []).map((g) => <tr key={g.cls + g.section} className={g.marked === 0 ? "bg-amber-50 dark:bg-amber-900/15" : ""} data-testid="att-ov-row"><td className={td + " font-semibold"}>{g.cls} {g.section}</td><td className={td}>{g.students}</td><td className={td}>{g.marked === 0 ? <span className="rounded-full bg-amber-500 px-2 py-0.5 text-xs font-bold text-[#2b1d00]">{tr("Not taken", "لم يُسجل")}</span> : g.marked}</td><td className={td}>{g.P}</td><td className={td}>{g.A}</td><td className={td}>{g.L}</td><td className={td}>{g.E}</td><td className={td + " text-xs"}>{g.periods.join(", ") || "—"}</td></tr>)}
          </tbody>
        </table>
      </div>
      {!!d?.absent.length && <div className={cardCls}><p className="mb-2 text-sm font-bold">{tr("Absent today", "الغائبون")} ({d.absent.length})</p><ul className="grid gap-1 text-sm sm:grid-cols-2">{d.absent.map((a) => <li key={a.student} className="flex gap-2"><span className="font-semibold" dir="auto">{a.name}</span><span className="opacity-60">{a.cls} {a.section}</span>{a.note && <span className="truncate opacity-70" dir="auto">— {a.note}</span>}</li>)}</ul></div>}
    </div>
  );
}

function Settings() {
  const { tr } = useTr();
  const [w, setW] = useState(7); const [l, setL] = useState(90); const [msg, setMsg] = useState("");
  useEffect(() => { modCall<AttRoster>("att-roster", {}, true).then((r) => { setW(r.settings.windowDays); setL(r.settings.low); }).catch(() => undefined); }, []);
  const save = async () => { try { await modCall("att-settings", { windowDays: w, low: l }, true); setMsg(tr("Saved.", "تم الحفظ.")); } catch (e) { setMsg(modErr(e, tr)); } };
  return (
    <div className={cardCls + " max-w-xl space-y-3"} data-testid="att-settings">
      <label className="block text-sm font-bold">{tr("Teachers can edit a register for (days)", "يمكن للمعلم تعديل السجل خلال (أيام)")}<input type="number" min={0} max={365} className={field + " mt-1"} value={w} onChange={(e) => setW(Number(e.target.value))} data-testid="att-set-window" /></label>
      <label className="block text-sm font-bold">{tr("Low-attendance flag below (%)", "تنبيه الحضور المنخفض أقل من (%)")}<input type="number" min={1} max={100} className={field + " mt-1"} value={l} onChange={(e) => setL(Number(e.target.value))} data-testid="att-set-low" /></label>
      <p className="text-xs opacity-60">{tr("Admin can always edit any date.", "الإدارة تستطيع تعديل أي تاريخ.")}</p>
      <button type="button" className={btnCta} onClick={save} data-testid="att-set-save">{tr("Save settings", "حفظ الإعدادات")}</button>
      <Toast msg={msg} />
    </div>
  );
}
