"use client";

import { useEffect, useMemo, useState } from "react";
import { formatClock, localizeQuestion, useAssessmentText } from "@/lib/assessmentI18n";
import type { ClassSummary, QuestionDetail, ResultRow } from "@/lib/groupSession";
import { describeAnswer, describeCorrect, type Quiz, type ReviewLine } from "@/lib/quiz";

const MEDALS = ["🥇", "🥈", "🥉"];

/** 1 → "1st", 2 → "2nd", 11 → "11th" (Arabic: "المركز 1"). */
export function ordinal(n: number, lang: string): string {
  if (lang === "ar") return `المركز ${n}`;
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return `${n}${s[(v - 20) % 10] || s[v] || s[0]}`;
}

/** Competition ranking (ties share a rank: 1, 1, 3). Rows are expected to be sorted by score already. */
function tiedCount(rows: ResultRow[], rank: number): number {
  return rows.filter((r) => r.rank === rank).length;
}

export function computeSummary(rows: ResultRow[]): ClassSummary {
  const pcts = rows.map((r) => r.percentage);
  return {
    count: rows.length,
    submitted: rows.filter((r) => r.submitted).length,
    averagePercentage: pcts.length ? Math.round((pcts.reduce((a, b) => a + b, 0) / pcts.length) * 10) / 10 : 0,
    highestPercentage: pcts.length ? Math.max(...pcts) : 0,
    lowestPercentage: pcts.length ? Math.min(...pcts) : 0,
    averageScore: rows.length ? Math.round((rows.reduce((a, r) => a + r.score, 0) / rows.length) * 10) / 10 : 0,
  };
}

/** Class results: summary, then rank / name / score / correct / wrong / %. Names open a per-question detail when available. */
export function ResultsBoard({
  rows,
  questionCount,
  highlightName,
  showProgress = false,
  summary,
  quiz,
}: {
  rows: ResultRow[];
  questionCount: number;
  highlightName?: string;
  /** While running: show answered/finished status instead of emphasising the score. */
  showProgress?: boolean;
  summary?: ClassSummary;
  /** Full assessment (with answer key) — needed to show the per-question detail. */
  quiz?: Quiz;
}) {
  const { a, lang } = useAssessmentText();
  const tr = (en: string, ar: string) => (lang === "ar" ? ar : en);
  const [openName, setOpenName] = useState<string | null>(null);
  const sum = useMemo(() => summary ?? computeSummary(rows), [summary, rows]);
  const open = openName ? rows.find((r) => r.name === openName) : undefined;

  if (!rows.length) return <p className="text-lg opacity-70">{a("noStudents")}</p>;
  return (
    <div className="space-y-5">
      {!showProgress && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4" data-testid="class-summary">
          <SummaryTile label={tr("Class average", "متوسط الصف")} value={`${sum.averagePercentage}%`} />
          <SummaryTile label={tr("Highest", "الأعلى")} value={`${sum.highestPercentage}%`} tone="good" />
          <SummaryTile label={tr("Lowest", "الأدنى")} value={`${sum.lowestPercentage}%`} tone="low" />
          <SummaryTile label={tr("Students", "الطلاب")} value={`${sum.submitted}/${sum.count}`} hint={tr("submitted", "أرسلوا")} />
        </div>
      )}
      <div className="overflow-x-auto rounded-3xl border border-emerald-900/10 bg-white/90 shadow-xl shadow-emerald-900/5 dark:border-emerald-100/10 dark:bg-white/5">
        <table className="w-full text-start text-sm sm:text-lg">
          <thead className="bg-teal-700 text-white dark:bg-teal-600">
            <tr>
              <th className="px-2 py-3 text-start font-semibold sm:px-4">{a("rank")}</th>
              <th className="px-2 py-3 text-start font-semibold sm:px-4">{a("name")}</th>
              <th className="px-2 py-3 text-center font-semibold sm:px-4">{a("total")}</th>
              <th className="px-2 py-3 text-center font-semibold sm:px-4">{a("correct")}</th>
              <th className="px-2 py-3 text-center font-semibold sm:px-4">{a("wrong")}</th>
              <th className="px-2 py-3 text-center font-semibold sm:px-4">%</th>
              {showProgress && <th className="px-2 py-3 text-center font-semibold sm:px-4">✓</th>}
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => {
              const me = (highlightName && r.name === highlightName) || r.isSelf;
              const clickable = Boolean(quiz && r.details?.length);
              const tie = tiedCount(rows, r.rank) > 1;
              return (
                <tr
                  key={`${r.name}-${i}`}
                  className={`border-t border-emerald-900/10 dark:border-emerald-100/10 ${
                    me ? "bg-amber-100 font-semibold dark:bg-amber-900/30" : i % 2 ? "bg-emerald-50/50 dark:bg-white/[0.03]" : ""
                  }`}
                >
                  <td className="whitespace-nowrap px-2 py-2.5 sm:px-4">
                    {!showProgress && r.rank <= 3 ? <span className="me-1">{MEDALS[r.rank - 1]}</span> : null}
                    <span className="text-xs font-semibold sm:text-sm" data-testid="rank-label">
                      {ordinal(r.rank, lang)}
                      {tie && !showProgress ? <span className="ms-1 opacity-60">{tr("(tie)", "(تعادل)")}</span> : null}
                    </span>
                  </td>
                  <td className="px-2 py-2.5 sm:px-4">
                    {clickable ? (
                      <button
                        type="button"
                        onClick={() => setOpenName(r.name)}
                        className="text-start font-semibold text-teal-800 underline decoration-teal-500/50 decoration-2 underline-offset-4 hover:decoration-teal-600 dark:text-teal-200"
                        data-testid="student-name-button"
                        title={tr("See answers", "عرض الإجابات")}
                      >
                        {r.name}
                      </button>
                    ) : (
                      r.name
                    )}
                    {me ? <span className="ms-2 rounded-full bg-teal-700 px-2 py-0.5 text-xs text-white">{a("youLabel")}</span> : null}
                  </td>
                  <td className="px-2 py-2.5 text-center font-bold text-teal-800 tabular-nums dark:text-teal-200 sm:px-4">
                    {r.score}/{r.maxScore}
                  </td>
                  <td className="px-2 py-2.5 text-center tabular-nums text-emerald-700 dark:text-emerald-300 sm:px-4">{r.correct}</td>
                  <td className="px-2 py-2.5 text-center tabular-nums text-rose-700 dark:text-rose-300 sm:px-4">
                    {r.wrong}
                    {r.unanswered > 0 ? <span className="block text-[11px] leading-tight opacity-70 sm:inline sm:ms-1 sm:text-xs">({r.unanswered} {a("skipped")})</span> : null}
                  </td>
                  <td className="px-2 py-2.5 text-center font-semibold tabular-nums sm:px-4">{r.percentage}%</td>
                  {showProgress && (
                    <td className="px-2 py-2.5 text-center text-sm sm:px-4">
                      {r.submitted ? (
                        <span className="rounded-full bg-emerald-600 px-2 py-0.5 text-white">{a("finished")}</span>
                      ) : (
                        <span className="opacity-70">
                          {questionCount - r.unanswered}/{questionCount}
                        </span>
                      )}
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {rows.some((r) => r.details?.length) && quiz && (
        <p className="text-sm opacity-70">{tr("Tap a name to see every question, the answer given and the correct answer.", "اضغط على الاسم لعرض كل سؤال والإجابة المختارة والإجابة الصحيحة.")}</p>
      )}
      {open && quiz && open.details && <StudentDetail row={open} quiz={quiz} rows={rows} onClose={() => setOpenName(null)} />}
    </div>
  );
}

function SummaryTile({ label, value, hint, tone }: { label: string; value: string; hint?: string; tone?: "good" | "low" }) {
  const color = tone === "good" ? "text-emerald-700 dark:text-emerald-300" : tone === "low" ? "text-rose-700 dark:text-rose-300" : "text-teal-800 dark:text-teal-200";
  return (
    <div className="rounded-2xl bg-white/80 px-4 py-3 shadow-sm ring-1 ring-emerald-900/10 dark:bg-white/5 dark:ring-emerald-100/10">
      <p className="text-xs font-semibold uppercase tracking-wide opacity-70">{label}</p>
      <p className={`mt-1 text-2xl font-black tabular-nums ${color}`}>{value}</p>
      {hint ? <p className="text-xs opacity-60">{hint}</p> : null}
    </div>
  );
}

function Lines({ lines, empty }: { lines: ReviewLine[]; empty: string }) {
  if (!lines.length) return <span className="italic opacity-60">{empty}</span>;
  return (
    <span className="flex flex-col gap-1">
      {lines.map((l, i) => (
        <span key={i} className="flex items-center gap-2" dir="auto">
          {l.image ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={l.image} alt="" className="h-10 w-10 rounded border border-emerald-900/10 bg-white object-contain" />
          ) : null}
          {l.text}
        </span>
      ))}
    </span>
  );
}

function StudentDetail({ row, quiz, rows, onClose }: { row: ResultRow; quiz: Quiz; rows: ResultRow[]; onClose: () => void }) {
  const { a, lang } = useAssessmentText();
  const tr = (en: string, ar: string) => (lang === "ar" ? ar : en);
  const byId = new Map((row.details || []).map((d) => [d.questionId, d] as [string, QuestionDetail]));

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose]);

  const tie = rows.filter((r) => r.rank === row.rank).length > 1;

  return (
    <div className="fixed inset-0 z-[80] flex items-end justify-center bg-black/50 p-0 sm:items-center sm:p-6" role="dialog" aria-modal="true" aria-label={row.name} onClick={onClose}>
      <div
        className="flex max-h-[92vh] w-full max-w-3xl flex-col overflow-hidden rounded-t-3xl bg-white text-teal-950 shadow-2xl dark:bg-[#0d1f1b] dark:text-emerald-50 sm:rounded-3xl"
        onClick={(e) => e.stopPropagation()}
        data-testid="student-detail"
      >
        <div className="flex items-start justify-between gap-4 border-b border-emerald-900/10 px-5 py-4 dark:border-emerald-100/10">
          <div className="min-w-0">
            <p className="truncate text-xl font-bold sm:text-2xl">{row.name}</p>
            <p className="mt-1 text-sm opacity-80">
              {ordinal(row.rank, lang)}
              {tie ? ` ${tr("(tie)", "(تعادل)")}` : ""} · {a("score")}: <b className="tabular-nums">{row.score}/{row.maxScore}</b> · <b className="tabular-nums">{row.percentage}%</b> ·{" "}
              {a("correct")}: {row.correct} · {a("wrong")}: {row.wrong}
            </p>
          </div>
          <button type="button" onClick={onClose} className="shrink-0 rounded-full bg-emerald-900/5 px-3 py-1.5 text-sm font-semibold hover:bg-emerald-900/10 dark:bg-white/10" aria-label={tr("Close", "إغلاق")}>
            ✕
          </button>
        </div>
        <ol className="flex-1 space-y-3 overflow-y-auto px-5 py-4">
          {quiz.questions.map((raw, i) => {
            const q = localizeQuestion(raw, lang);
            const d = byId.get(raw.id);
            const answered = Boolean(d?.answered);
            const ok = Boolean(d?.isCorrect);
            return (
              <li
                key={raw.id}
                className={`rounded-2xl border px-4 py-3 ${
                  ok
                    ? "border-emerald-300 bg-emerald-50 dark:border-emerald-700/60 dark:bg-emerald-900/20"
                    : answered
                      ? "border-rose-300 bg-rose-50 dark:border-rose-700/60 dark:bg-rose-900/20"
                      : "border-amber-300 bg-amber-50 dark:border-amber-700/60 dark:bg-amber-900/20"
                }`}
                data-testid="detail-question"
              >
                <div className="flex items-start justify-between gap-3">
                  <p className="font-semibold" dir="auto">
                    <span className="me-2 opacity-60">{i + 1}.</span>
                    {q.prompt}
                  </p>
                  <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-bold text-white ${ok ? "bg-emerald-600" : answered ? "bg-rose-600" : "bg-amber-600"}`}>
                    {ok ? `✓ ${a("correct")}` : answered ? `✗ ${a("wrong")}` : a("noAnswer")}
                  </span>
                </div>
                <dl className="mt-2 grid gap-2 text-sm sm:grid-cols-2">
                  <div>
                    <dt className="text-xs font-semibold uppercase opacity-60">{tr("Answer given", "الإجابة المختارة")}</dt>
                    <dd>
                      <Lines lines={d ? describeAnswer(q, d.answer) : []} empty={a("noAnswer")} />
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs font-semibold uppercase opacity-60">{a("correctAnswer")}</dt>
                    <dd>
                      <Lines lines={describeCorrect(q)} empty={a("notSet")} />
                    </dd>
                  </div>
                </dl>
                <p className="mt-2 text-xs opacity-70">
                  {tr("Marks", "الدرجات")}: <b className="tabular-nums">{d?.earned ?? 0}/{d?.points ?? raw.points}</b>
                  {d?.secondsFromStart !== null && d?.secondsFromStart !== undefined ? (
                    <>
                      {" · "}
                      {tr("Answered at", "أُجيب عند")} <span dir="ltr" className="tabular-nums">+{formatClock(d.secondsFromStart)}</span>
                    </>
                  ) : null}
                  {d?.position ? (
                    <>
                      {" · "}
                      {tr(`Shown as Q${d.position}`, `ظهر كسؤال ${d.position}`)}
                    </>
                  ) : null}
                </p>
                {q.explanation ? <p className="mt-1 text-xs opacity-80" dir="auto">💡 {q.explanation}</p> : null}
              </li>
            );
          })}
        </ol>
      </div>
    </div>
  );
}

export function resultsCsv(rows: ResultRow[]): string {
  const esc = (s: string | number) => `"${String(s).replace(/"/g, '""')}"`;
  const head = ["Rank", "Name", "Score", "Max", "Correct", "Wrong", "Unanswered", "Percentage", "Submitted"];
  return [head, ...rows.map((r) => [r.rank, r.name, r.score, r.maxScore, r.correct, r.wrong, r.unanswered, r.percentage, r.submitted ? "yes" : "no"])]
    .map((line) => line.map(esc).join(","))
    .join("\n");
}
