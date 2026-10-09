"use client";

import { useState } from "react";
import { fieldCls, primaryBtn } from "@/components/assessment/AssessmentShell";
import { ChoiceList, ResultBars, actErr, useTr } from "@/components/activity/common";
import { activityApi, type ActivityState, type Who } from "@/lib/activity";
import { downloadBlob, safeFileName } from "@/lib/exportUtils";

export type SurveyQuestion = { kind: "choice" | "rating" | "emoji" | "text"; q: string; choices?: string[] };
export const EMOJIS = ["😞", "🙁", "😐", "🙂", "😄"];

export const surveyQuestions = (state: ActivityState): SurveyQuestion[] =>
  Array.isArray(state.settings.options.questions) ? (state.settings.options.questions as SurveyQuestion[]) : [];

/** Text shown in exports for one answer. */
export function answerText(q: SurveyQuestion, a: unknown): string {
  if (a === null || a === undefined || a === "") return "";
  if (q.kind === "choice") return q.choices?.[Number(a)] ?? "";
  if (q.kind === "emoji") return `${EMOJIS[Number(a) - 1] ?? ""} ${a}`;
  return String(a);
}

/** Excel: one row per student with a column per question, plus a summary sheet. */
export async function exportSurveyXlsx(state: ActivityState) {
  const ExcelJS = (await import("exceljs")).default;
  const qs = surveyQuestions(state);
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Responses");
  ws.columns = [{ header: "Name", key: "name", width: 24 }, { header: "Time", key: "time", width: 20 }, ...qs.map((q, i) => ({ header: `Q${i + 1}. ${q.q}`.slice(0, 120), key: `q${i}`, width: q.kind === "text" ? 50 : 22 }))];
  ws.getRow(1).font = { bold: true };
  const names = new Map(state.participants.map((p) => [p.id, p.name]));
  for (const it of state.items.filter((i) => i.kind === "response")) {
    const ans = (it.data.answers as unknown[]) || [];
    const row: Record<string, string | number> = { name: names.get(it.pid) || it.author, time: new Date(it.created).toLocaleString() };
    qs.forEach((q, i) => (row[`q${i}`] = q.kind === "rating" && typeof ans[i] === "number" ? (ans[i] as number) : answerText(q, ans[i])));
    ws.addRow(row);
  }
  const sum = wb.addWorksheet("Summary");
  sum.columns = [{ header: "Question", key: "q", width: 50 }, { header: "Answer", key: "a", width: 30 }, { header: "Count", key: "n", width: 10 }, { header: "Average", key: "avg", width: 10 }];
  sum.getRow(1).font = { bold: true };
  const sq = state.summary?.questions || [];
  qs.forEach((q, i) => {
    const s = sq[i] || {};
    if (q.kind === "text") (s.texts || []).forEach((t) => sum.addRow({ q: q.q, a: t }));
    else {
      const labels = q.kind === "choice" ? q.choices || [] : [1, 2, 3, 4, 5].map((n) => (q.kind === "emoji" ? `${EMOJIS[n - 1]} ${n}` : String(n)));
      labels.forEach((l, k) => sum.addRow({ q: q.q, a: l, n: (s.counts || [])[k] || 0, avg: k === 0 && s.avg !== undefined ? s.avg : undefined }));
    }
  });
  const buf = await wb.xlsx.writeBuffer();
  downloadBlob(new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }), `${safeFileName(state.title || "survey")}-${state.code}-responses.xlsx`);
}

export function SurveyStudent({ code, who, state, closed, reload }: { code: string; who: Who; state: ActivityState; closed: boolean; reload: () => void }) {
  const { tr } = useTr();
  const qs = surveyQuestions(state);
  const mine = state.items.find((i) => i.kind === "response" && i.mine);
  const [answers, setAnswers] = useState<unknown[]>(() => (mine?.data.answers as unknown[]) || qs.map(() => null));
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const set = (i: number, v: unknown) => setAnswers((a) => qs.map((_, j) => (j === i ? v : a[j] ?? null)));

  if (mine && !editing) {
    return (
      <div className="glass rounded-3xl p-6 text-center" data-testid="survey-done">
        <p className="text-5xl" aria-hidden>🙏</p>
        <p className="mt-2 text-2xl font-bold">{tr("Thank you — your answers are saved.", "شكرًا — تم حفظ إجاباتك.")}</p>
        {!closed && <button type="button" className="mt-3 text-sm font-semibold underline" onClick={() => setEditing(true)} data-testid="survey-edit">{tr("Edit my answers", "تعديل إجاباتي")}</button>}
      </div>
    );
  }
  if (closed) return <p className="glass rounded-3xl p-6 text-center text-lg font-semibold">{tr("This survey is closed.", "هذا الاستبيان مغلق.")}</p>;

  return (
    <form
      className="space-y-5"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        setMsg("");
        try {
          await activityApi.respond(code, who, { answers });
          setEditing(false);
          reload();
        } catch (err) {
          setMsg(actErr(err, tr));
        } finally {
          setBusy(false);
        }
      }}
    >
      {qs.map((q, i) => (
        <fieldset key={i} className="glass rounded-3xl p-4 sm:p-5" data-testid="survey-question">
          <legend className="sr-only">{q.q}</legend>
          <p className="text-lg font-bold" dir="auto"><span className="opacity-50">{i + 1}.</span> {q.q}</p>
          {q.kind === "choice" && (
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              {(q.choices || []).map((c, k) => (
                <button key={k} type="button" role="radio" aria-checked={answers[i] === k} onClick={() => set(i, k)} className={`rounded-2xl border-2 px-4 py-3 text-start font-semibold ${answers[i] === k ? "border-sun-border bg-sun text-navy" : "border-black/10 bg-white/85 dark:border-white/15 dark:bg-white/5"}`} dir="auto" data-testid="survey-choice">
                  {c}
                </button>
              ))}
            </div>
          )}
          {(q.kind === "rating" || q.kind === "emoji") && (
            <div className="mt-3 flex flex-wrap gap-2" role="radiogroup" dir="ltr">
              {[1, 2, 3, 4, 5].map((n) => (
                <button key={n} type="button" role="radio" aria-checked={answers[i] === n} aria-label={String(n)} onClick={() => set(i, n)} className={`flex h-14 w-14 items-center justify-center rounded-2xl border-2 text-2xl font-black ${answers[i] === n ? "border-sun-border bg-sun text-navy scale-110" : "border-black/10 bg-white/85 dark:border-white/15 dark:bg-white/5"} transition`} data-testid={`survey-${q.kind}`}>
                  {q.kind === "emoji" ? EMOJIS[n - 1] : n}
                </button>
              ))}
            </div>
          )}
          {q.kind === "text" && (
            <textarea className={fieldCls + " min-h-24"} value={String(answers[i] ?? "")} onChange={(e) => set(i, e.target.value)} maxLength={300} dir="auto" data-testid="survey-text" />
          )}
        </fieldset>
      ))}
      {msg && <p className="rounded-xl bg-rose-100 px-4 py-2 text-rose-800 dark:bg-rose-900/40 dark:text-rose-100" role="alert">{msg}</p>}
      <button type="submit" className={`${primaryBtn} w-full sm:w-auto`} disabled={busy || answers.every((a) => a === null || a === "")} data-testid="survey-submit">
        {busy ? "…" : tr("Send answers", "إرسال الإجابات")}
      </button>
    </form>
  );
}

export function SurveyHost({ state, big }: { code: string; hostKey: string; state: ActivityState; reload: () => void; big: boolean }) {
  const { tr } = useTr();
  const qs = surveyQuestions(state);
  const sq = state.summary?.questions || [];
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className="rounded-full bg-header px-3 py-1.5 text-sm font-bold text-sun" data-testid="survey-respondents">
          📝 {state.summary?.respondents ?? 0} / {state.participants.filter((p) => !p.removed).length} {tr("responded", "أجابوا")}
        </span>
        <button type="button" className="rounded-full bg-emerald-600 px-3 py-1.5 text-sm font-bold text-white hover:bg-emerald-700" onClick={() => exportSurveyXlsx(state)} data-testid="survey-export">
          ⬇ {tr("Responses (Excel)", "الإجابات (إكسل)")}
        </button>
      </div>
      <div className={`grid gap-4 ${big ? "lg:grid-cols-2" : ""}`}>
        {qs.map((q, i) => {
          const s = sq[i] || {};
          return (
            <section key={i} className="glass rounded-3xl p-4 sm:p-5" data-testid="survey-summary">
              <h3 className="mb-3 text-lg font-bold" dir="auto"><span className="opacity-50">{i + 1}.</span> {q.q}</h3>
              {q.kind === "text" ? (
                <ul className="max-h-80 space-y-2 overflow-auto">
                  {(s.texts || []).length === 0 && <li className="opacity-60">{tr("No answers yet", "لا توجد إجابات بعد")}</li>}
                  {(s.texts || []).map((t, k) => (
                    <li key={k} className="rounded-2xl bg-white/80 px-3 py-2 dark:bg-white/5" dir="auto">{t}</li>
                  ))}
                </ul>
              ) : (
                <>
                  {s.avg !== undefined && <p className="mb-2 text-3xl font-black" data-testid="survey-avg">{q.kind === "emoji" ? EMOJIS[Math.max(0, Math.round(s.avg) - 1)] : "⭐"} {s.avg.toFixed(2)} <span className="text-base font-semibold opacity-60">/ 5</span></p>}
                  <ResultBars labels={q.kind === "choice" ? q.choices || [] : [1, 2, 3, 4, 5].map((n) => (q.kind === "emoji" ? `${EMOJIS[n - 1]} ${n}` : `${n} ★`))} counts={s.counts || []} />
                </>
              )}
            </section>
          );
        })}
      </div>
    </div>
  );
}

export function SurveyOptions({ options, setOptions }: { options: Record<string, unknown>; setOptions: (o: Record<string, unknown>) => void }) {
  const { tr } = useTr();
  const qs = Array.isArray(options.questions) ? (options.questions as SurveyQuestion[]) : [{ kind: "rating", q: "" } as SurveyQuestion];
  const set = (n: SurveyQuestion[]) => setOptions({ ...options, questions: n });
  const kinds: [SurveyQuestion["kind"], string][] = [
    ["choice", tr("Multiple choice", "اختيار من متعدد")],
    ["rating", tr("Rating 1–5", "تقييم ١–٥")],
    ["emoji", tr("Emoji scale", "مقياس الوجوه")],
    ["text", tr("Short text", "نص قصير")],
  ];
  const input = "min-w-0 flex-1 rounded-xl border border-black/10 bg-white px-3 py-2 text-sm dark:border-white/15 dark:bg-black/20";
  return (
    <div className="space-y-3 rounded-2xl border border-black/10 p-3 dark:border-white/15">
      <p className="text-sm font-semibold">{tr("Questions", "الأسئلة")}</p>
      {qs.map((q, i) => (
        <div key={i} className="space-y-2 rounded-2xl bg-black/[0.03] p-3 dark:bg-white/5" data-testid="survey-q-editor">
          <div className="flex flex-wrap items-center gap-2">
            <span className="w-6 text-center text-sm font-bold opacity-60">{i + 1}</span>
            <input className={input} value={q.q} maxLength={200} dir="auto" placeholder={tr("Question", "السؤال")} onChange={(e) => set(qs.map((x, j) => (j === i ? { ...x, q: e.target.value } : x)))} data-testid="survey-q-input" />
            <select className="rounded-full border border-black/10 bg-white px-2 py-1.5 text-sm dark:border-white/15 dark:bg-black/30" value={q.kind} onChange={(e) => set(qs.map((x, j) => (j === i ? { ...x, kind: e.target.value as SurveyQuestion["kind"], choices: e.target.value === "choice" ? x.choices || ["", ""] : undefined } : x)))} data-testid="survey-q-kind">
              {kinds.map(([k, l]) => (
                <option key={k} value={k}>{l}</option>
              ))}
            </select>
            {qs.length > 1 && <button type="button" className="px-2 text-rose-600" onClick={() => set(qs.filter((_, j) => j !== i))} aria-label={tr("Remove question", "حذف السؤال")}>✕</button>}
          </div>
          {q.kind === "choice" && (
            <div className="ps-8">
              <ChoiceList choices={q.choices || ["", ""]} setChoices={(c) => set(qs.map((x, j) => (j === i ? { ...x, choices: c } : x)))} tr={tr} testid="survey-choice" />
            </div>
          )}
        </div>
      ))}
      {qs.length < 20 && (
        <button type="button" className="rounded-full border border-dashed border-black/20 px-3 py-1 text-sm font-semibold dark:border-white/25" onClick={() => set([...qs, { kind: "rating", q: "" }])} data-testid="survey-q-add">
          + {tr("Add question", "إضافة سؤال")}
        </button>
      )}
    </div>
  );
}
