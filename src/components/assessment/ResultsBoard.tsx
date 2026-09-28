"use client";

import { useAssessmentText } from "@/lib/assessmentI18n";
import type { ResultRow } from "@/lib/groupSession";

const MEDALS = ["🥇", "🥈", "🥉"];

/** Class results table: rank, name, total score, correct, wrong, percentage. */
export function ResultsBoard({
  rows,
  questionCount,
  highlightName,
  showProgress = false,
}: {
  rows: ResultRow[];
  questionCount: number;
  highlightName?: string;
  /** While running: show answered/finished status instead of emphasising the score. */
  showProgress?: boolean;
}) {
  const { a } = useAssessmentText();
  if (!rows.length) return <p className="text-lg opacity-70">{a("noStudents")}</p>;
  return (
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
            const me = highlightName && r.name === highlightName;
            return (
              <tr
                key={`${r.name}-${i}`}
                className={`border-t border-emerald-900/10 dark:border-emerald-100/10 ${
                  me ? "bg-amber-100 font-semibold dark:bg-amber-900/30" : i % 2 ? "bg-emerald-50/50 dark:bg-white/[0.03]" : ""
                }`}
              >
                <td className="px-2 py-2.5 sm:px-4">{!showProgress && r.rank <= 3 ? MEDALS[r.rank - 1] : r.rank}</td>
                <td className="px-2 py-2.5 sm:px-4">
                  {r.name}
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
                <td className="px-2 py-2.5 text-center tabular-nums sm:px-4">{r.percentage}%</td>
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
  );
}

export function resultsCsv(rows: ResultRow[]): string {
  const esc = (s: string | number) => `"${String(s).replace(/"/g, '""')}"`;
  const head = ["Rank", "Name", "Score", "Max", "Correct", "Wrong", "Unanswered", "Percentage", "Submitted"];
  return [head, ...rows.map((r) => [r.rank, r.name, r.score, r.maxScore, r.correct, r.wrong, r.unanswered, r.percentage, r.submitted ? "yes" : "no"])]
    .map((line) => line.map(esc).join(","))
    .join("\n");
}
