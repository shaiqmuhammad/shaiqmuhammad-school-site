"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { getServerSession } from "@/lib/adminServer";
import { downloadBlob, escapeHtml, htmlBlocksToPdf, isArabic } from "@/lib/exportUtils";
import type { Quiz } from "@/lib/quiz";
import {
  deleteResults,
  dubaiDateTime,
  dubaiDayStart,
  formatDuration,
  getResult,
  listResults,
  type ResultFilters,
  type ResultRecord,
} from "@/lib/resultsRecord";
import { useI18n } from "@/lib/i18n";

const input = "mt-1 w-full rounded-xl border border-card-border bg-card-solid px-3 py-2 text-sm outline-none focus:border-sun-border focus:ring-2 focus:ring-sun/40";
const btnGhost = "btn-glass px-3 py-1.5 text-sm disabled:opacity-60";

const pct = (n: number) => `${Math.round(n * 10) / 10}%`;

/** Teacher's permanent results record: filter, inspect per-question detail, delete, download Excel / PDF. */
export function AdminResults({ quizzes }: { quizzes: Quiz[] }) {
  const { lang } = useI18n();
  const tr = (en: string, ar: string) => (lang === "ar" ? ar : en);
  const [quiz, setQuiz] = useState("");
  const [year, setYear] = useState("");
  const [mode, setMode] = useState<"" | "individual" | "group">("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [q, setQ] = useState("");
  const [rows, setRows] = useState<ResultRecord[] | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState<ResultRecord | null>(null);
  const [busy, setBusy] = useState(false);
  const signedIn = Boolean(getServerSession());

  const filters = useMemo<ResultFilters>(
    () => ({
      quiz: quiz || undefined,
      year: Number(year) || undefined,
      mode,
      from: from ? dubaiDayStart(from) : undefined,
      to: to ? dubaiDayStart(to) + 864e5 - 1 : undefined,
      q,
    }),
    [quiz, year, mode, from, to, q],
  );

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    const items = await listResults(filters);
    setLoading(false);
    if (items === null) setError(tr("Couldn’t load results. Sign in again (server session) and retry.", "تعذر تحميل النتائج. سجّل الدخول مرة أخرى ثم أعد المحاولة."));
    else setRows(items);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters]);

  useEffect(() => {
    const t = setTimeout(load, 300);
    return () => clearTimeout(t);
  }, [load]);

  const years = useMemo(() => [...new Set(quizzes.map((x) => x.year).filter((y): y is number => typeof y === "number"))].sort((a, b) => a - b), [quizzes]);
  const list = rows ?? [];
  const avg = list.length ? list.reduce((a, r) => a + r.percentage, 0) / list.length : 0;

  async function openRow(r: ResultRecord) {
    setOpen({ ...r, details: undefined });
    const full = await getResult(r.id);
    if (full) setOpen(full);
  }

  async function remove(ids: string[], what: string) {
    if (!ids.length || !confirm(what)) return;
    setBusy(true);
    const n = await deleteResults(ids);
    setBusy(false);
    if (n === null) setError(tr("Delete failed.", "فشل الحذف."));
    setOpen(null);
    await load();
  }

  async function withDetails(): Promise<ResultRecord[] | null> {
    return listResults(filters, true);
  }

  async function downloadXlsx() {
    setBusy(true);
    try {
      const data = await withDetails();
      if (!data) return setError(tr("Download failed.", "فشل التنزيل."));
      const ExcelJS = (await import("exceljs")).default;
      const wb = new ExcelJS.Workbook();
      wb.creator = "Shaiq Muhammad";
      const head = (ws: import("exceljs").Worksheet, cells: string[]) => {
        const r = ws.addRow(cells);
        r.font = { bold: true, color: { argb: "FF0B1F33" } };
        r.eachCell((c) => { c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF3C969" } }; });
      };
      const sum = wb.addWorksheet("Summary");
      sum.addRow(["Assessment results"]).font = { bold: true, size: 14 };
      sum.addRow([`Exported ${dubaiDateTime(Date.now())} (Dubai) · ${data.length} records · average ${pct(data.length ? data.reduce((a, r) => a + r.percentage, 0) / data.length : 0)}`]);
      sum.addRow([]);
      head(sum, ["Date (Dubai)", "Student", "Assessment", "Year", "Mode", "Session", "Rank", "Score", "Max", "%", "Correct", "Wrong", "Unanswered", "Time"]);
      data.forEach((r) => {
        const row = sum.addRow([dubaiDateTime(r.finishedAt), r.name, r.quizTitle, r.year ?? "", r.kind, r.sessionCode ?? "", r.rank ? `${r.rank}/${r.groupSize}` : "", r.score, r.maxScore, r.percentage, r.correct, r.wrong, r.unanswered, formatDuration(r.timeSec)]);
        if (isArabic(r.name)) row.getCell(2).alignment = { horizontal: "right", readingOrder: "rtl" };
      });
      sum.columns = [{ width: 20 }, { width: 24 }, { width: 34 }, { width: 6 }, { width: 11 }, { width: 10 }, { width: 8 }, { width: 7 }, { width: 6 }, { width: 7 }, { width: 8 }, { width: 7 }, { width: 11 }, { width: 10 }];
      const det = wb.addWorksheet("Detail");
      head(det, ["Date (Dubai)", "Student", "Assessment", "Mode", "Q", "Question", "Student answer", "Correct answer", "Result", "Marks"]);
      data.forEach((r) =>
        (r.details ?? []).forEach((d) => {
          det.addRow([dubaiDateTime(r.finishedAt), r.name, r.quizTitle, r.kind, d.n, d.prompt, d.answered ? d.answer : "(no answer)", d.correctAnswer, d.isCorrect ? "Correct" : "Wrong", `${d.earned}/${d.points}`]).alignment = { wrapText: true, vertical: "top" };
        }),
      );
      det.columns = [{ width: 18 }, { width: 22 }, { width: 28 }, { width: 10 }, { width: 5 }, { width: 50 }, { width: 30 }, { width: 30 }, { width: 9 }, { width: 7 }];
      const buf = await wb.xlsx.writeBuffer();
      downloadBlob(new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }), `assessment-results-${new Date().toISOString().slice(0, 10)}.xlsx`);
    } finally {
      setBusy(false);
    }
  }

  async function downloadPdf() {
    setBusy(true);
    try {
      const data = await withDetails();
      if (!data) return setError(tr("Download failed.", "فشل التنزيل."));
      const e = escapeHtml;
      const cell = (s: string) => `<td${isArabic(s) ? ' class="ar"' : ""}>${e(s)}</td>`;
      const blocks: string[] = [
        `<div class="blk"><h1>Assessment results</h1><p class="muted">Exported ${e(dubaiDateTime(Date.now()))} (Dubai) · ${data.length} records</p></div>`,
      ];
      for (let i = 0; i < data.length; i += 18) {
        blocks.push(
          `<div class="blk"><table><tr><th>Date (Dubai)</th><th>Student</th><th>Assessment</th><th>Mode</th><th>Rank</th><th>Score</th><th>%</th><th>Time</th></tr>${data
            .slice(i, i + 18)
            .map((r) => `<tr>${cell(dubaiDateTime(r.finishedAt))}${cell(r.name)}${cell(r.quizTitle)}${cell(r.kind + (r.sessionCode ? ` ${r.sessionCode}` : ""))}${cell(r.rank ? `${r.rank}/${r.groupSize}` : "")}${cell(`${r.score}/${r.maxScore}`)}${cell(pct(r.percentage))}${cell(formatDuration(r.timeSec))}</tr>`)
            .join("")}</table></div>`,
        );
      }
      data.forEach((r) => {
        if (!r.details?.length) return;
        blocks.push(`<div class="blk"><h2>${e(r.name)} — ${e(r.quizTitle)}</h2><p class="muted">${e(dubaiDateTime(r.finishedAt))} · ${r.score}/${r.maxScore} (${pct(r.percentage)})</p></div>`);
        for (let i = 0; i < r.details.length; i += 12) {
          blocks.push(
            `<div class="blk"><table><tr><th>Q</th><th>Question</th><th>Answer</th><th>Correct answer</th><th>✓</th></tr>${r.details
              .slice(i, i + 12)
              .map((d) => `<tr>${cell(String(d.n))}${cell(d.prompt)}${cell(d.answered ? d.answer : "(no answer)")}${cell(d.correctAnswer)}${cell(d.isCorrect ? "✓" : "✗")}</tr>`)
              .join("")}</table></div>`,
          );
        }
      });
      await htmlBlocksToPdf(blocks, `assessment-results-${new Date().toISOString().slice(0, 10)}.pdf`, { landscape: true, css: ".pg th{background:#f3c969;color:#0b1f33}" });
    } finally {
      setBusy(false);
    }
  }

  if (!signedIn) {
    return <p className="rounded-xl bg-gold-soft px-4 py-3 text-sm">{tr("Results are stored on the server. Sign out and sign in again with the admin password to open them.", "النتائج محفوظة على الخادم. سجّل الخروج ثم الدخول بكلمة مرور الإدارة لفتحها.")}</p>;
  }

  return (
    <section className="space-y-5" data-testid="admin-results">
      <div>
        <h2 className="text-xl font-extrabold">{tr("Results", "النتائج")}</h2>
        <p className="mt-1 text-sm text-muted">
          {tr(
            "Every individual attempt and every live group session is saved here permanently. Times are Dubai time. Individual attempts are scored in the student’s browser.",
            "تُحفظ هنا كل محاولة فردية وكل جلسة جماعية بشكل دائم. الأوقات بتوقيت دبي. تُصحَّح المحاولات الفردية في متصفح الطالب.",
          )}
        </p>
      </div>
      <div className="glass grid gap-3 rounded-2xl p-4 sm:grid-cols-3">
        <label className="text-xs font-semibold">
          {tr("Assessment", "التقييم")}
          <select className={input} value={quiz} onChange={(e) => setQuiz(e.target.value)} data-testid="results-filter-quiz">
            <option value="">{tr("All", "الكل")}</option>
            {quizzes.map((x) => (
              <option key={x.id} value={x.id}>{x.title}</option>
            ))}
          </select>
        </label>
        <label className="text-xs font-semibold">
          {tr("Year", "السنة")}
          <select className={input} value={year} onChange={(e) => setYear(e.target.value)}>
            <option value="">{tr("All", "الكل")}</option>
            {years.map((y) => (
              <option key={y} value={y}>{tr(`Year ${y}`, `السنة ${y}`)}</option>
            ))}
          </select>
        </label>
        <label className="text-xs font-semibold">
          {tr("Mode", "النوع")}
          <select className={input} value={mode} onChange={(e) => setMode(e.target.value as typeof mode)} data-testid="results-filter-mode">
            <option value="">{tr("All", "الكل")}</option>
            <option value="individual">{tr("Individual", "فردي")}</option>
            <option value="group">{tr("Group session", "جلسة جماعية")}</option>
          </select>
        </label>
        <label className="text-xs font-semibold">
          {tr("From", "من")}
          <input type="date" className={input} value={from} onChange={(e) => setFrom(e.target.value)} />
        </label>
        <label className="text-xs font-semibold">
          {tr("To", "إلى")}
          <input type="date" className={input} value={to} onChange={(e) => setTo(e.target.value)} />
        </label>
        <label className="text-xs font-semibold">
          {tr("Student name or session code", "اسم الطالب أو رمز الجلسة")}
          <input type="search" className={input} value={q} onChange={(e) => setQ(e.target.value)} placeholder={tr("Search…", "بحث…")} data-testid="results-search" />
        </label>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <p className="me-auto text-sm text-muted" data-testid="results-count">
          {loading ? tr("Loading…", "جارٍ التحميل…") : tr(`${list.length} records · average ${pct(avg)}`, `${list.length} سجل · المتوسط ${pct(avg)}`)}
        </p>
        <button type="button" className={btnGhost} disabled={busy || !list.length} onClick={downloadXlsx} data-testid="results-xlsx">⬇ Excel</button>
        <button type="button" className={btnGhost} disabled={busy || !list.length} onClick={downloadPdf} data-testid="results-pdf">⬇ PDF</button>
        <button
          type="button"
          className="rounded-full border border-rose-300 px-3 py-1.5 text-sm text-rose-700 disabled:opacity-50 dark:text-rose-300"
          disabled={busy || !list.length}
          data-testid="results-clear-filtered"
          onClick={() => remove(list.map((r) => r.id), tr(`Delete all ${list.length} records shown? This cannot be undone.`, `حذف كل السجلات المعروضة (${list.length})؟ لا يمكن التراجع.`))}
        >
          {tr("Delete shown", "حذف المعروض")}
        </button>
      </div>
      {error && <p className="rounded-xl bg-rose-100 px-4 py-2 text-sm text-rose-900 dark:bg-rose-900/40 dark:text-rose-100">{error}</p>}

      <div className="overflow-x-auto rounded-2xl border border-card-border">
        <table className="w-full min-w-[720px] text-sm" data-testid="results-table">
          <thead className="bg-sun text-navy">
            <tr className="text-start">
              {[tr("Date (Dubai)", "التاريخ (دبي)"), tr("Student", "الطالب"), tr("Assessment", "التقييم"), tr("Mode", "النوع"), tr("Score", "الدرجة"), "%", tr("Time", "الوقت")].map((h) => (
                <th key={h} className="px-3 py-2 text-start font-bold">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {list.map((r) => (
              <tr
                key={r.id}
                tabIndex={0}
                onClick={() => openRow(r)}
                onKeyDown={(e) => { if (e.key === "Enter") openRow(r); }}
                className="cursor-pointer border-t border-card-border hover:bg-sun/15 focus-visible:bg-sun/20 focus-visible:outline-none"
                data-testid="results-row"
              >
                <td className="whitespace-nowrap px-3 py-2">{dubaiDateTime(r.finishedAt)}</td>
                <td className="px-3 py-2 font-semibold">{r.name}</td>
                <td className="px-3 py-2">{r.quizTitle}{r.year ? <span className="text-muted"> · Y{r.year}</span> : null}</td>
                <td className="whitespace-nowrap px-3 py-2">{r.kind === "group" ? `${tr("Group", "جماعي")} ${r.sessionCode ?? ""} · #${r.rank}/${r.groupSize}` : tr("Individual", "فردي")}</td>
                <td className="px-3 py-2 tabular-nums">{r.score}/{r.maxScore} <span className="text-xs text-muted">({r.correct}✓ {r.wrong}✗)</span></td>
                <td className="px-3 py-2 font-bold tabular-nums">{pct(r.percentage)}</td>
                <td className="px-3 py-2 tabular-nums">{formatDuration(r.timeSec)}</td>
              </tr>
            ))}
            {!loading && rows && !list.length && (
              <tr><td colSpan={7} className="px-3 py-6 text-center text-muted">{tr("No results match these filters.", "لا توجد نتائج مطابقة.")}</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {open && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-6" role="dialog" aria-modal="true" aria-label={open.name} onClick={() => setOpen(null)}>
          <div className="glass glass-emph max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-t-3xl bg-card-solid p-5 sm:rounded-3xl" onClick={(e) => e.stopPropagation()} data-testid="results-detail">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="text-lg font-extrabold">{open.name}</h3>
                <p className="text-sm text-muted">{open.quizTitle} · {dubaiDateTime(open.finishedAt)} · {open.kind === "group" ? `${tr("Group", "جماعي")} ${open.sessionCode} · #${open.rank}/${open.groupSize}` : tr("Individual", "فردي")}</p>
                <p className="mt-1 text-sm font-bold">{open.score}/{open.maxScore} · {pct(open.percentage)} · {open.correct}✓ {open.wrong}✗ · {formatDuration(open.timeSec)}</p>
              </div>
              <button type="button" className={btnGhost} onClick={() => setOpen(null)} aria-label={tr("Close", "إغلاق")}>✕</button>
            </div>
            <ol className="mt-4 space-y-2">
              {(open.details ?? []).map((d) => (
                <li key={d.n} className={`rounded-xl border p-3 text-sm ${d.isCorrect ? "border-emerald-300 bg-emerald-50 dark:bg-emerald-900/20" : "border-rose-300 bg-rose-50 dark:bg-rose-900/20"}`}>
                  <p className="font-semibold">{d.n}. {d.prompt}</p>
                  <p className="mt-1">{tr("Answer", "الإجابة")}: <strong>{d.answered ? d.answer : tr("(no answer)", "(بلا إجابة)")}</strong> {d.isCorrect ? "✓" : "✗"} <span className="text-xs text-muted">({d.earned}/{d.points})</span></p>
                  {!d.isCorrect && <p className="text-muted">{tr("Correct", "الصحيح")}: {d.correctAnswer}</p>}
                </li>
              ))}
              {!open.details && <li className="text-sm text-muted">{tr("Loading…", "جارٍ التحميل…")}</li>}
            </ol>
            <div className="mt-4 flex justify-end">
              <button type="button" disabled={busy} className="rounded-full border border-rose-300 px-3 py-1.5 text-sm text-rose-700 dark:text-rose-300" data-testid="results-delete-one" onClick={() => remove([open.id], tr(`Delete ${open.name}’s result?`, `حذف نتيجة ${open.name}؟`))}>
                {tr("Delete this record", "حذف هذا السجل")}
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
