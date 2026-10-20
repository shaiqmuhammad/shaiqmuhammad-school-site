"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useI18n } from "@/lib/i18n";
import { downloadBlob } from "@/lib/exportUtils";
import { REP_KEYS, reportsApi, type UnmatchedItem, setReportsAuth, type Access, type AccessCfg, type DeptReport, type RepKey, type ReportFilters, type ReportSettings, type RStudent, type StudentDetail } from "@/lib/reports";
import { Bars, C, Donut, LineChart, ProgressBar, StackedBars, type Seg } from "./Charts";

type TabId = "unmatched" | "overview" | "attainment" | "progress" | "quran" | "homework" | "coverage" | "students" | "settings";
const sel = "mt-1 w-full rounded-xl border border-card-border bg-card-solid px-2 py-1.5 text-sm";
const card = "rounded-2xl border border-card-border bg-card-solid p-4 shadow-sm print:break-inside-avoid print:shadow-none";
const pc = (v: number | null) => (v == null ? "—" : `${v}%`);
const dubai = (t: number) => new Date(t).toLocaleString("en-GB", { timeZone: "Asia/Dubai", dateStyle: "medium", timeStyle: "short" });
const dday = (t: number) => new Date(t).toLocaleDateString("en-GB", { timeZone: "Asia/Dubai", day: "numeric", month: "short", year: "numeric" });

/** Department Report (KHDA terms). Read-only: every number comes from the Worker's server-side aggregation. */
export function AdminReports({ admin = true }: { admin?: boolean }) {
  setReportsAuth(admin);
  const { lang } = useI18n();
  const tr = (en: string, ar: string) => (lang === "ar" ? ar : en);
  const [filters, setFilters] = useState<ReportFilters>({});
  const [data, setData] = useState<DeptReport | null>(null);
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(false);
  const [tab, setTab] = useState<TabId>("overview");
  const [drill, setDrill] = useState<{ year?: string; section?: string; band?: string; kind?: "att" | "prog" | "quran" | "hw" } | null>(null);
  const [detail, setDetail] = useState<StudentDetail | null>(null);

  const load = useCallback(async (f: ReportFilters) => {
    setLoading(true); setErr("");
    try { setData(await reportsApi.dept(f)); } catch (e) { setErr((e as Error).message); } finally { setLoading(false); }
  }, []);
  // eslint-disable-next-line react-hooks/set-state-in-effect -- load on filter change
  useEffect(() => { void load(filters); }, [filters, load]);

  const setF = (k: keyof ReportFilters, v: string) => { setDrill(null); setFilters((f) => { const n = { ...f, [k]: v || undefined }; if (k === "year") delete n.section; return n; }); };
  const openStudent = async (id: string) => {
    if (!data?.access.drill) return; try { setDetail(await reportsApi.student(id)); } catch (e) { alert((e as Error).message); } };
  const pick = (kind: "att" | "prog" | "quran" | "hw") => (year: string, band?: string) => { if (!data?.students) return; setDrill({ kind, year, band }); setTimeout(() => document.getElementById("rep-drill")?.scrollIntoView({ behavior: "smooth", block: "start" }), 50); };

  const segsAtt = (r: { above: number; at: number; below: number; noData: number }): Seg[] => [
    { k: "above", label: tr("Above expected", "فوق المتوقع"), v: r.above, color: C.above }, { k: "at", label: tr("At expected", "ضمن المتوقع"), v: r.at, color: C.at },
    { k: "below", label: tr("Below expected", "دون المتوقع"), v: r.below, color: C.below }, { k: "none", label: tr("No scores yet", "لا درجات بعد"), v: r.noData, color: C.none }];
  const segsProg = (r: { better: number; expected: number; below: number; noData: number }): Seg[] => [
    { k: "better", label: tr("Better than expected", "أفضل من المتوقع"), v: r.better, color: C.better }, { k: "expected", label: tr("Expected", "متوقع"), v: r.expected, color: C.expected },
    { k: "below", label: tr("Below expected", "دون المتوقع"), v: r.below, color: C.below }, { k: "none", label: tr("Needs 2+ scores", "يحتاج درجتين+"), v: r.noData, color: C.none }];
  const segsQ = (r: { green: number; yellow: number; red: number }): Seg[] => [
    { k: "green", label: tr("Green (secure)", "أخضر (متقن)"), v: r.green, color: C.green }, { k: "yellow", label: tr("Yellow (developing)", "أصفر (يتطور)"), v: r.yellow, color: C.yellow }, { k: "red", label: tr("Red (needs work)", "أحمر (يحتاج عملاً)"), v: r.red, color: C.red }];

  const tabs = ([["overview", tr("Overview", "نظرة عامة")], ["attainment", tr("Attainment", "التحصيل")], ["progress", tr("Progress", "التقدّم")], ["quran", tr("Quran", "القرآن")], ["homework", tr("Homework", "الواجبات")], ["coverage", tr("Curriculum", "المنهج")], ["students", tr("Students", "الطلاب")], ["unmatched", tr("Unmatched results", "نتائج غير مرتبطة")], ["settings", tr("Settings", "الإعدادات")]] as [TabId, string][])
    .filter(([id]) => !data || (id === "settings" || id === "unmatched" ? admin : id === "overview" ? true : id === "students" ? !!data.students : !!data[id]));
  const S = data?.settings;
  const K = data?.kpis;

  const exportXlsx = async () => {
    let data: DeptReport;
    try { data = await reportsApi.exportData("xlsx", filters); } catch (e) { alert((e as Error).message === "export_not_allowed" ? tr("Excel export is not allowed for your account.", "تصدير إكسل غير مسموح لحسابك.") : (e as Error).message); return; }
    const K = data.kpis, S = data.settings;
    const ExcelJS = (await import("exceljs")).default;
    const wb = new ExcelJS.Workbook();
    const sheet = (name: string, head: string[], rows: (string | number | null)[][]) => { const ws = wb.addWorksheet(name); ws.addRow(head).font = { bold: true }; rows.forEach((r) => ws.addRow(r.map((v) => v ?? ""))); ws.columns.forEach((c) => { c.width = 16; }); };
    if (K) sheet("Summary", ["Measure", "Value"], [["Generated (Asia/Dubai)", dubai(data.generated)], ["Filters", JSON.stringify(filters)], ["Students", K.students], ["Students with scores", K.withScores], ["At or above expected %", K.atOrAbove], ["Expected progress or better %", K.expectedOrBetter], ["Homework on time %", K.onTime], ["Homework completion %", K.completion], ["Quran verses green %", K.quranGreen], ["Curriculum units taught %", K.coverage], ["Thresholds", `above ≥${S.above}, at ${S.at}–${S.above - 1}, below <${S.at}; progress better ≥+${S.progBetter}, expected ≥${S.progExpected}`], ["Assessment results not matched to a student", K.results.unmatched + K.results.ambiguous]]);
    if (data.attainment) sheet("Attainment", ["Year", "Students", "Above", "At", "Below", "No scores"], data.attainment.map((r) => [r.year, r.students, r.above, r.at, r.below, r.noData]));
    if (data.progress) sheet("Progress", ["Year", "Students", "Better", "Expected", "Below", "Needs 2+ scores"], data.progress.byYear.map((r) => [r.year, r.students, r.better, r.expected, r.below, r.noData]));
    if (data.quran) sheet("Quran", ["Year", "Students", "With data", "Green verses", "Yellow verses", "Red verses"], data.quran.map((r) => [r.year, r.students, r.withData, r.green, r.yellow, r.red]));
    if (data.homework) sheet("Homework", ["Year", "Expected", "Submitted", "On time"], data.homework!.byYear.map((r) => [r.year, r.exp, r.done, r.onTime]));
    if (data.coverage) sheet("Curriculum", ["Year", "Units", "Taught", "In progress", "Assessed"], data.coverage.map((r) => [r.year, r.total, r.taught, r.inProgress, r.assessed]));
    if (data.students) sheet("Students", ["Name", "Year", "Section", "Subject", "Phase", "Gender", "SEN", "Scores", "Attainment %", "Band", "First %", "Latest %", "Change", "Progress", "HW expected", "HW submitted", "HW on time", "Quran green", "Quran yellow", "Quran red"],
      data.students.map((s) => [s.name, s.cls, s.section, s.subject || "not set", s.phase || "not set", s.gender === "b" ? "Boy" : s.gender === "g" ? "Girl" : "not set", s.sen || "not set", s.n, s.att, s.attBand, s.first, s.latest, s.delta, s.progBand, s.hw?.exp ?? 0, s.hw?.done ?? 0, s.hw?.onTime ?? 0, s.quran?.green ?? 0, s.quran?.yellow ?? 0, s.quran?.red ?? 0]));
    const buf = await wb.xlsx.writeBuffer();
    downloadBlob(new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }), `department-report-${new Date().toISOString().slice(0, 10)}.xlsx`);
  };
  const printPdf = async () => {
    try { await reportsApi.exportData("pdf", filters); } catch (e) { alert((e as Error).message === "export_not_allowed" ? tr("PDF export is not allowed for your account.", "تصدير PDF غير مسموح لحسابك.") : (e as Error).message); return; }
    const prev = tab; setTab("overview"); document.body.classList.add("sm-print-report"); setTimeout(() => { window.print(); document.body.classList.remove("sm-print-report"); setTab(prev); }, 300); };

  const fsel = (k: keyof ReportFilters, label: string, opts: [string, string][], withNone = false, nn = 0) => (
    <label className="text-xs font-semibold">{label}
      <select className={sel} value={filters[k] || ""} onChange={(e) => setF(k, e.target.value)} data-testid={`rep-f-${k}`}>
        <option value="">{tr("All", "الكل")}</option>
        {opts.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        {withNone && <option value="__none">{tr("Not set", "غير محدد")}{nn ? ` (${nn})` : ""}</option>}
      </select>
    </label>
  );
  const empty = (msg?: string) => <p className="rounded-xl border border-dashed border-card-border p-4 text-sm opacity-80" data-testid="rep-empty">{msg || tr("No data yet.", "لا توجد بيانات بعد.")}</p>;

  const drillStudents = useMemo(() => {
    if (!data?.students || !drill) return [] as RStudent[];
    return data.students.filter((s) => (!drill.year || s.cls === drill.year) && (!drill.section || s.section === drill.section) && (!drill.band || (drill.kind === "att" ? (drill.band === "none" ? s.att == null : s.attBand === drill.band) : drill.kind === "prog" ? (drill.band === "none" ? s.delta == null : s.progBand === drill.band) : drill.kind === "quran" ? !!s.quran && s.quran[drill.band as "green"] > 0 : true)));
  }, [data, drill]);
  const sectionsOfDrill = useMemo(() => {
    if (!data?.students || !drill?.year) return [];
    const m = new Map<string, RStudent[]>();
    for (const s of data.students.filter((x) => x.cls === drill.year)) m.set(s.section || "—", [...(m.get(s.section || "—") || []), s]);
    return [...m].sort(([a], [b]) => a.localeCompare(b));
  }, [data, drill]);

  const studentTable = (list: RStudent[]) => list.length === 0 ? empty(tr("No students match.", "لا يوجد طلاب مطابقون.")) : (
    <div className="overflow-x-auto"><table className="w-full min-w-[560px] text-sm" data-testid="rep-student-table">
      <thead><tr className="text-start text-xs opacity-75">{[tr("Student", "الطالب"), tr("Class", "الصف"), tr("Scores", "الدرجات"), tr("Attainment", "التحصيل"), tr("Progress", "التقدّم"), tr("Homework", "الواجبات"), tr("Quran", "القرآن")].map((h) => <th key={h} className="px-2 py-1 text-start">{h}</th>)}</tr></thead>
      <tbody>{list.map((s) => (
        <tr key={s.id} className="border-t border-card-border">
          <td className="px-2 py-1.5"><button type="button" className="font-semibold text-[#0e7490] underline-offset-2 hover:underline dark:text-sky-300" onClick={() => openStudent(s.id)} data-testid="rep-student-open">{s.name}</button></td>
          <td className="px-2">{s.cls} {s.section}</td><td className="px-2">{s.n}</td>
          <td className="px-2">{s.att == null ? "—" : <span className="font-bold" style={{ color: C[s.attBand!] }}>{s.att}%</span>}</td>
          <td className="px-2">{s.delta == null ? "—" : `${s.delta > 0 ? "+" : ""}${s.delta} (${s.progBand})`}</td>
          <td className="px-2">{s.hw ? `${s.hw.done}/${s.hw.exp} · ${s.hw.onTime} ${tr("on time", "في الموعد")}` : "—"}</td>
          <td className="px-2">{s.quran ? `🟢${s.quran.green} 🟡${s.quran.yellow} 🔴${s.quran.red}` : "—"}</td>
        </tr>))}</tbody>
    </table></div>
  );

  return (
    <div className="space-y-4" data-report-root data-testid="admin-reports">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-xl font-extrabold">{tr("Department Report", "تقرير القسم")}</h2>
          <p className="text-xs opacity-75">{tr("Attainment, progress, Quran, homework and curriculum coverage — calculated live from LMS records.", "التحصيل والتقدّم والقرآن والواجبات وتغطية المنهج — محسوبة مباشرة من سجلات المنصة.")}{data ? ` · ${tr("Generated", "أُنشئ")} ${dubai(data.generated)} (Dubai)` : ""}</p>
        </div>
        <div className="flex flex-wrap gap-2 print:hidden">
          <button type="button" className="btn-glass px-3 py-1.5 text-sm" onClick={() => load(filters)} disabled={loading}>{loading ? "…" : tr("Refresh", "تحديث")}</button>
          {data?.access.pdf && <button type="button" className="btn-glass px-3 py-1.5 text-sm" onClick={printPdf} data-testid="rep-pdf">🖨️ PDF</button>}
          {data?.access.xlsx && <button type="button" className="btn-glass px-3 py-1.5 text-sm" onClick={exportXlsx} data-testid="rep-xlsx">📊 Excel</button>}
        </div>
      </div>

      {data && (
        <div className={`${card} grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-8`} data-testid="rep-filters">
          {fsel("subject", tr("Department / subject", "القسم / المادة"), data.options.subjects.map((s) => [s, s]), true, data.notSet.subject)}
          {fsel("phase", tr("Phase", "المرحلة"), data.options.phases.map((s) => [s, s]), true)}
          {fsel("year", tr("Year group", "المرحلة الدراسية"), data.options.years.map((s) => [s, s]))}
          {fsel("section", tr("Class / section", "الشعبة"), data.options.sections.map((s) => [s, s]))}
          {fsel("group", tr("Group", "المجموعة"), data.options.groups.map((g) => [g.id, g.name]))}
          {fsel("gender", tr("Gender", "الجنس"), [["b", tr("Boys", "بنون")], ["g", tr("Girls", "بنات")]], true, data.notSet.gender)}
          {fsel("sen", "SEN", [["yes", tr("SEN", "ذوو احتياجات")], ["no", tr("Not SEN", "بدون")]], true, data.notSet.sen)}
          <div className="flex items-end"><button type="button" className="btn-glass w-full px-2 py-1.5 text-sm" onClick={() => { setDrill(null); setFilters({}); }}>{tr("Clear", "مسح")}</button></div>
          <p className="col-span-full text-[11px] opacity-75" data-testid="rep-notset">{tr("Profile fields not set in this selection", "حقول غير محددة في هذا الاختيار")}: {tr("gender", "الجنس")} {data.notSet.gender} · SEN {data.notSet.sen} · {tr("subject", "المادة")} {data.notSet.subject} · {tr("phase", "المرحلة")} {data.notSet.phase}. {tr("Edit them in Students → profile.", "عدّلها من الطلاب ← الملف.")}</p>
        </div>
      )}
      {err && <p className="rounded-xl bg-red-50 p-3 text-sm text-red-700 dark:bg-red-950 dark:text-red-200">{tr("Could not load the report", "تعذّر تحميل التقرير")}: {err}</p>}
      {!data && !err && <p className="text-sm opacity-75">{tr("Loading…", "جارٍ التحميل…")}</p>}

      {data && S && (<>
        {/* Overview flow: cohort → assessed → attainment → progress, plus homework / Quran / curriculum */}
        {K && <div className={card} data-testid="rep-flow">
          <div className="flex flex-wrap items-stretch gap-2 text-center">
            {[[tr("Students", "الطلاب"), String(K.students), ""], [tr("With assessment scores", "لديهم درجات"), String(K.withScores), K.students ? `${Math.round((100 * K.withScores) / K.students)}%` : ""], [tr("At / above expected", "ضمن/فوق المتوقع"), pc(K.atOrAbove), tr("of those assessed", "من المقيَّمين")], [tr("Expected progress or better", "تقدّم متوقع أو أفضل"), pc(K.expectedOrBetter), tr("2+ scores", "درجتان+")]].map(([l, v, sub], i, arr) => (
              <div key={l} className="flex min-w-[8rem] flex-1 items-center gap-2">
                <div className="flex-1 rounded-xl bg-[#1b3a57] p-3 text-white" style={{ printColorAdjust: "exact", WebkitPrintColorAdjust: "exact" }} data-testid="rep-kpi"><div className="text-2xl font-extrabold">{v}</div><div className="text-xs font-semibold">{l}</div>{sub && <div className="text-[10px] opacity-80">{sub}</div>}</div>
                {i < arr.length - 1 && <span className="hidden text-xl opacity-60 sm:inline rtl:rotate-180" aria-hidden>➜</span>}
              </div>
            ))}
          </div>
          <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
            {[[tr("Homework on time", "واجبات في الموعد"), pc(K.onTime)], [tr("Homework completion", "إنجاز الواجبات"), pc(K.completion)], [tr("Quran verses green", "آيات خضراء"), pc(K.quranGreen)], [tr("Curriculum units taught", "وحدات منجزة"), pc(K.coverage)]].map(([l, v]) => (
              <div key={l} className="rounded-xl border border-card-border p-3 text-center" data-testid="rep-kpi"><div className="text-xl font-extrabold">{v}</div><div className="text-xs">{l}</div></div>
            ))}
          </div>
          {K.results.total > 0 && (K.results.unmatched + K.results.ambiguous) > 0 && <p className="mt-2 text-[11px] opacity-75" data-testid="rep-unmatched-note">{tr(`${K.results.unmatched + K.results.ambiguous} of ${K.results.total} assessment results could not be matched to one student (the name typed at the quiz differs from the student's name, or two students share it) and are left out.`, `${K.results.unmatched + K.results.ambiguous} من ${K.results.total} نتيجة لم تُطابق طالباً واحداً واستُبعدت.`)}</p>}
        </div>}

        <div className="flex flex-wrap gap-1.5 print:hidden" role="tablist" data-testid="rep-tabs">
          {tabs.map(([id, l]) => <button key={id} type="button" role="tab" aria-selected={tab === id} onClick={() => setTab(id)} className={`rounded-full px-3 py-1.5 text-sm font-bold ${tab === id ? "bg-[#1b3a57] text-white" : "border border-card-border bg-card-solid"}`} data-testid={`rep-tab-${id}`}>{l}</button>)}
        </div>

        {data.attainment && (tab === "overview" || tab === "attainment") && (
          <section className={card} data-testid="rep-attainment">
            <h3 className="font-extrabold">{tr("Attainment by year group", "التحصيل حسب المرحلة")}</h3>
            <p className="mb-3 text-xs opacity-75">{tr(`Average of each student's latest 3 assessment scores. Above ≥ ${S.above}%, at ${S.at}–${S.above - 1}%, below < ${S.at}%. Tap a bar to drill down.`, `متوسط آخر ٣ درجات. فوق ≥ ${S.above}٪، ضمن ${S.at}–${S.above - 1}٪، دون < ${S.at}٪. اضغط على شريط للتفصيل.`)}</p>
            {!data.attainment.some((r) => r.above + r.at + r.below > 0) ? empty(tr("No assessment scores yet for this selection.", "لا توجد درجات تقييم بعد لهذا الاختيار.")) : <StackedBars testid="rep-att-chart" rows={data.attainment.map((r) => ({ label: r.year, segs: segsAtt(r) }))} onPick={data.students ? pick("att") : undefined} />}
          </section>
        )}
        {data.progress && (tab === "overview" || tab === "progress") && (
          <section className={card} data-testid="rep-progress">
            <h3 className="font-extrabold">{tr("Progress (first vs latest score)", "التقدّم (أول درجة مقابل آخر درجة)")}</h3>
            <p className="mb-3 text-xs opacity-75">{tr(`Better than expected: +${S.progBetter} points or more; expected: ${S.progExpected >= 0 ? "+" : ""}${S.progExpected} or more; below: less.`, `أفضل من المتوقع: +${S.progBetter} أو أكثر؛ متوقع: ${S.progExpected} أو أكثر؛ دون ذلك: أقل.`)}</p>
            {data.progress.byYear.every((r) => r.noData === r.students) ? empty(tr("No data yet — progress needs at least two scores per student.", "لا توجد بيانات بعد — يحتاج التقدّم درجتين على الأقل لكل طالب.")) : (
              <div className="grid gap-4 lg:grid-cols-2">
                <StackedBars testid="rep-prog-chart" rows={data.progress.byYear.map((r) => ({ label: r.year, segs: segsProg(r) }))} onPick={data.students ? pick("prog") : undefined} />
                <div><p className="mb-1 text-xs font-semibold">{tr("Distribution of improvement (points)", "توزيع التحسّن (نقاط)")}</p><Bars testid="rep-dist" data={data.progress.distribution.map((d) => ({ label: d.lo <= -100 ? "< -20" : d.hi > 100 ? "≥ 20" : `${d.lo}…${d.hi}`, v: d.n }))} /></div>
              </div>)}
            {tab === "progress" && <div className="mt-4"><p className="mb-1 text-xs font-semibold">{tr("Average score over time by year group (month, Dubai)", "متوسط الدرجات عبر الزمن حسب المرحلة")}</p>
              {data.progress!.trend.length === 0 ? empty() : <LineChart testid="rep-trend" xs={data.progress!.trend.map((t) => t.month)} series={[...new Set(data.progress!.trend.flatMap((t) => Object.keys(t.byYear)))].map((y) => ({ name: y, pts: data.progress!.trend.map((t) => t.byYear[y] ?? null) }))} />}</div>}
          </section>
        )}
        {data.quran && (tab === "overview" || tab === "quran") && (
          <section className={card} data-testid="rep-quran">
            <h3 className="font-extrabold">{tr("Quran verse mastery", "إتقان الآيات")}</h3>
            <p className="mb-3 text-xs opacity-75">{tr("Verses in approved Quran tracker entries, by the grade the teacher gave.", "الآيات في سجلات المتابعة المعتمدة حسب تقدير المعلم.")}</p>
            {data.quran.every((q) => !q.withData) ? empty(tr("No Quran tracker data yet for this selection.", "لا توجد بيانات متابعة قرآن بعد.")) : (
              <div className="grid gap-4 lg:grid-cols-[auto_1fr]">
                <Donut testid="rep-quran-donut" segs={segsQ(data.quran!.reduce((t, q) => ({ green: t.green + q.green, yellow: t.yellow + q.yellow, red: t.red + q.red }), { green: 0, yellow: 0, red: 0 }))} center={(() => { const q = data.quran!; const t = q.reduce((a, x) => a + x.green + x.yellow + x.red, 0); return t ? `${Math.round((100 * q.reduce((a, x) => a + x.green, 0)) / t)}%` : "—"; })()} onPick={data.students ? (k) => pick("quran")("", k) : undefined} />
                <StackedBars testid="rep-quran-chart" rows={data.quran.map((q) => ({ label: q.year, segs: segsQ(q), note: `${q.withData}/${q.students} ${tr("students with entries", "طلاب لديهم سجلات")}` }))} onPick={data.students ? pick("quran") : undefined} />
              </div>)}
          </section>
        )}
        {data.homework && (tab === "overview" || tab === "homework") && (
          <section className={card} data-testid="rep-homework">
            <h3 className="font-extrabold">{tr("Homework", "الواجبات")}</h3>
            <p className="mb-3 text-xs opacity-75">{tr(`${data.homework!.assignments} assignments for this selection. On time = handed in before the due time (no due date = on time when handed in).`, `${data.homework!.assignments} واجباً. في الموعد = سُلّم قبل الموعد.`)}</p>
            {data.homework!.exp === 0 ? empty(tr("No homework set yet for this selection.", "لا توجد واجبات بعد.")) : (
              <div className="grid gap-4 lg:grid-cols-2">
                <StackedBars testid="rep-hw-chart" rows={data.homework!.byYear.filter((r) => r.exp).map((r) => ({ label: r.year, segs: [{ k: "ontime", label: tr("On time", "في الموعد"), v: r.onTime, color: C.above }, { k: "late", label: tr("Late", "متأخر"), v: r.done - r.onTime, color: C.at }, { k: "missing", label: tr("Not handed in", "لم يُسلّم"), v: r.exp - r.done, color: C.below }] }))} onPick={data.students ? pick("hw") : undefined} />
                {tab === "homework" && <div><p className="mb-1 text-xs font-semibold">{tr("Completion trend by week (% handed in)", "اتجاه الإنجاز أسبوعياً")}</p><LineChart testid="rep-hw-trend" xs={data.homework!.trend.map((t) => t.week.slice(5))} series={[{ name: tr("Completion %", "الإنجاز ٪"), pts: data.homework!.trend.map((t) => (t.exp ? Math.round((100 * t.done) / t.exp) : null)) }, { name: tr("On time %", "في الموعد ٪"), pts: data.homework!.trend.map((t) => (t.exp ? Math.round((100 * t.onTime) / t.exp) : null)) }]} /></div>}
              </div>)}
          </section>
        )}
        {data.coverage && (tab === "overview" || tab === "coverage") && (
          <section className={card} data-testid="rep-coverage">
            <h3 className="font-extrabold">{tr("Curriculum coverage", "تغطية المنهج")}</h3>
            <p className="mb-3 text-xs opacity-75">{tr("Units marked taught, and units whose linked homework/assessment has at least one submission or result (assessed).", "الوحدات المنجزة، والوحدات التي لواجبها/تقييمها المرتبط تسليم أو نتيجة واحدة على الأقل.")}</p>
            {data.coverage.every((c) => !c.total) ? empty(tr("No curriculum units yet for these year groups.", "لا توجد وحدات منهج بعد.")) : <div className="space-y-3">{data.coverage.map((c) => <ProgressBar key={c.year} testid="rep-cov-bar" label={c.year} total={c.total} parts={[{ v: c.taught, color: C.navy, name: tr("taught", "منجز") }, { v: c.assessed, color: C.better, name: tr("assessed", "مقيَّم") }]} />)}</div>}
          </section>
        )}

        {drill && data.students && tab !== "settings" && (
          <section id="rep-drill" className={card} data-testid="rep-drill">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="font-extrabold">🔎 {[drill.year || tr("All years", "كل المراحل"), drill.section, drill.band].filter(Boolean).join(" › ")}</h3>
              <div className="flex gap-2 print:hidden">{drill.section && <button type="button" className="btn-glass px-2 py-1 text-xs" onClick={() => setDrill({ ...drill, section: undefined })}>← {drill.year}</button>}<button type="button" className="btn-glass px-2 py-1 text-xs" onClick={() => setDrill(null)}>✕</button></div>
            </div>
            {drill.year && !drill.section && sectionsOfDrill.length > 0 && (
              <div className="my-3"><p className="mb-1 text-xs font-semibold">{tr("Classes in this year — tap one", "الشعب في هذه المرحلة — اضغط واحدة")}</p>
                <StackedBars testid="rep-drill-classes" rows={sectionsOfDrill.map(([sec, l]) => ({ label: sec, segs: drill.kind === "prog" ? segsProg({ better: l.filter((s) => s.progBand === "better").length, expected: l.filter((s) => s.progBand === "expected").length, below: l.filter((s) => s.progBand === "below").length, noData: l.filter((s) => s.delta == null).length }) : drill.kind === "quran" ? segsQ(l.reduce((t, s) => ({ green: t.green + (s.quran?.green || 0), yellow: t.yellow + (s.quran?.yellow || 0), red: t.red + (s.quran?.red || 0) }), { green: 0, yellow: 0, red: 0 })) : drill.kind === "hw" ? [{ k: "ontime", label: tr("On time", "في الموعد"), v: l.reduce((t, s) => t + (s.hw?.onTime || 0), 0), color: C.above }, { k: "late", label: tr("Late", "متأخر"), v: l.reduce((t, s) => t + (s.hw ? s.hw.done - s.hw.onTime : 0), 0), color: C.at }, { k: "missing", label: tr("Not handed in", "لم يُسلّم"), v: l.reduce((t, s) => t + (s.hw ? s.hw.exp - s.hw.done : 0), 0), color: C.below }] : segsAtt({ above: l.filter((s) => s.attBand === "above").length, at: l.filter((s) => s.attBand === "at").length, below: l.filter((s) => s.attBand === "below").length, noData: l.filter((s) => s.att == null).length }) }))} onPick={(sec) => setDrill({ ...drill, section: sec === "—" ? "" : sec })} />
              </div>)}
            <p className="mb-1 mt-2 text-xs font-semibold">{tr("Students", "الطلاب")} ({drillStudents.length})</p>
            {studentTable(drillStudents)}
          </section>
        )}

        {tab === "students" && data.students && <section className={card} data-testid="rep-students"><h3 className="mb-2 font-extrabold">{tr("All students in this selection", "كل الطلاب في هذا الاختيار")} ({data.students.length})</h3>{studentTable(data.students)}</section>}
        {tab === "unmatched" && admin && <UnmatchedPanel tr={tr} onChanged={() => load(filters)} />}
        {tab === "settings" && admin && <><SettingsPanel initial={S} onSaved={() => load(filters)} tr={tr} /><AccessPanel tr={tr} onSaved={() => load(filters)} /></>}
      </>)}

      {detail && <StudentPanel d={detail} onClose={() => setDetail(null)} tr={tr} />}
    </div>
  );
}

function SettingsPanel({ initial, onSaved, tr }: { initial: ReportSettings; onSaved: () => void; tr: (e: string, a: string) => string }) {
  const [v, setV] = useState(initial);
  const [msg, setMsg] = useState("");
  const f = (k: keyof ReportSettings, l: string) => <label className="text-sm font-semibold">{l}<input type="number" className={sel} value={v[k]} onChange={(e) => setV({ ...v, [k]: Number(e.target.value) })} data-testid={`rep-set-${k}`} /></label>;
  return (
    <section className={card} data-testid="rep-settings">
      <h3 className="mb-2 font-extrabold">{tr("Report settings", "إعدادات التقرير")}</h3>
      <div className="grid gap-3 sm:grid-cols-4">{f("above", tr("Above expected from (%)", "فوق المتوقع من (٪)"))}{f("at", tr("At expected from (%)", "ضمن المتوقع من (٪)"))}{f("progBetter", tr("Better progress: + points", "تقدّم أفضل: + نقاط"))}{f("progExpected", tr("Expected progress: + points", "تقدّم متوقع: + نقاط"))}</div>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button type="button" className="rounded-full bg-[#1b3a57] px-4 py-1.5 text-sm font-bold text-white" data-testid="rep-set-save" onClick={async () => { setMsg(""); try { await reportsApi.settings(v); setMsg(tr("Saved.", "تم الحفظ.")); onSaved(); } catch (e) { setMsg((e as Error).message); } }}>{tr("Save", "حفظ")}</button>
        <button type="button" className="btn-glass px-3 py-1.5 text-sm" onClick={() => setV({ above: 80, at: 60, progBetter: 10, progExpected: 0 })}>{tr("Defaults (80 / 60 / +10 / 0)", "الافتراضي")}</button>
        {msg && <span className="text-sm" data-testid="rep-set-msg">{msg}</span>}
      </div>
    </section>
  );
}

function StudentPanel({ d, onClose, tr }: { d: StudentDetail; onClose: () => void; tr: (e: string, a: string) => string }) {
  const s = d.student;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-0 sm:items-center sm:p-4 print:static print:bg-transparent" onClick={onClose} data-testid="rep-student-detail">
      <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-t-2xl bg-card-solid p-4 shadow-2xl sm:rounded-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-2">
          <div><h3 className="text-lg font-extrabold">{s.name}</h3><p className="text-xs opacity-75">{s.cls} {s.section} · {s.subject || tr("subject not set", "المادة غير محددة")} · {s.phase || "—"} · {s.gender === "b" ? tr("Boy", "ولد") : s.gender === "g" ? tr("Girl", "بنت") : tr("gender not set", "الجنس غير محدد")} · SEN {s.sen || tr("not set", "غير محدد")}{s.groups.length ? ` · ${s.groups.join(", ")}` : ""}</p></div>
          <button type="button" className="btn-glass px-2 py-1" onClick={onClose} aria-label="Close">✕</button>
        </div>
        <h4 className="mt-3 text-sm font-bold">{tr("Assessment scores", "درجات التقييم")}</h4>
        {d.scores.length === 0 ? <p className="text-sm opacity-75">{tr("No data yet.", "لا توجد بيانات بعد.")}</p> : <>
          {d.scores.length > 1 && <LineChart xs={d.scores.map((x) => dday(x.t))} series={[{ name: "%", pts: d.scores.map((x) => x.p) }]} />}
          <ul className="mt-1 space-y-0.5 text-sm" data-testid="rep-detail-scores">{d.scores.map((x, i) => <li key={i}>{dday(x.t)} — {x.title}: <b style={{ color: C[x.band] }}>{x.p}%</b></li>)}</ul></>}
        <h4 className="mt-3 text-sm font-bold">{tr("Homework", "الواجبات")}</h4>
        {d.homework.length === 0 ? <p className="text-sm opacity-75">{tr("No data yet.", "لا توجد بيانات بعد.")}</p> : <ul className="space-y-0.5 text-sm">{d.homework.map((h, i) => <li key={i}>{h.title} — {h.status === "none" ? tr("not started", "لم يبدأ") : h.status}{h.submittedAt ? ` · ${dday(h.submittedAt)}` : ""}{h.due ? ` · ${tr("due", "الموعد")} ${dday(h.due)}` : ""} {h.status !== "none" && h.status !== "draft" ? (h.onTime ? "✅" : "⏰") : ""}</li>)}</ul>}
        <h4 className="mt-3 text-sm font-bold">{tr("Quran tracker", "متابعة القرآن")}</h4>
        {d.quran.length === 0 ? <p className="text-sm opacity-75">{tr("No data yet.", "لا توجد بيانات بعد.")}</p> : <ul className="space-y-0.5 text-sm">{d.quran.map((q, i) => <li key={i}>{q.grade === "red" ? "🔴" : q.grade === "yellow" ? "🟡" : "🟢"} {tr("Surah", "سورة")} {q.surah}: {q.from}–{q.to} · {dday(q.at)}</li>)}</ul>}
      </div>
    </div>
  );
}

const KEY_LABEL: Record<RepKey, [string, string]> = {
  kpi: ["KPI overview", "مؤشرات عامة"], attainment: ["Attainment", "التحصيل"], progress: ["Progress", "التقدّم"], quran: ["Quran", "القرآن"], homework: ["Homework", "الواجبات"],
  coverage: ["Curriculum coverage", "تغطية المنهج"], drill: ["Drill-down / student detail", "التفصيل / ملف الطالب"], pdf: ["PDF export", "تصدير PDF"], xlsx: ["Excel export", "تصدير إكسل"],
};
export const repKeyLabel = (k: RepKey, tr: (e: string, a: string) => string) => tr(...KEY_LABEL[k]);

/** Admin: who sees what. Global switches, then per-role overrides (teachers; future Inspector/Leadership). Per-teacher overrides live in the teacher's Permissions. */
function AccessPanel({ tr, onSaved }: { tr: (e: string, a: string) => string; onSaved: () => void }) {
  const [cfg, setCfg] = useState<AccessCfg | null>(null);
  const [msg, setMsg] = useState("");
  useEffect(() => { reportsApi.settings().then((r) => setCfg(r.access || { global: {}, roles: { teacher: {}, inspector: {} } })).catch((e) => setMsg((e as Error).message)); }, []);
  if (!cfg) return <section className={card}>{msg || "…"}</section>;
  const g = (k: RepKey) => cfg.global[k] !== false;
  const sw = (on: boolean, set: (v: boolean) => void, id: string, isExport: boolean) => (
    <label className={`flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-extrabold ${on ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-100" : "bg-rose-100 text-rose-800 dark:bg-rose-900/40 dark:text-rose-100"}`}>
      <input type="checkbox" checked={on} onChange={(e) => set(e.target.checked)} data-testid={id} /> {isExport ? (on ? tr("Allowed", "مسموح") : tr("Not allowed", "غير مسموح")) : on ? tr("Shown", "ظاهر") : tr("Hidden", "مخفي")}
    </label>
  );
  const roleSel = (r: "teacher" | "inspector", k: RepKey) => {
    const v = cfg.roles[r][k];
    return (
      <select className="rounded-lg border border-card-border bg-card-solid px-1.5 py-0.5 text-xs" value={v === undefined ? "" : v ? "on" : "off"} data-testid={`rep-acc-${r}-${k}`}
        onChange={(e) => { const roles = { ...cfg.roles, [r]: { ...cfg.roles[r] } }; if (e.target.value === "") delete roles[r][k]; else roles[r][k] = e.target.value === "on"; setCfg({ ...cfg, roles }); }}>
        <option value="">{tr("As global", "كالعام")}</option><option value="on">{k === "pdf" || k === "xlsx" ? tr("Allow", "سماح") : tr("Show", "إظهار")}</option><option value="off">{k === "pdf" || k === "xlsx" ? tr("Not allow", "منع") : tr("Hide", "إخفاء")}</option>
      </select>
    );
  };
  return (
    <section className={card} data-testid="rep-access">
      <h3 className="font-extrabold">🔐 {tr("Report access — Show / Hide and exports", "صلاحيات التقرير — إظهار / إخفاء والتصدير")}</h3>
      <p className="mb-3 text-xs opacity-75">{tr("Applies to everyone who can open the report except you (admin always sees everything). Order: global → role → each teacher's own Permissions (Teachers → edit → Department Report). Enforced on the server: hidden sections are left out of the data and blocked exports are refused.", "ينطبق على كل من يفتح التقرير عداك. الترتيب: عام ← الدور ← صلاحيات كل معلم. يُطبَّق على الخادم.")}</p>
      <div className="overflow-x-auto"><table className="w-full min-w-[520px] text-sm">
        <thead><tr className="text-xs opacity-75"><th className="py-1 text-start">{tr("Section / export", "القسم / التصدير")}</th><th className="text-start">{tr("Global", "عام")}</th><th className="text-start">{tr("Teachers", "المعلمون")}</th><th className="text-start">{tr("Inspector / Leadership (coming)", "المفتش / القيادة (قريباً)")}</th></tr></thead>
        <tbody>{REP_KEYS.map((k) => (
          <tr key={k} className="border-t border-card-border"><td className="py-1.5 font-semibold">{repKeyLabel(k, tr)}</td>
            <td>{sw(g(k), (v) => setCfg({ ...cfg, global: { ...cfg.global, [k]: v } }), `rep-acc-global-${k}`, k === "pdf" || k === "xlsx")}</td>
            <td>{roleSel("teacher", k)}</td><td>{roleSel("inspector", k)}</td></tr>))}</tbody>
      </table></div>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button type="button" className="rounded-full bg-[#1b3a57] px-4 py-1.5 text-sm font-bold text-white" data-testid="rep-acc-save" onClick={async () => { setMsg(""); try { await reportsApi.saveAccess(cfg); setMsg(tr("Saved.", "تم الحفظ.")); onSaved(); } catch (e) { setMsg((e as Error).message); } }}>{tr("Save access", "حفظ الصلاحيات")}</button>
        {msg && <span className="text-sm" data-testid="rep-acc-msg">{msg}</span>}
      </div>
    </section>
  );
}
export type { Access };

/** Admin: assessment results not linked to any student (older results matched by typed name). Link one to a student, or ignore it. Scores never change. */
function UnmatchedPanel({ tr, onChanged }: { tr: (e: string, a: string) => string; onChanged: () => void }) {
  const [items, setItems] = useState<UnmatchedItem[] | null>(null);
  const [students, setStudents] = useState<{ id: string; name: string; cls: string; section: string }[]>([]);
  const [showIgnored, setShowIgnored] = useState(false);
  const [pickFor, setPickFor] = useState<Record<string, string>>({});
  const [q, setQ] = useState("");
  const [msg, setMsg] = useState("");
  const load = useCallback(async () => { try { const r = await reportsApi.unmatched(showIgnored); setItems(r.items); setStudents(r.students); } catch (e) { setMsg((e as Error).message); setItems([]); } }, [showIgnored]);
  // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch on toggle
  useEffect(() => { void load(); }, [load]);
  const act = async (id: string, op: "link" | "ignore" | "reset") => {
    setMsg("");
    try { await reportsApi.link(id, op, pickFor[id]); setMsg(op === "link" ? tr("Linked — the report now counts it for that student.", "تم الربط.") : op === "ignore" ? tr("Ignored — left out of reports.", "تم التجاهل.") : tr("Reset.", "تمت الإعادة.")); await load(); onChanged(); } catch (e) { setMsg((e as Error).message); }
  };
  const ql = q.trim().toLowerCase();
  const opts = students.filter((s) => !ql || `${s.name} ${s.cls} ${s.section}`.toLowerCase().includes(ql)).slice(0, 300);
  return (
    <section className={card} data-testid="rep-unmatched">
      <h3 className="font-extrabold">🔗 {tr("Unmatched results", "نتائج غير مرتبطة")}</h3>
      <p className="mb-2 text-xs opacity-75">{tr("New results from logged-in students are linked to their account automatically. Older results were saved under the typed name; those that don't match exactly one student are listed here. Linking or ignoring never changes the score.", "النتائج الجديدة من الطلاب المسجلين تُربط تلقائياً. النتائج القديمة التي لا تطابق طالباً واحداً تظهر هنا. لا تتغير الدرجة.")}</p>
      <div className="mb-2 flex flex-wrap items-center gap-3 text-sm">
        <input className={sel + " !mt-0 !w-56"} placeholder={tr("Filter student list…", "تصفية قائمة الطلاب…")} value={q} onChange={(e) => setQ(e.target.value)} data-testid="rep-um-search" />
        <label className="flex items-center gap-1.5"><input type="checkbox" checked={showIgnored} onChange={(e) => setShowIgnored(e.target.checked)} data-testid="rep-um-show-ignored" /> {tr("Show ignored", "إظهار المتجاهَلة")}</label>
        {msg && <span className="font-semibold" role="status" data-testid="rep-um-msg">{msg}</span>}
      </div>
      {!items ? <p className="text-sm opacity-75">…</p> : items.length === 0 ? <p className="rounded-xl border border-dashed border-card-border p-4 text-sm opacity-80" data-testid="rep-um-empty">{tr("Nothing to link — every result is matched to a student.", "لا شيء للربط — كل النتائج مرتبطة.")}</p> : (
        <ul className="space-y-2" data-testid="rep-um-list">{items.map((it) => (
          <li key={it.id} className="rounded-xl border border-card-border p-2.5 text-sm" data-testid="rep-um-item">
            <div className="flex flex-wrap items-baseline justify-between gap-2"><b>“{it.name}”</b><span className="text-xs opacity-75">{it.quizTitle} · {Math.round(it.percentage)}% · {dday(it.finishedAt)} · {it.kind}{it.why === "ambiguous" ? ` · ${tr("same name as", "نفس اسم")} ${it.candidates.length} ${tr("students", "طلاب")}` : it.why === "ignored" ? ` · ${tr("ignored", "متجاهَل")}` : ""}</span></div>
            <div className="mt-1.5 flex flex-wrap items-center gap-2">
              {it.why === "ignored" ? <button type="button" className="btn-glass px-2.5 py-1 text-xs" onClick={() => act(it.id, "reset")} data-testid="rep-um-reset">{tr("Un-ignore", "إلغاء التجاهل")}</button> : <>
                <select className={sel + " !mt-0 !w-auto max-w-full"} value={pickFor[it.id] || ""} onChange={(e) => setPickFor({ ...pickFor, [it.id]: e.target.value })} data-testid="rep-um-pick">
                  <option value="">{tr("Pick a student…", "اختر طالباً…")}</option>
                  {(it.candidates.length ? students.filter((s) => it.candidates.includes(s.id)) : opts).map((s) => <option key={s.id} value={s.id}>{s.name} — {s.cls} {s.section}</option>)}
                </select>
                <button type="button" disabled={!pickFor[it.id]} className="rounded-full bg-[#1b3a57] px-3 py-1 text-xs font-bold text-white disabled:opacity-50" onClick={() => act(it.id, "link")} data-testid="rep-um-link">{tr("Link", "ربط")}</button>
                <button type="button" className="btn-glass px-2.5 py-1 text-xs" onClick={() => act(it.id, "ignore")} data-testid="rep-um-ignore">{tr("Ignore", "تجاهل")}</button></>}
            </div>
          </li>))}</ul>)}
    </section>
  );
}
