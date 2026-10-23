"use client";

import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ARABIC_SUBJECTS, useTr } from "@/components/lms/useLms";
import { useI18n } from "@/lib/i18n";
import { useAdminScope } from "@/components/AdminScope";
import { btn, cardCls, field, Tabs, Toast } from "@/components/lms/mods/ModUi";
import { modErr } from "@/lib/lmsMods";
import { StdView } from "./StdFields";
import { opRule, cellKey, exportPdf, exportXlsx, fillIsams, recalc, setTrackerAdmin, summary, TERMS, trk, type ASys, type TCell, type TGrid, type TrkAccess } from "@/lib/tracker";

/* Colours / fonts copied from the department tracker workbooks (Aptos Narrow 11, SC text Arial Narrow 12, thin black borders). */
const YEL = "#FFC000", BLUE = "#00B0F0";
const FONT = "'Aptos Narrow','Arial Narrow','Helvetica Neue',Arial,sans-serif";
const bd = "1px solid #000";
const SRC: Record<string, [string, string, string]> = { quiz: ["Q", "#7c3aed", "From the weekly assessment (questions tagged to this criterion)"], "quiz-all": ["Q*", "#b45309", "From the weekly assessment's overall % (no questions tagged to this criterion) — please check"], quran: ["H", "#059669", "From Quran homework grade"], override: ["✎", "#dc2626", "Teacher override"] };
const fmtAt = (t?: number) => (t ? new Date(t).toLocaleString("en-GB", { timeZone: "Asia/Dubai", dateStyle: "medium", timeStyle: "short" }) + " (Dubai)" : "");

type SysLite = { id: string; name: string; version: string; active: boolean; isDefault?: boolean; scope: { years: string[] } };
type Sel = { years: string[]; access: TrkAccess; systems: SysLite[] };

/** Assessment Tracker (Shaiq Muhammad System · RIS Primary Attainment and Progress System). Teachers: LMS token; admin: asAdmin. */
export function AssessmentTracker({ asAdmin = false }: { asAdmin?: boolean }) {
  const { tr } = useTr();
  setTrackerAdmin(asAdmin);
  const [sel, setSel] = useState<Sel | null>(null);
  const [cls, setCls] = useState("");
  const [sysId, setSysId] = useState(""); // "" = the default system for this class's phase
  const [term, setTerm] = useState("Term 1");
  const scope = useAdminScope();
  const subject = asAdmin ? scope.subject : ""; // teachers: the server uses their own subject
  const { lang } = useI18n();
  const [enOver, setEnOver] = useState(false);
  const [g, setG] = useState<TGrid | null>(null);
  const [view, setView] = useState<"grid" | "isams" | "audit">("grid");
  const [msg, setMsg] = useState(""); const [bad, setBad] = useState(false);
  const [err, setErr] = useState("");
  const gridRef = useRef<HTMLDivElement>(null);
  const note = (m: string, b = false) => { setMsg(m); setBad(b); setTimeout(() => setMsg(""), 5000); };
  useEffect(() => { trk<{ years: string[]; access: TrkAccess; systems: SysLite[] }>("asys-list", {}).then((r) => { setSel({ years: r.years, access: r.access, systems: r.systems }); setCls((c) => c || (r.years.length > 1 && asAdmin ? r.years[1] : r.years[0]) || ""); }).catch((e) => setErr(modErr(e, tr))); }, [tr]);
  const load = useCallback(() => { if (!cls) return; trk<TGrid>("trk-get", { cls, term, sys: sysId, subject }).then((r) => { setErr(""); setG(asAdmin && scope.studentIds ? { ...r, students: r.students.filter((s) => scope.studentIds!.has(s.id)), results: r.results.filter((s) => scope.studentIds!.has(s.id)) } : r); }).catch((e) => { setG(null); setErr(modErr(e, tr)); }); }, [cls, term, sysId, tr, subject, asAdmin, scope.studentIds]);
  const sysChoices = (sel?.systems || []).filter((x) => x.active && x.scope.years.includes(cls));
  useEffect(() => { load(); }, [load]);
  const acc = g?.access || sel?.access;
  const setTarget = async (sid: string, v: string) => { try { await trk("trk-target", { student: sid, val: v }); note(tr("Target saved.", "تم حفظ الهدف.")); load(); } catch (e) { note(modErr(e, tr), true); } };
  const set = async (sid: string, unit: string, i: number, raw: string) => {
    if (!g) return;
    const val = raw === "auto" ? null : raw === "" ? "" : Number(raw);
    const k = cellKey(sid, unit, i); const c = g.cells[k];
    const next: TCell = val === null ? { ...c, v: c.auto, src: c.autoSrc as TCell["src"], by: undefined, at: undefined } : { ...c, v: val === "" ? null : (val as number), src: "override", by: tr("you", "أنت"), at: Date.now() };
    const ng = { ...g, cells: { ...g.cells, [k]: next } }; ng.results = recalc(ng); setG(ng);
    try { await trk("trk-set", { student: sid, unit, i, val }); } catch (e) { note(modErr(e, tr), true); load(); }
  };
  const setGrade = async (sid: string, raw: string) => {
    if (!g) return;
    const val = raw === "auto" ? null : raw === "" ? "" : Number(raw);
    setG({ ...g, results: g.results.map((r) => (r.id === sid ? { ...r, grade: val === null ? r.calc : val === "" ? null : (val as number), override: val === null ? null : { by: tr("you", "أنت"), at: Date.now() } } : r)) });
    try { await trk("trk-grade", { student: sid, cls: g.cls, term: g.term, val }); } catch (e) { note(modErr(e, tr), true); load(); }
  };
  const setEffort = async (sid: string, v: string) => {
    if (!g) return;
    setG({ ...g, results: g.results.map((r) => (r.id === sid ? { ...r, effort: v } : r)) });
    try { await trk("trk-effort", { student: sid, term: g.term, val: v === "__clear" ? null : v }); } catch (e) { note(modErr(e, tr), true); load(); }
  };
  // t284: Islamic A (shares the Islamic B structure) shows topics/SCs in Arabic by default; English fills gaps; "Show in English" switches.
  const arCtx = ARABIC_SUBJECTS.includes(g?.subject || subject);
  const arT = lang === "ar" || (arCtx && !enOver);
  const arOf = (x: TGrid): TGrid => (arT ? { ...x, units: x.units.map((u) => ({ ...u, title: u.titleAr?.trim() || u.title, sc: u.sc.map((t, i) => u.scAr?.[i]?.trim() || t) })) } : x);
  const fname = (ext: string) => `Assessment Tracker - ${cls}${g?.subject ? ` - ${g.subject}` : ""} - ${term || "Year"}.${ext}`;
  const doExport = async (kind: "xlsx" | "pdf") => {
    try {
      const fresh = await trk<TGrid>("trk-export", { cls, term, kind, sys: sysId, subject });
      if (kind === "xlsx") await exportXlsx(arOf(fresh), fname("xlsx"));
      else if (gridRef.current) await exportPdf(gridRef.current, `Assessment Tracker · ${cls} · ${term || "Year"} · ${fresh.sys.name}`, fname("pdf"));
    } catch (e) { note(modErr(e, tr), true); }
  };
  const sum = useMemo(() => (g ? summary(g.results, g.sys.thresholds) : null), [g]);
  return (
    <div className="space-y-3" data-testid="assessment-tracker">
      <Toast msg={msg} bad={bad} />
      <div className={cardCls + " flex flex-wrap items-end gap-2"}>
        <div className="me-auto min-w-0"><p className="text-xl font-extrabold">✅ {tr("Assessment Tracker", "متتبع التقييم")}</p><p className="text-xs opacity-70" data-testid="trk-system">{g ? `${g.sys.name} · v${g.sys.version}` : "RIS Primary Attainment and Progress System"} · Shaiq Muhammad System</p></div>
        <label className="text-xs font-bold">{tr("Class", "الصف")}<select className={field + " mt-1 !w-36"} value={cls} onChange={(e) => setCls(e.target.value)} data-testid="trk-class">{(sel?.years || []).map((y) => <option key={y}>{y}</option>)}</select></label>
        {sysChoices.length > 1 && <label className="text-xs font-bold">{tr("System", "النظام")}<select className={field + " mt-1 !w-56"} value={sysId} onChange={(e) => setSysId(e.target.value)} data-testid="trk-sys">{[<option key="" value="">{tr("Default", "الافتراضي")} ({sysChoices.find((x) => x.isDefault)?.name || sysChoices[0].name})</option>, ...sysChoices.map((x) => <option key={x.id} value={x.id}>{x.name} v{x.version}</option>)]}</select></label>}
        <div className="flex flex-wrap gap-1.5" role="tablist" data-testid="trk-terms">{[...TERMS, ""].map((t) => <button key={t || "y"} type="button" role="tab" aria-selected={term === t} onClick={() => setTerm(t)} data-testid="trk-term" className={`rounded-full border px-3 py-1.5 text-sm font-bold ${term === t ? "border-transparent bg-header text-sun" : "border-black/10 bg-white/80 dark:border-white/15 dark:bg-white/10"}`}>{t || tr("Whole year", "السنة كاملة")}</button>)}</div>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Tabs testId="trk-view" value={view} onChange={setView} items={[["grid", tr("Tracker", "المتتبع")], ["isams", tr("iSAMS report", "تقرير iSAMS")], ...(asAdmin ? [["audit", tr("Audit", "السجل")] as ["audit", string]] : [])]} />
        <span className="flex-1" />
        {acc?.xlsx && <button type="button" className={btn} onClick={() => doExport("xlsx")} disabled={!g} data-testid="trk-xlsx">⬇ Excel</button>}
        {acc?.pdf && <button type="button" className={btn} onClick={() => doExport("pdf")} disabled={!g} data-testid="trk-pdf">⬇ PDF</button>}
      </div>
      {err && <p className="rounded-xl bg-amber-100 px-4 py-3 text-sm font-semibold text-amber-900" role="alert" data-testid="trk-error">{err}</p>}
      {arCtx && lang !== "ar" && <button type="button" className={btn} onClick={() => setEnOver((x) => !x)} data-testid="trk-lang-switch">{enOver ? "عرض بالعربية" : "Show in English"}</button>}
      {view === "grid" && g && <Grid g={arOf(g)} gridRef={gridRef} sum={sum} edit={!!acc?.edit} set={set} setGrade={setGrade} setTarget={setTarget} />}
      {view === "isams" && g && <IsamsPanel subject={g.subject || subject} g={g} access={acc!} setEffort={setEffort} asAdmin={asAdmin} note={note} />}
      {view === "audit" && asAdmin && <Audit />}
      {view === "grid" && g && <p className="text-xs opacity-70">{tr("Cell marks:", "علامات الخلايا:")} {Object.entries(SRC).map(([k, [m, c, t]]) => <span key={k} className="me-3"><b style={{ color: c }}>{m}</b> {t}</span>)}· {tr("Average and Attainment Grade recalculate on every change.", "يُعاد حساب المتوسط ودرجة التحصيل مع كل تغيير.")}</p>}
    </div>
  );
}

function Grid({ g, gridRef, sum, edit, set, setGrade, setTarget }: { g: TGrid; gridRef: React.RefObject<HTMLDivElement | null>; sum: ReturnType<typeof summary> | null; edit: boolean; set: (s: string, u: string, i: number, v: string) => void; setGrade: (s: string, v: string) => void; setTarget: (s: string, v: string) => void }) {
  const { tr } = useTr();
  const S = g.students;
  const cell = { border: bd, padding: "1px 4px", minWidth: 46, textAlign: "center" as const, fontSize: 14.6, fontFamily: FONT, position: "relative" as const, whiteSpace: "nowrap" as const };
  const a = { border: bd, padding: "1px 6px", width: 520, minWidth: 260, fontFamily: FONT, fontSize: 14.6 };
  if (!S.length) return <p className={cardCls + " text-center opacity-70"} data-testid="trk-empty">{tr("No students in this class.", "لا يوجد طلاب في هذا الصف.")}</p>;
  return (
    <div className="overflow-x-auto rounded-xl border border-black/10 bg-white text-black" data-testid="trk-grid-wrap">
      <div ref={gridRef} className="inline-block min-w-full bg-white p-2">
        <table style={{ borderCollapse: "collapse", fontFamily: FONT, fontSize: 14.6 }} data-testid="trk-grid">
          <tbody>
            <tr data-testid="trk-row-target"><th style={{ ...a, background: YEL, textAlign: "center" }}>Student Target</th>{S.map((s) => <td key={s.id} style={{ ...cell, background: YEL, textAlign: "left" }} title={s.targetSrc === "scaled" ? tr("From scaled score", "من الدرجة المعيارية") : ""} data-testid="trk-target">{s.targetMode === "teacher" && edit ? (() => { const had = !!s.target; const R = opRule(g, had, tr); return <select value={s.target} disabled={R.dis} title={R.tip} onChange={(e) => setTarget(s.id, e.target.value)} style={{ background: "transparent", font: "inherit", maxWidth: 64 }} data-testid="trk-target-sel" data-dis={R.dis ? "1" : ""} aria-label={tr("Target", "الهدف")}>{(!had || R.revert) && <option value="">{tr("Target not set", "الهدف غير محدد")}</option>}{[1, 2, 3, 4, 5, 6, 7].filter((n) => R.vals || String(n) === s.target).map((n) => <option key={n} value={String(n)}>{n}</option>)}</select>; })() : s.target || (s.targetMode === "teacher" ? <span style={{ fontSize: 10, fontStyle: "italic" }} data-testid="trk-target-unset">{tr("Target not set", "الهدف غير محدد")}</span> : "")}{s.targetSrc === "scaled" ? "*" : ""}</td>)}</tr>
            <tr><th style={{ ...a, textAlign: "center" }}>Objective</th>{S.map((s) => <td key={s.id} style={{ ...cell, border: "none", textAlign: "left" }} data-testid="trk-name" title={s.name}>{s.first || s.name.split(" ")[0]}</td>)}</tr>
            {!g.units.length && <tr><td style={a} colSpan={S.length + 1}>{tr("No curriculum Success Criteria for this class and term yet.", "لا توجد معايير نجاح لهذا الصف والفصل بعد.")}</td></tr>}
            {g.units.map((u) => (
              <Fragment key={u.id}>
                <tr data-testid="trk-topic"><th style={{ ...a, background: BLUE, textAlign: "left", fontWeight: 700, whiteSpace: "normal", borderBottom: "none" }}>{u.title} <span style={{ fontWeight: 400, fontSize: 11 }}>· {u.term} · Wk {u.wk}</span>{u.std && (u.std.skill > 0 || u.std.codes.length > 0) && <div style={{ fontWeight: 400, fontSize: 11 }} data-testid="trk-topic-std"><StdView std={u.std} compact /></div>}</th>{S.map((s) => <td key={s.id} style={{ ...cell, background: BLUE }} />)}</tr>
                {u.sc.map((t, i) => (
                  <tr key={i} data-testid="trk-sc-row">
                    <td style={{ ...a, fontFamily: "'Arial Narrow',Arial,sans-serif", fontSize: 16 }}>{t}</td>
                    {S.map((s) => { const c = g.cells[cellKey(s.id, u.id, i)]; const m = c?.src ? SRC[c.src] : null;
                      const tip = c ? [m?.[2], c.note, c.src === "override" ? `${c.by || ""} ${fmtAt(c.at)}` : "", c.src === "override" && c.auto != null ? `auto ${c.auto} (${c.autoSrc})` : ""].filter(Boolean).join(" · ") : "";
                      return <td key={s.id} style={{ ...cell, background: c?.src === "override" ? "#fff1f2" : undefined }} title={tip} data-testid="trk-cell" data-src={c?.src || ""}>
                        {edit ? (() => { const had = c?.src === "override"; const cur = had ? (c.v == null ? "" : String(c.v)) : "auto"; const R = opRule(g, had, tr); return <select aria-label={`${s.name} · ${t}`} value={cur} disabled={R.dis} title={R.tip} onChange={(e) => set(s.id, u.id, i, e.target.value)} style={{ background: "transparent", fontFamily: FONT, fontSize: 14.6, border: "none", width: "100%", textAlign: "center", appearance: "none", cursor: R.dis ? "not-allowed" : "pointer" }} data-testid="trk-cell-sel" data-dis={R.dis ? "1" : ""}>
                          {(!had || R.revert) && <option value="auto">{c?.auto == null ? "" : String(c.auto)}</option>}{[0, 1, 2, 3].filter((v) => R.vals || String(v) === cur).map((v) => <option key={v} value={v}>{v}</option>)}{(R.blank || cur === "") && <option value="">{tr("(blank)", "(فارغ)")}</option>}
                        </select>; })() : <span>{c?.v ?? ""}</span>}
                        {m && <b style={{ position: "absolute", top: 0, right: 1, fontSize: 9, color: m[1], lineHeight: 1 }}>{m[0]}</b>}
                      </td>; })}
                  </tr>
                ))}
                <tr><td style={{ ...a, border: "none", height: 18 }} />{S.map((s) => <td key={s.id} />)}</tr>
              </Fragment>
            ))}
            <tr data-testid="trk-row-avg"><th style={{ ...a, textAlign: "center" }}>Average</th>{g.results.map((r) => <td key={r.id} style={cell} data-testid="trk-avg">{r.avg == null ? "#DIV/0!" : +r.avg.toFixed(2)}</td>)}</tr>
            <tr data-testid="trk-row-grade"><th style={{ ...a, background: YEL, textAlign: "center" }}>Attainment Grade</th>{g.results.map((r) => <td key={r.id} style={{ ...cell, background: YEL, outline: r.override ? "2px solid #dc2626" : undefined, outlineOffset: -2 }} title={r.override ? `${tr("Override", "تعديل")} · ${r.override.by} ${fmtAt(r.override.at)} · auto ${r.calc ?? "–"}` : r.calc == null ? "" : tr("Calculated", "محسوبة")} data-testid="trk-grade">
              {edit ? (() => { const had = !!r.override; const cur = had ? (r.grade == null ? "" : String(r.grade)) : "auto"; const R = opRule(g, had, tr); return <select aria-label={`Attainment Grade`} value={cur} disabled={R.dis} title={R.tip} onChange={(e) => setGrade(r.id, e.target.value)} style={{ background: "transparent", border: "none", fontFamily: FONT, fontSize: 14.6, appearance: "none", textAlign: "center", width: "100%", cursor: R.dis ? "not-allowed" : "pointer", fontWeight: 700 }} data-testid="trk-grade-sel" data-dis={R.dis ? "1" : ""}>
                {(!had || R.revert) && <option value="auto">{r.calc ?? ""}</option>}{[1, 2, 3, 4, 5, 6, 7].filter((v) => R.vals || String(v) === cur).map((v) => <option key={v} value={v}>{v}</option>)}{(R.blank || cur === "") && <option value="">{tr("(blank)", "(فارغ)")}</option>}
              </select>; })() : <b>{r.grade ?? ""}</b>}{r.override && <b style={{ position: "absolute", top: 0, right: 1, fontSize: 9, color: "#dc2626" }}>✎</b>}</td>)}</tr>
          </tbody>
        </table>
        <div className="mt-2 flex flex-wrap items-start gap-4">
          <pre className="min-w-0 max-w-[520px] flex-1 whitespace-pre-wrap rounded-none p-2 text-[13px] leading-snug" style={{ fontFamily: FONT, textAlign: "center" }} data-testid="trk-key">{g.sys.key}</pre>
          {sum && <table className="ms-auto" style={{ fontFamily: FONT, fontSize: 14.6, borderCollapse: "collapse" }} data-testid="trk-summary"><tbody>
            {sum.rows.map((r, i) => (
              <Fragment key={r.label}>
                <tr><td className="pe-4">{r.label}</td><td data-testid="trk-sum-n">{r.n}</td></tr>
                <tr><td>%</td><td data-testid="trk-sum-pct">{r.pct == null ? "#DIV/0!" : +r.pct.toFixed(2)}</td></tr>
                {i === 0 && <tr><td>Students</td><td data-testid="trk-sum-students">{sum.students}</td></tr>}
                <tr><td colSpan={2} style={{ height: 14 }} /></tr>
              </Fragment>
            ))}
          </tbody></table>}
        </div>
      </div>
    </div>
  );
}

function IsamsPanel({ g, access, setEffort, asAdmin, note, subject }: { subject: string; g: TGrid; access: TrkAccess; setEffort: (s: string, v: string) => void; asAdmin: boolean; note: (m: string, b?: boolean) => void }) {
  const { tr } = useTr();
  const [tpls, setTpls] = useState<{ cycle: string; name: string; term: string; at: number }[] | null>(null);
  const [cycle, setCycle] = useState("");
  const [rep, setRep] = useState<{ sheet: string; matched: number; unmatched: string[] }[] | null>(null);
  const [term, setTerm] = useState(g.term || "Term 1");
  const [flag, setFlag] = useState("");
  useEffect(() => { if (access.isams) trk<{ items: { cycle: string; name: string; term: string; at: number }[] }>("isams-tpl-list", {}).then((r) => { setTpls(r.items); setCycle((c) => c || r.items.find((x) => x.term === g.term)?.cycle || r.items[0]?.cycle || ""); }).catch(() => setTpls([])); }, [access.isams, g.term]);
  const run = async () => {
    try {
      const d = await trk<{ data: string; name: string; term: string; classes: never[]; flag?: string; roster?: boolean; relabel?: [string, string][] }>("trk-isams", { cycle, term, subject });
      setFlag(d.flag || "");
      const r = await fillIsams(d.data, d.classes, (d.name || `iSAMS ${cycle}.xlsx`).replace(/\.xlsx$/i, "") + ` - filled.xlsx`, { roster: !!d.roster, relabel: d.relabel });
      setRep(r);
      const learned = r.flatMap((x) => x.learnedIds);
      if (asAdmin && learned.length) await trk("trk-isams-ids", { items: learned }).catch(() => undefined);
    } catch (e) { note(modErr(e, tr), true); }
  };
  const S = g.students;
  return (
    <div className="space-y-3" data-testid="trk-isams">
      {flag && <p className="rounded-xl bg-amber-100 px-4 py-2 text-sm font-semibold text-amber-900" data-testid="trk-isams-flag">⚠ {flag}</p>}
      <div className={cardCls + " overflow-x-auto"}>
        <p className="mb-2 text-sm font-bold">{tr(`iSAMS report — ${g.cls} · ${g.term || "Whole year"}`, `تقرير iSAMS — ${g.cls}`)}</p>
        <table className="w-full text-sm" style={{ fontFamily: FONT }}><thead><tr className="text-left text-xs uppercase opacity-70"><th className="p-1">Surname</th><th className="p-1">Forename</th><th className="p-1">Target Grade</th><th className="p-1">Effort Grade</th><th className="p-1">Attainment Grade</th></tr></thead>
          <tbody>{S.map((s) => { const r = g.results.find((x) => x.id === s.id)!; return (
            <tr key={s.id} className="border-t border-black/5" data-testid="trk-isams-row"><td className="p-1">{s.last}</td><td className="p-1">{s.first || s.name}</td><td className="p-1">{s.target}</td>
              <td className="p-1">{access.effort ? (() => { const had = !!r.effortManual; const cur = g.sys.effort.includes(r.effort) ? r.effort : ""; const R = opRule(g, had, tr); return <select className="rounded-lg border border-black/15 bg-white px-1 py-0.5 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-slate-900" value={cur} disabled={R.dis} title={R.tip} onChange={(e) => setEffort(s.id, e.target.value || "__clear")} data-testid="trk-effort" data-dis={R.dis ? "1" : ""}>{(!had || R.revert || cur === "") && <option value="">—</option>}{g.sys.effort.filter((v) => R.vals || v === cur).map((v) => <option key={JSON.stringify(v)} value={v}>{v.trim() ? v : tr("(blank)", "(فارغ)")}</option>)}</select>; })() : (r.effort || "")}{r.effort && <span className={`ms-1 rounded-full px-1.5 text-[10px] font-bold ${r.effortManual ? "bg-amber-100 text-amber-900" : "bg-emerald-100 text-emerald-900"}`} data-testid="trk-effort-src" title={r.effortManual && r.effortAuto ? tr(`Auto would be: ${r.effortAuto.trim()}`, `التلقائي: ${r.effortAuto.trim()}`) : ""}>{r.effortManual ? tr("manual", "يدوي") : tr("auto", "تلقائي")}</span>}</td>
              <td className="p-1 font-bold">{r.grade ?? ""}</td></tr>); })}</tbody></table>
      </div>
      {access.isams && <div className={cardCls + " flex flex-wrap items-end gap-2"}>
        <label className="text-xs font-bold">{tr("Report cycle (uploaded iSAMS template)", "دورة التقرير (قالب iSAMS)")}<select className={field + " mt-1 !w-72"} value={cycle} onChange={(e) => setCycle(e.target.value)} data-testid="trk-isams-cycle">{(tpls || []).map((t) => <option key={t.cycle} value={t.cycle}>{t.cycle}{t.term ? ` · ${t.term}` : ""}</option>)}</select></label>
        <label className="text-xs font-bold">{tr("Attainment term", "فصل التحصيل")}<select className={field + " mt-1 !w-32"} value={term} onChange={(e) => setTerm(e.target.value)} data-testid="trk-isams-term">{["Term 1", "Term 2", "Term 3"].map((t) => <option key={t} value={t}>{tr(t, t.replace("Term", "الفصل"))}</option>)}</select></label>
        <button type="button" className={btn} disabled={!cycle} onClick={run} data-testid="trk-isams-dl">📤 {tr("Send to iSAMS report (all Primary classes)", "إرسال إلى تقرير iSAMS (كل صفوف الابتدائي)")}</button>
        {tpls && !tpls.length && <p className="text-xs opacity-70">{tr("No template yet — the admin uploads the blank iSAMS file per report cycle in Attainment & Progress Systems.", "لا يوجد قالب بعد.")}</p>}
        {rep && <ul className="w-full text-xs" data-testid="trk-isams-report">{rep.map((r) => <li key={r.sheet}><b>{r.sheet}</b>: {r.matched} {tr("filled", "مُعبأ")}{r.unmatched.length ? ` · ${tr("not matched", "غير مطابق")}: ${r.unmatched.join(", ")}` : ""}</li>)}</ul>}
      </div>}
    </div>
  );
}

function Audit() {
  const { tr } = useTr();
  const [items, setItems] = useState<{ at: number; by: string; student: string; cls: string; what: string; prev: string; next: string }[] | null>(null);
  useEffect(() => { trk<{ items: typeof items }>("trk-audit", {}).then((r) => setItems(r.items)).catch(() => setItems([])); }, []);
  return (
    <div className={cardCls + " overflow-x-auto"} data-testid="trk-audit">
      <table className="w-full text-sm"><thead><tr className="text-left text-xs uppercase opacity-70"><th className="p-1">{tr("When (Dubai)", "الوقت")}</th><th className="p-1">{tr("Who", "من")}</th><th className="p-1">{tr("Student", "الطالب")}</th><th className="p-1">{tr("What", "ماذا")}</th><th className="p-1">{tr("From → To", "من ← إلى")}</th></tr></thead>
        <tbody>{(items || []).map((x, i) => <tr key={i} className="border-t border-black/5" data-testid="trk-audit-row"><td className="p-1 whitespace-nowrap">{fmtAt(x.at)}</td><td className="p-1">{x.by}</td><td className="p-1">{x.student} <span className="opacity-60">{x.cls}</span></td><td className="p-1">{x.what}</td><td className="p-1">{x.prev || "—"} → {x.next || "—"}</td></tr>)}</tbody></table>
      {items && !items.length && <p className="p-4 text-center text-sm opacity-70">{tr("No changes yet.", "لا تغييرات بعد.")}</p>}
    </div>
  );
}
export type { ASys };
