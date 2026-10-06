"use client";

import { useEffect, useMemo, useState } from "react";
import type { ResultRow, SessionResults } from "@/lib/groupSession";
import type { Quiz } from "@/lib/quiz";
import { barChartSvg, classAverage, donutGridSvg, questionStats } from "@/lib/resultsCharts";
import { downloadResults, type ResultsFormat } from "@/lib/resultsExport";

const STEPS = [
  { rank: 2, medal: "🥈", h: "h-28 sm:h-36", tone: "from-slate-200 to-slate-400 text-slate-800", label: ["2nd", "الثاني"] },
  { rank: 1, medal: "🥇", h: "h-40 sm:h-52", tone: "from-amber-200 to-amber-400 text-amber-950", label: ["1st", "الأول"] },
  { rank: 3, medal: "🥉", h: "h-20 sm:h-28", tone: "from-orange-200 to-orange-400 text-orange-950", label: ["3rd", "الثالث"] },
];

/** Falling confetti for a few seconds (skipped when the user prefers reduced motion). */
export function Confetti() {
  const [on, setOn] = useState(true);
  const pieces = useMemo(
    () =>
      Array.from({ length: 110 }, (_, i) => ({
        left: (i * 37) % 100,
        delay: ((i * 53) % 25) / 10,
        dur: 2.6 + ((i * 29) % 20) / 10,
        color: ["#f59e0b", "#10b981", "#0ea5e9", "#f43f5e", "#a855f7", "#facc15"][i % 6],
        size: 6 + (i % 5) * 2,
        rot: (i * 47) % 360,
      })),
    [],
  );
  useEffect(() => {
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) setOn(false);
    const t = setTimeout(() => setOn(false), 7000);
    return () => clearTimeout(t);
  }, []);
  if (!on) return null;
  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 z-[70] overflow-hidden" data-testid="confetti">
      <style>{`@keyframes sm-confetti{0%{transform:translateY(-10vh) rotate(0)}100%{transform:translateY(110vh) rotate(720deg)}}`}</style>
      {pieces.map((p, i) => (
        <span
          key={i}
          style={{
            position: "absolute",
            top: 0,
            left: `${p.left}%`,
            width: p.size,
            height: p.size * 0.45,
            background: p.color,
            borderRadius: 2,
            transform: `rotate(${p.rot}deg)`,
            animation: `sm-confetti ${p.dur}s ${p.delay}s linear forwards`,
            opacity: 0.9,
          }}
        />
      ))}
    </div>
  );
}

/** Top-3 podium (ties share a step) with medals and confetti. Rows already carry the names to show. */
export function Podium({ rows, lang }: { rows: ResultRow[]; lang: string }) {
  if (!rows.length) return null;
  return (
    <div className="relative rounded-3xl bg-gradient-to-b from-teal-50 to-white p-4 pt-6 shadow-xl ring-1 ring-emerald-900/10 dark:from-teal-950/40 dark:to-transparent dark:ring-emerald-100/10" data-testid="podium">
      <Confetti />
      <div className="mx-auto grid max-w-3xl grid-cols-3 items-end gap-2 sm:gap-4">
        {STEPS.map((s) => {
          const who = rows.filter((r) => r.rank === s.rank);
          return (
            <div key={s.rank} className="flex flex-col items-center text-center" data-testid={`podium-${s.rank}`}>
              <span className="text-4xl sm:text-6xl" aria-hidden>
                {who.length ? s.medal : ""}
              </span>
              <div className="mt-1 min-h-[3.5rem] w-full space-y-0.5">
                {who.map((r, i) => (
                  <p key={i} dir="auto" className="truncate text-sm font-bold sm:text-xl">
                    {r.name}
                  </p>
                ))}
                {who.length ? <p className="text-xs font-semibold opacity-70 sm:text-sm">{who[0].percentage}%</p> : null}
              </div>
              <div className={`mt-2 flex w-full items-start justify-center rounded-t-2xl bg-gradient-to-b ${s.tone} ${s.h} pt-2 text-xl font-black sm:text-3xl`}>
                {who.length ? (lang === "ar" ? s.label[1] : s.label[0]) : "—"}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/** Bar chart of each student's % (with the class average) and a donut of correct vs wrong for every question. */
export function ResultsCharts({ rows, quiz, lang }: { rows: ResultRow[]; quiz?: Quiz; lang: string }) {
  const ar = lang === "ar";
  const average = classAverage(rows);
  const bar = barChartSvg(rows.map((r) => ({ label: r.name, value: r.percentage })), average, { text: "currentColor", avgLabel: ar ? "متوسط الصف" : "Class average" });
  const stats = questionStats(rows, quiz);
  const donuts = stats.length ? donutGridSvg(stats, { text: "currentColor", cols: 5, qLabel: ar ? "س" : "Q", legend: ar ? ["صحيح", "خطأ"] : ["Correct", "Wrong"] }) : "";
  const box = "rounded-3xl bg-white/90 p-4 shadow-xl ring-1 ring-emerald-900/10 dark:bg-white/5 dark:ring-emerald-100/10";
  return (
    <div className="grid gap-5 lg:grid-cols-2" data-testid="results-charts">
      <figure className={box}>
        <figcaption className="mb-2 flex flex-wrap items-baseline justify-between gap-2 text-lg font-bold">
          {ar ? "نتيجة كل طالب (%)" : "Score per student (%)"}
          <span className="rounded-full bg-amber-100 px-3 py-0.5 text-sm text-amber-900 dark:bg-amber-900/40 dark:text-amber-100" data-testid="class-average">
            {ar ? "متوسط الصف" : "Class average"}: {average}%
          </span>
        </figcaption>
        <div className="w-full [&>svg]:h-auto [&>svg]:w-full" dir="ltr" dangerouslySetInnerHTML={{ __html: bar }} />
      </figure>
      {donuts && (
        <figure className={box}>
          <figcaption className="mb-2 text-lg font-bold">{ar ? "صحيح مقابل خطأ لكل سؤال" : "Correct vs wrong per question"}</figcaption>
          <div className="w-full [&>svg]:h-auto [&>svg]:w-full" dir="ltr" dangerouslySetInnerHTML={{ __html: donuts }} />
        </figure>
      )}
    </div>
  );
}

/** Teacher downloads of the class results (always with real names). */
export function ResultsDownloads({ data }: { data: SessionResults }) {
  const [busy, setBusy] = useState<ResultsFormat | "">("");
  const [err, setErr] = useState("");
  const run = async (f: ResultsFormat) => {
    setBusy(f);
    setErr("");
    try {
      await downloadResults(data, f);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy("");
    }
  };
  const btn = "rounded-full bg-teal-700 px-4 py-2 text-sm font-bold text-white shadow hover:bg-teal-800 disabled:opacity-50 dark:bg-teal-500 dark:text-teal-950";
  return (
    <div className="flex flex-wrap items-center gap-2" data-testid="results-downloads">
      {(
        [
          ["xlsx", "Excel"],
          ["pptx", "PowerPoint"],
          ["pdf", "PDF"],
        ] as [ResultsFormat, string][]
      ).map(([f, label]) => (
        <button key={f} type="button" className={btn} disabled={!!busy || !data.rows.length} onClick={() => run(f)} data-testid={`results-${f}`}>
          ⬇ {busy === f ? "…" : label}
        </button>
      ))}
      {err && <span className="text-sm text-rose-600">{err}</span>}
    </div>
  );
}
