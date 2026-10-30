"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useTr } from "@/components/lms/useLms";
import { QaCharts, KhdaBadge } from "./QaCharts";
import { eff, fmt, qaCall, qaDocx, qaPdf, qaXlsx, rate, RATING_COLOR, thrText, type Khda, type QaBody, type QaFilters, type QaReportData } from "@/lib/qa";

const EMPTY: QaFilters = { pc: "1", phase: "", dept: "", subject: "", year: "", section: "", teacher: "" };
const blank = (staff: string): QaReportData => ({ staff, date: new Date().toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" }), strengths: "", afd: "", actions: "", comment: "", rowNotes: {}, ovr: {} });
const inp = "w-full rounded-lg border border-slate-300 bg-white px-2 py-1 text-sm text-slate-900";
const selC = "mt-1 rounded-xl border border-black/10 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:ring-2 focus:ring-sun/40";
const btn = "rounded-full border border-slate-300 bg-white px-3 py-1.5 text-sm font-bold text-slate-900 hover:bg-slate-50 disabled:opacity-40";
const th = "border border-slate-800 px-2 py-1.5 text-left font-bold";
const td = "border border-slate-800 px-2 py-1 align-top";

/** t336: Progress Check Quality Assurance (PC1–3 = Term 1–3). Numbers come from the Assessment Tracker; narrative is editable. */
export function QaReport({ asAdmin = false, term }: { asAdmin?: boolean; year?: string; term?: string }) {
  const { tr } = useTr();
  const [f, setF] = useState<QaFilters>(EMPTY);
  const [d, setD] = useState<QaBody | null>(null);
  const [rep, setRep] = useState<QaReportData>(blank(""));
  const [err, setErr] = useState(""); const [msg, setMsg] = useState(""); const [busy, setBusy] = useState(false);
  const [ovrOpen, setOvrOpen] = useState(""); const [khEdit, setKhEdit] = useState<Khda | null>(null);
  const load = useCallback(async (ff: QaFilters) => {
    setErr("");
    try { const b = await qaCall<QaBody>("qa-get", { filters: ff }, asAdmin); setD(b); const bl = blank(b.staff || b.options.teachers.find((t) => t.id === ff.teacher)?.name || ""); setRep({ ...bl, ...(b.report || {}), staff: b.report?.staff || bl.staff, date: b.report?.date || bl.date }); }
    catch (e) { setErr(String((e as Error).message)); setD(null); }
  }, [asAdmin]);
  useEffect(() => { load(f); }, [f, load]);
  // t338: inside the Assessment Tracker the term pills pick the Progress Check (Term N = PCN).
  useEffect(() => { const n = ["Term 1", "Term 2", "Term 3"].indexOf(term || ""); if (n >= 0) setF((x) => (x.pc === String(n + 1) ? x : { ...x, pc: String(n + 1) })); }, [term]);
  const set = (k: keyof QaFilters, v: string) => setF((x) => ({ ...x, [k]: v, ...(k === "year" ? { section: "" } : {}), ...(k === "dept" ? { subject: "" } : {}), ...(k === "phase" ? { year: "", section: "" } : {}) }));
  const can = d ? (d.report ? d.access.edit : d.access.add) : false;
  const save = async () => { if (!d) return; setBusy(true); try { await qaCall("qa-save", { filters: d.filters, data: rep }, asAdmin); setMsg(tr("Saved.", "تم الحفظ.")); await load(f); } catch (e) { setMsg(String((e as Error).message)); } setBusy(false); setTimeout(() => setMsg(""), 4000); };
  const dl = async (k: "pdf" | "docx" | "xlsx") => { if (!d) return; try { const fresh = await qaCall<QaBody>("qa-export", { filters: d.filters, kind: k }, asAdmin); (k === "pdf" ? qaPdf : k === "docx" ? qaDocx : qaXlsx)(fresh, rep); } catch (e) { setMsg(String((e as Error).message)); } };
  const thr = d?.thresholds || ["4+", "5+"];
  const multi = useMemo(() => new Set((d?.rows || []).map((r) => r.subject)).size > 1, [d]);
  const sel = (k: keyof QaFilters, label: string, opts: { v: string; l: string }[], all = true) => (
    <label className="flex min-w-[8.5rem] flex-1 flex-col text-xs font-bold text-slate-600">{label}
      <select className={selC} value={f[k]} onChange={(e) => set(k, e.target.value)} data-testid={`qa-f-${k}`}>{all && <option value="">{tr("All", "الكل")}</option>}{opts.map((o) => <option key={o.v} value={o.v}>{o.l}</option>)}</select></label>);
  const o = (xs: string[]) => xs.map((x) => ({ v: x, l: x }));
  return (
    <section className="space-y-4 rounded-2xl border border-slate-200 bg-gradient-to-b from-white to-sky-50/40 p-3 text-slate-900 shadow-sm sm:p-5" data-testid="qa-report">
      <div className="flex flex-wrap items-end gap-2" data-testid="qa-filters">
        <div className="flex w-full flex-wrap gap-1.5" role="tablist" data-testid="qa-pcs">{[1, 2, 3].map((n) => <button key={n} type="button" role="tab" aria-selected={f.pc === String(n)} onClick={() => set("pc", String(n))} data-testid="qa-pc" className={`rounded-full border px-3 py-1.5 text-sm font-bold ${f.pc === String(n) ? "border-transparent bg-header text-sun" : "border-black/10 bg-white"}`}>PC{n} · {tr(`Term ${n}`, `الفصل ${n}`)}</button>)}</div>
        <select hidden value={f.pc} onChange={(e) => set("pc", e.target.value)} data-testid="qa-f-pc">{[1, 2, 3].map((n) => <option key={n} value={String(n)}>{n}</option>)}</select>
        {sel("phase", tr("Phase", "المرحلة"), o(d?.options.phases || ["EYFS", "Primary"]))}
        {sel("dept", tr("Department", "القسم"), o(d?.options.depts || []))}
        {sel("subject", tr("Subject", "المادة"), o(d?.options.subjects || []))}
        {sel("year", tr("Year", "السنة"), o(d?.options.years || []))}
        {sel("section", tr("Class / section", "الشعبة"), o(d?.options.sections || []))}
        {d?.access.admin && sel("teacher", tr("Teacher", "المعلم"), (d.options.teachers || []).map((t) => ({ v: t.id, l: t.name })))}
      </div>
      {err && <p className="rounded-xl bg-amber-100 px-3 py-2 text-sm text-amber-900" role="alert" data-testid="qa-err">{err === "module_hidden" ? tr("You don't have access to Progress Check QA.", "ليس لديك صلاحية.") : err}</p>}
      {d && <div className="space-y-4" data-testid="qa-doc">
        <div className="flex flex-wrap items-center gap-2"><h2 className="min-w-0 flex-1 text-lg font-extrabold" data-testid="qa-title">Progress Check {d.filters.pc} Quality Assurance <span className="text-xs font-semibold text-slate-500">· {d.term}{d.filters.phase ? ` · ${d.filters.phase}` : ""}</span></h2>
          {d.access.dl && <div className="flex flex-wrap gap-1.5" data-testid="qa-dl">{(["pdf", "docx", "xlsx"] as const).map((k) => <button key={k} type="button" className={btn} onClick={() => dl(k)} data-testid={`qa-dl-${k}`}>⬇ {k === "pdf" ? "PDF" : k === "docx" ? "Word" : "Excel"}</button>)}</div>}</div>
        <table className="w-full max-w-2xl border-2 border-slate-900 text-sm" data-testid="qa-head"><tbody>
          {([["staff", tr("Staff member", "الموظف")], ["subject", tr("Subject", "المادة")], ["date", tr("Date", "التاريخ")]] as const).map(([k, l]) => <tr key={k}><td className={td + " w-36 font-bold"}>{l}</td><td className={td}>{k === "subject" ? (d.filters.subject || d.filters.dept || d.rows[0]?.subject || tr("All subjects", "كل المواد")) : <input className={inp} value={rep[k]} disabled={!can} onChange={(e) => setRep({ ...rep, [k]: e.target.value })} data-testid={`qa-${k}`} />}</td></tr>)}
        </tbody></table>
        {d.rows.length > 0 && <QaCharts d={d} rep={rep} />}
        <h3 className="text-sm font-extrabold text-[#0070C0]">Year Group Data</h3>
        {!d.rows.length ? <p className="text-sm text-slate-500" data-testid="qa-empty">{tr("No Assessment Tracker grades for this selection yet.", "لا توجد درجات في المتتبع لهذا الاختيار.")}</p> : <>
        <div className="overflow-x-auto"><table className="w-full min-w-[560px] max-w-3xl border-collapse text-sm" data-testid="qa-att"><thead>
          <tr><th className={th + " text-center"} colSpan={6}>Attainment</th></tr>
          <tr><th className={th}>{d.filters.year ? tr("Class", "الشعبة") : tr("Year", "السنة")}</th><th className={th}>% of Children Working {thr[0]}</th><th className={th}>% of Children Working {thr[1]}</th><th className={th}>KHDA rating</th><th className={th + " text-xs font-semibold"}>{tr("Graded / students", "مقيّم / طلاب")}</th><th className={th + " text-xs font-semibold"}>{tr("Comment", "تعليق")}</th></tr></thead>
          <tbody>{d.rows.map((r) => { const ov = rep.ovr[r.key]; const e = eff(r, thr, ov); const rt = rate(e.a, e.b, d.khda.att); return (
            <tr key={r.key} data-testid="qa-att-row" data-key={r.key}>
              <td className={td + " font-semibold"}>{multi ? `${r.subject} · ` : ""}{r.label}</td>
              <td className={td} data-testid="qa-p4">{fmt(e.a)}{e.over && <b className="text-rose-600" title={tr(`Calculated ${fmt(r.pct[thr[0]])}`, "محسوب")}> *</b>}</td>
              <td className={td} data-testid="qa-p5">{fmt(e.b)}{e.over && <b className="text-rose-600" title={tr(`Calculated ${fmt(r.pct[thr[1]])}`, "محسوب")}> *</b>}</td>
              <td className={td} data-testid="qa-rating" data-r={rt}><KhdaBadge r={rt} /></td>
              <td className={td + " text-xs text-slate-600"}>{r.graded}/{r.students}{can && <button type="button" className="ms-2 underline" onClick={() => setOvrOpen(ovrOpen === r.key ? "" : r.key)} data-testid="qa-ovr-btn">✎ {tr("override", "تعديل")}</button>}
                {ovrOpen === r.key && <div className="mt-1 space-y-1 rounded-lg bg-slate-50 p-2" data-testid="qa-ovr">
                  {(["a", "b"] as const).map((k, i) => <label key={k} className="flex items-center gap-1">{thr[i]} % <input type="number" min={0} max={100} step="any" className={inp + " w-24"} value={ov?.[k] ?? ""} placeholder={fmt(r.pct[thr[i]])} onChange={(ev) => setRep({ ...rep, ovr: { ...rep.ovr, [r.key]: { ...(ov || { note: "", by: "", at: Date.now() }), [k]: ev.target.value === "" ? null : Number(ev.target.value) } } })} data-testid={`qa-ovr-${k}`} /></label>)}
                  <input className={inp} placeholder={tr("Reason (shown in the report)", "السبب")} value={ov?.note || ""} onChange={(ev) => setRep({ ...rep, ovr: { ...rep.ovr, [r.key]: { ...(ov || { a: null, b: null, by: "", at: Date.now(), note: "" }), note: ev.target.value } } })} data-testid="qa-ovr-note" />
                  {ov && <button type="button" className="text-xs underline" onClick={() => { const x = { ...rep.ovr }; delete x[r.key]; setRep({ ...rep, ovr: x }); }}>{tr("Use calculated values", "استخدم المحسوب")}</button>}</div>}</td>
              <td className={td}><textarea className={inp + " min-h-[2rem]"} rows={1} disabled={!can} value={rep.rowNotes[r.key] || ""} onChange={(ev) => setRep({ ...rep, rowNotes: { ...rep.rowNotes, [r.key]: ev.target.value } })} data-testid="qa-row-note" /></td></tr>); })}
            {d.total && d.rows.length > 1 && <tr className="bg-slate-50 font-bold" data-testid="qa-att-total"><td className={td}>{tr("All", "الكل")}</td><td className={td}>{fmt(d.total.pct[thr[0]])}</td><td className={td}>{fmt(d.total.pct[thr[1]])}</td><td className={td}><KhdaBadge r={d.total.rating} /></td><td className={td + " text-xs"}>{d.total.graded}/{d.total.students}</td><td className={td} /></tr>}
          </tbody></table></div>
        {Object.values(rep.ovr).some((x) => x.a != null || x.b != null) && <p className="text-xs italic text-rose-700" data-testid="qa-ovr-note-text">* {tr("Override — the calculated tracker value is kept and shown in the downloads.", "تعديل يدوي — تبقى القيمة المحسوبة ظاهرة في التنزيلات.")}</p>}
        <h3 className="text-sm font-extrabold text-[#0070C0]">Progress</h3>
        <div className="overflow-x-auto"><table className="w-full min-w-[560px] max-w-3xl border-collapse text-sm" data-testid="qa-prog"><thead><tr><th className={th}>{d.filters.year ? tr("Class", "الشعبة") : tr("Year", "السنة")}</th><th className={th}>% at / above target</th><th className={th}>% above target</th><th className={th}>KHDA rating</th><th className={th}>{d.filters.pc === "1" ? tr("With a target", "لديهم هدف") : `↑ / = / ↓ vs PC${Number(d.filters.pc) - 1}`}</th></tr></thead>
          <tbody>{d.rows.map((r) => <tr key={r.key}><td className={td + " font-semibold"}>{multi ? `${r.subject} · ` : ""}{r.label}</td><td className={td}>{fmt(r.pExp)}</td><td className={td}>{fmt(r.pAbove)}</td><td className={td}><KhdaBadge r={r.progRating} /></td><td className={td}>{d.filters.pc === "1" ? `${r.withTarget}/${r.graded}` : `${r.up} / ${r.same} / ${r.down}`}</td></tr>)}</tbody></table></div>
        <details className="text-sm"><summary className="cursor-pointer font-bold text-slate-700">{tr("Tracker summary (the block at the bottom of each Assessment Tracker)", "ملخص المتتبع")}</summary>
          <div className="overflow-x-auto"><table className="mt-2 min-w-[480px] border-collapse text-sm" data-testid="qa-counts"><thead><tr><th className={th}>{tr("Year / class", "السنة")}</th><th className={th}>{thr[0]}</th><th className={th}>%</th><th className={th}>{thr[1]}</th><th className={th}>%</th><th className={th}>Students</th></tr></thead>
            <tbody>{d.rows.map((r) => <tr key={r.key}><td className={td}>{r.label}</td><td className={td}>{r.n[thr[0]] ?? 0}</td><td className={td}>{fmt(r.pct[thr[0]])}</td><td className={td}>{r.n[thr[1]] ?? 0}</td><td className={td}>{fmt(r.pct[thr[1]])}</td><td className={td}>{r.graded}</td></tr>)}</tbody></table></div></details>
        </>}
        <div data-testid="qa-thr"><h3 className="text-sm font-extrabold text-[#0070C0]">{tr("KHDA rating thresholds used", "حدود تصنيف KHDA المستخدمة")} {d.access.admin && !khEdit && <button type="button" className="ms-2 text-xs underline" onClick={() => setKhEdit(d.khda)} data-testid="qa-khda-edit">✎ {tr("edit", "تعديل")}</button>}</h3>
          {!khEdit ? <div className="overflow-x-auto"><table className="mt-1 min-w-[420px] border-collapse text-sm"><thead><tr><th className={th}>{thr[0]}</th><th className={th}>{thr[1]}</th><th className={th}>Rating</th></tr></thead>
            <tbody>{thrText(d.khda.att, thr).reverse().map((t) => <tr key={t.r}><td className={td}>{t.a}</td><td className={td}>{t.b}</td><td className={td + " font-bold"} style={{ color: RATING_COLOR[t.r] }}>{t.r}</td></tr>)}</tbody></table>
            <p className="mt-1 text-xs text-slate-500">{tr(`Rating = the best row whose ${thr[0]} and ${thr[1]} minimums are both met. Progress uses its own (editable) table on “% at/above target” and “% above target”.`, "التصنيف = أفضل صف تتحقق حدوده الدنيا.")}</p></div>
          : <div className="mt-1 space-y-2 rounded-xl bg-slate-50 p-2" data-testid="qa-khda-form">{(["att", "prog"] as const).map((k) => <div key={k}><p className="text-xs font-bold">{k === "att" ? tr(`Attainment — minimum % ${thr[0]} and % ${thr[1]}`, "التحصيل") : tr("Progress — minimum % at/above target and % above target", "التقدم")}</p>
            <div className="grid gap-1 sm:grid-cols-3">{khEdit[k].map((x, i) => <label key={x.r} className="flex items-center gap-1 text-xs"><b className="w-20" style={{ color: RATING_COLOR[x.r] }}>{x.r}</b>
              {(["a", "b"] as const).map((z) => <input key={z} type="number" min={0} max={100} className={inp + " w-16"} value={x[z]} onChange={(e) => setKhEdit({ ...khEdit, [k]: khEdit[k].map((y, j) => (j === i ? { ...y, [z]: Number(e.target.value) } : y)) })} data-testid={`qa-khda-${k}-${i}-${z}`} />)}</label>)}</div></div>)}
            <div className="flex gap-2"><button type="button" className={btn} onClick={() => setKhEdit(null)}>{tr("Cancel", "إلغاء")}</button><button type="button" className={btn + " !bg-slate-900 !text-white"} onClick={async () => { try { await qaCall("qa-khda-save", { khda: khEdit }, asAdmin); setKhEdit(null); await load(f); } catch (e) { setMsg(String((e as Error).message)); } }} data-testid="qa-khda-save">{tr("Save thresholds", "حفظ")}</button></div></div>}
        </div>
        <div className="grid gap-3 md:grid-cols-2" data-testid="qa-narr">{([["strengths", tr("Strengths", "نقاط القوة")], ["afd", tr("Areas for development", "مجالات التطوير")], ["actions", tr("Actions / next steps", "الإجراءات / الخطوات التالية")], ["comment", tr("Comments", "تعليقات")]] as const).map(([k, l]) =>
          <label key={k} className="flex flex-col text-sm font-extrabold text-[#0070C0]">{l}<textarea className={inp + " mt-1 min-h-[5rem] font-normal"} disabled={!can} value={rep[k]} onChange={(e) => setRep({ ...rep, [k]: e.target.value })} data-testid={`qa-${k}`} /></label>)}</div>
        <div className="flex flex-wrap items-center gap-2">{can ? <button type="button" className={btn + " !bg-slate-900 !text-white"} disabled={busy} onClick={save} data-testid="qa-save">{busy ? "…" : d.report ? tr("Save changes", "حفظ التغييرات") : tr("Add QA report", "إضافة التقرير")}</button> : <span className="text-xs text-slate-500">{tr("Read only — ask the admin for QA Add / Edit.", "للعرض فقط.")}</span>}
          {msg && <span className="text-sm font-semibold" role="status" data-testid="qa-msg">{msg}</span>}
          {d.report?.by && <span className="text-xs text-slate-500">{tr("Last saved by", "آخر حفظ")} {d.report.by}{d.report.at ? ` · ${new Date(d.report.at).toLocaleString("en-GB")}` : ""}</span>}</div>
        <p className="text-[11px] text-slate-500">{tr("All numbers are calculated live from the Assessment Trackers (EYFS & Primary): % = students with an Attainment Grade at or above 4 / 5 out of graded students — the same as the summary at the bottom of each tracker.", "كل الأرقام محسوبة من متتبعات التقييم.")}</p>
      </div>}
    </section>
  );
}
