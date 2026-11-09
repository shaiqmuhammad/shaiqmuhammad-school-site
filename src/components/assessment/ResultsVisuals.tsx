"use client";

import { DlGate } from "@/components/lms/DlGate";
import { useEffect, useMemo, useRef, useState } from "react";
import { ANIMALS, Avatar, moodFromScore } from "@/components/lms/Avatar";
import { SfxToggle } from "@/components/activity/SfxToggle";
import { sfxFanfare } from "@/lib/sfx";
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

/** t422: dense podium places — 1st, 2nd and 3rd are the three best distinct scores (ties share a step, nobody is skipped). */
export function podiumPlaces<T extends { score: number; submitted?: boolean }>(rows: T[]): (T & { place: number })[] {
  const live = rows.filter((r) => r.submitted !== false || r.score > 0);
  const top = [...new Set(live.map((r) => r.score))].sort((a, b) => b - a).slice(0, 3);
  return live.filter((r) => top.includes(r.score)).map((r) => ({ ...r, place: top.indexOf(r.score) + 1 }));
}
/** A friendly fallback character for a name (anonymous joiners): one of the 24 animals, stable per name. */
export const nameAvatar = (n: string) => { let h = 7; for (const c of n) h = (h * 31 + c.charCodeAt(0)) >>> 0; return `a${h % ANIMALS}`; };

/** Top-3 podium with characters, medals, confetti and an appreciation sound (respects the 🔊 mute). */
export function Podium({ rows, lang, saved }: { rows: ResultRow[] | { p: number; n: string; a: string; pct: number }[]; lang: string; saved?: boolean }) {
  const list = useMemo(() => (saved ? (rows as { p: number; n: string; a: string; pct: number }[]).map((r) => ({ place: r.p, name: r.n, av: r.a, percentage: r.pct })) : podiumPlaces(rows as ResultRow[]).map((r) => ({ place: r.place, name: r.name, av: r.av || "", percentage: r.percentage }))), [rows, saved]);
  const played = useRef(false);
  useEffect(() => { if (!saved && list.length && !played.current) { played.current = true; sfxFanfare(); } }, [list.length, saved]);
  if (!list.length) return null;
  const steps = STEPS.filter((s) => list.some((r) => r.place === s.rank));
  return (
    <div className={`relative overflow-hidden rounded-3xl bg-gradient-to-b from-[#1b3a57] via-[#24507a] to-[#1b3a57] ${saved ? "p-3" : "p-4 pt-6"} text-white shadow-xl ring-1 ring-[#f5c542]/40`} data-testid="podium">
      {!saved && <Confetti />}
      {!saved && <p className="mb-3 text-center text-lg font-extrabold text-[#f5c542] sm:text-2xl" data-testid="podium-cheer">🌟 {lang === "ar" ? "أحسنتم جميعًا! ما شاء الله" : "Well done, everyone! MashaAllah"} 🌟</p>}
      {!saved && <div className="absolute end-3 top-3"><SfxToggle /></div>}
      <div className={`mx-auto grid max-w-3xl items-end gap-2 sm:gap-4 ${steps.length === 1 ? "grid-cols-1 max-w-xs" : steps.length === 2 ? "grid-cols-2 max-w-xl" : "grid-cols-3"}`}>
        {steps.map((s) => {
          const who = list.filter((r) => r.place === s.rank);
          return (
            <div key={s.rank} className="flex flex-col items-center text-center" data-testid={`podium-${s.rank}`}>
              <span className={saved ? "text-2xl" : "text-4xl sm:text-5xl"} aria-hidden>{s.medal}</span>
              <div className="mt-1 flex w-full flex-wrap items-end justify-center gap-2">
                {who.slice(0, 4).map((r, i) => (
                  <div key={i} className="flex min-w-0 flex-col items-center" data-testid="podium-person">
                    <Avatar code={r.av || nameAvatar(r.name)} size={saved ? 40 : who.length > 2 ? 56 : 76} anim={saved ? undefined : moodFromScore(r.percentage ?? who[0].percentage, s.rank)} className="ring-4 ring-white/80 shadow-lg" />
                    <p dir="auto" className={`mt-1 max-w-[9rem] truncate font-extrabold text-white ${saved ? "text-xs" : "text-sm sm:text-lg"}`}>{r.name}</p>
                  </div>
                ))}
                {who.length > 4 && <span className="text-xs font-bold text-white/80">+{who.length - 4}</span>}
              </div>
              <p className="text-xs font-bold text-[#f5c542] sm:text-sm">{who[0].percentage}%</p>
              <div className={`mt-2 flex w-full items-start justify-center rounded-t-2xl bg-gradient-to-b ${s.tone} ${saved ? "h-8 text-sm" : s.h + " text-xl sm:text-3xl"} pt-1 font-black`}>
                {lang === "ar" ? s.label[1] : s.label[0]}
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
    <DlGate kind="export"><div className="flex flex-wrap items-center gap-2" data-testid="results-downloads">
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
    </DlGate>
  );
}
