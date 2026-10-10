"use client";

import { useState } from "react";
import { useTr, GRADE_STYLE, gradeLabel } from "@/components/lms/useLms";
import type { Level, Scores, TrackerRow } from "@/lib/lms";

/** Overall rule (mirrors the worker): all 3 → Excellent; any 1 → Needs practice; otherwise Good. */
export const overallOf = (s: { m: Level; t: Level; r: Level }) => (s.m === 3 && s.t === 3 && s.r === 3 ? "green" : Math.min(s.m, s.t, s.r) === 1 ? "red" : "yellow");
export const CRITS = [
  { k: "m", short: ["M", "م"], en: "Makharij", ar: "المخارج", hintEn: "Articulation points", hintAr: "مخارج الحروف" },
  { k: "t", short: ["T", "ج"], en: "Tajweed", ar: "التجويد", hintEn: "Rules", hintAr: "الأحكام" },
  { k: "r", short: ["R", "ت"], en: "Recitation", ar: "التلاوة", hintEn: "Fluency & memorisation", hintAr: "الطلاقة ودقة الحفظ" },
] as const;
export const LEVELS: Record<Level, [string, string, string]> = { 1: ["Needs practice", "يحتاج تدريبًا", "bg-rose-500"], 2: ["Good", "جيد", "bg-amber-400"], 3: ["Excellent", "ممتاز", "bg-emerald-500"] };
const CRIT_PRESETS: Record<"m" | "t" | "r", [string, string][]> = {
  m: [["Work on ح / ه", "تدرّب على ح / ه"], ["Work on ع / ء", "تدرّب على ع / ء"], ["Heavy letters (ص ض ط ظ ق)", "حروف التفخيم (ص ض ط ظ ق)"], ["ث / ذ / ظ with the tongue tip", "ث / ذ / ظ بطرف اللسان"]],
  t: [["Ghunnah on نّ / مّ", "الغنة في النون والميم المشددتين"], ["Madd — hold 2/4/6 counts", "المد — 2/4/6 حركات"], ["Qalqalah (ق ط ب ج د)", "القلقلة (قطب جد)"], ["Ikhfa / Idgham", "الإخفاء / الإدغام"]],
  r: [["Recite without stopping", "اتلُ دون توقف"], ["Revise from memory daily", "راجع من الحفظ يوميًا"], ["Watch verse endings", "انتبه لنهايات الآيات"], ["Slow, steady pace", "إيقاع هادئ ثابت"]],
};

/** Three small labelled bars (1–3) for Makharij / Tajweed / Recitation. */
export function ScoreBadges({ s, compact = false }: { s?: Scores | null; compact?: boolean }) {
  const { tr } = useTr();
  if (!s) return null;
  return (
    <span className={`inline-flex flex-wrap items-center ${compact ? "gap-1.5" : "gap-2"}`} data-testid="score-badges">
      {CRITS.map((c) => {
        const v = s[c.k];
        return (
          <span key={c.k} className="inline-flex items-center gap-1 rounded-full bg-black/5 px-2 py-0.5 text-[11px] font-bold dark:bg-white/10" title={`${tr(c.en, c.ar)}: ${tr(LEVELS[v][0], LEVELS[v][1])}`} data-crit={c.k} data-level={v}>
            {compact ? tr(c.short[0], c.short[1]) : tr(c.en, c.ar)}
            <span className="inline-flex gap-0.5" aria-hidden>{[1, 2, 3].map((i) => <span key={i} className={`h-2 w-2.5 rounded-sm ${i <= v ? LEVELS[v][2] : "bg-black/15 dark:bg-white/20"}`} />)}</span>
            <span className="sr-only">{v}/3</span>
          </span>
        );
      })}
    </span>
  );
}

export function FeedbackText({ s }: { s?: Scores | null }) {
  const { lang } = useTr();
  if (!s?.fb) return null;
  return <p className="whitespace-pre-line rounded-2xl bg-black/[0.03] px-3 py-2 text-sm leading-relaxed dark:bg-white/5" dir="auto" data-testid="score-feedback">{lang === "ar" ? s.fb.ar : s.fb.en}</p>;
}

/** Rich tracker: surah/verses, date, the three criteria, overall title and feedback. */
export function TrackerEntries({ rows, surahName }: { rows: TrackerRow[]; surahName: (n: number) => string }) {
  const { tr, lang } = useTr();
  const [open, setOpen] = useState<number | null>(null);
  return (
    <ul className="space-y-2" data-testid="lms-tracker">
      {rows.map((t, i) => (
        <li key={i} className="rounded-2xl border border-black/10 bg-white/60 px-3 py-2 dark:border-white/10 dark:bg-white/5" data-testid="lms-tracker-row" data-grade={t.grade || "green"}>
          <button type="button" className="flex w-full flex-wrap items-center gap-2 text-start" onClick={() => setOpen(open === i ? null : i)} aria-expanded={open === i}>
            <b>{surahName(t.surah)} {t.from}–{t.to}</b>
            <span className="text-xs opacity-60">{t.approved ? new Date(t.approved).toLocaleDateString(lang === "ar" ? "ar" : "en-GB") : ""}</span>
            <span className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${GRADE_STYLE[t.grade || "green"]}`}>{gradeLabel(t.grade || "green", tr)}</span>
            <span className="flex-1" />
            <ScoreBadges s={t.scores} compact />
          </button>
          {open === i && <div className="mt-2"><FeedbackText s={t.scores} /></div>}
        </li>
      ))}
    </ul>
  );
}

/** Simple per-criterion progress chart over time (one line per criterion, levels 1–3). */
export function CriteriaChart({ rows }: { rows: TrackerRow[] }) {
  const { tr } = useTr();
  const pts = rows.filter((r) => r.scores && r.approved).sort((a, b) => a.approved - b.approved);
  if (pts.length < 2) return null;
  const W = 320, H = 110, P = 18;
  const x = (i: number) => P + (i * (W - 2 * P)) / (pts.length - 1);
  const y = (v: number) => H - P - ((v - 1) * (H - 2 * P)) / 2;
  const colors = { m: "#0ea5e9", t: "#a855f7", r: "#10b981" } as const;
  return (
    <figure className="rounded-2xl border border-black/10 p-3 dark:border-white/10" data-testid="criteria-chart">
      <figcaption className="mb-1 flex flex-wrap gap-3 text-xs font-bold">{tr("Progress by criterion", "التقدم حسب المعيار")}{CRITS.map((c) => <span key={c.k} className="inline-flex items-center gap-1"><span className="h-2 w-3 rounded" style={{ background: colors[c.k] }} />{tr(c.en, c.ar)}</span>)}</figcaption>
      <svg viewBox={`0 0 ${W} ${H}`} className="h-28 w-full" preserveAspectRatio="none" role="img" aria-label={tr("Criteria chart", "مخطط المعايير")}>
        {[1, 2, 3].map((v) => <g key={v}><line x1={P} x2={W - P} y1={y(v)} y2={y(v)} stroke="currentColor" opacity="0.12" /></g>)}
        {CRITS.map((c, ci) => <polyline key={c.k} fill="none" stroke={colors[c.k]} strokeWidth="2" vectorEffect="non-scaling-stroke" points={pts.map((p, i) => `${x(i)},${y(p.scores![c.k]) + (ci - 1) * 2}`).join(" ")} />)}
      </svg>
    </figure>
  );
}

/** Teacher grading: three criteria × 3 levels, optional comment/presets per criterion, live overall preview. */
export function ScoreGrader({ onSubmit, busy }: { onSubmit: (s: { m: Level; t: Level; r: Level; notes: { m?: string; t?: string; r?: string } }) => void; busy?: boolean }) {
  const { tr } = useTr();
  const [v, setV] = useState<{ m: Level | 0; t: Level | 0; r: Level | 0 }>({ m: 0, t: 0, r: 0 });
  const [notes, setNotes] = useState<{ m?: string; t?: string; r?: string }>({});
  const ready = v.m && v.t && v.r;
  const o = ready ? overallOf(v as { m: Level; t: Level; r: Level }) : "";
  return (
    <div className="w-full space-y-2 rounded-2xl border border-dashed border-black/15 p-3 dark:border-white/20" data-testid="hw-grader">
      {CRITS.map((c) => (
        <div key={c.k} className="flex flex-wrap items-center gap-2">
          <span className="w-28 text-sm font-bold">{tr(c.en, c.ar)}<span className="block text-[11px] font-normal opacity-60">{tr(c.hintEn, c.hintAr)}</span></span>
          {([1, 2, 3] as Level[]).map((l) => (
            <button key={l} type="button" aria-pressed={v[c.k] === l} onClick={() => setV({ ...v, [c.k]: l })} className={`rounded-full px-3 py-1 text-xs font-bold ring-1 ring-black/10 ${v[c.k] === l ? `${LEVELS[l][2]} text-white` : "bg-white/70 dark:bg-white/5"}`} data-testid={`grade-${c.k}-${l}`}>{l} · {tr(LEVELS[l][0], LEVELS[l][1])}</button>
          ))}
          <input className="min-w-[10rem] flex-1 rounded-full border border-black/10 bg-white/80 px-3 py-1 text-xs dark:border-white/15 dark:bg-white/5" placeholder={tr("Comment (optional)", "تعليق (اختياري)")} value={notes[c.k] || ""} onChange={(e) => setNotes({ ...notes, [c.k]: e.target.value })} data-testid={`grade-note-${c.k}`} />
          <span className="flex w-full flex-wrap gap-1 ps-28">
            {CRIT_PRESETS[c.k].map(([en, ar]) => <button key={en} type="button" className="rounded-full bg-black/5 px-2 py-0.5 text-[11px] hover:bg-sun/40 dark:bg-white/10" onClick={() => setNotes({ ...notes, [c.k]: [notes[c.k], tr(en, ar)].filter(Boolean).join("; ") })}>{tr(en, ar)}</button>)}
          </span>
        </div>
      ))}
      <div className="flex flex-wrap items-center gap-2 pt-1">
        {o ? <span className={`rounded-full px-3 py-1 text-sm font-bold ${GRADE_STYLE[o]}`} data-testid="grade-overall">{gradeLabel(o, tr)}</span> : <span className="text-xs opacity-60">{tr("Choose a level for each criterion.", "اختر مستوى لكل معيار.")}</span>}
        <span className="text-[11px] opacity-60">{tr("All 3 = Excellent · any 1 = Needs practice · otherwise Good", "الكل 3 = ممتاز · أي 1 = يحتاج تدريبًا · غير ذلك = جيد")}</span>
        <span className="flex-1" />
        <button type="button" disabled={!ready || busy} className="rounded-full bg-header px-4 py-1.5 text-sm font-bold text-white disabled:opacity-50" onClick={() => ready && onSubmit({ ...(v as { m: Level; t: Level; r: Level }), notes })} data-testid="grade-submit">{tr("Save grade", "حفظ التقييم")}</button>
      </div>
    </div>
  );
}
