"use client";

import { useEffect, useState } from "react";
import { useTr } from "@/components/lms/useLms";
import { setTrackerAdmin, trk } from "@/lib/tracker";
import { STD_DOMAINS } from "@/lib/standards";

type Y = { year: string; term: string; students: number; graded: number; thresholds: Record<string, number>; onTarget: number; close: number; below: number; up: number; same: number; down: number; avg: number | null; skills?: Record<string, { avg: number; n: number }> };
const pct = (n: number, d: number) => (d ? `${Math.round((n / d) * 100)}%` : "—");

/** Department Report primary view: Assessment Tracker attainment grades & progress (vs Target, term to term). */
export function TrackerSummary({ admin, secondary = false }: { admin: boolean; secondary?: boolean }) {
  const { tr, lang } = useTr();
  const [d, setD] = useState<{ system: string; years: Y[] } | null>(null);
  const [err, setErr] = useState("");
  useEffect(() => { setTrackerAdmin(admin); trk<{ system: string; years: Y[] }>("trk-summary", {}).then(setD).catch((e) => setErr(String((e as Error).message))); }, [admin]);
  if (err) return null;
  const keys = Array.from(new Set((d?.years || []).flatMap((y) => Object.keys(y.thresholds))));
  return (
    <section className="rounded-2xl border border-card-border bg-white/80 p-4 dark:bg-white/5" data-testid="rep-tracker">
      <h3 className="font-extrabold">📊 {tr("Attainment & progress — Assessment Tracker", "التحصيل والتقدم — متتبع التقييم")}{secondary ? ` (${tr("secondary view", "عرض ثانوي")})` : ""}</h3>
      <p className="text-xs opacity-70">{d?.system || "…"} · {tr("Progress vs Target uses the Target − 1 cap when on. Term to term compares each pupil's grade with the previous term.", "التقدم مقابل الهدف ومن فصل لآخر.")}</p>
      {d && (!d.years.length ? <p className="mt-2 text-sm opacity-70">{tr("No tracker grades yet.", "لا توجد درجات بعد.")}</p> :
        <div className="mt-2 overflow-x-auto"><table className="w-full min-w-[720px] text-sm" data-testid="rep-tracker-table"><thead><tr className="text-left text-xs opacity-70">
          <th className="px-2 py-1">{tr("Year", "السنة")}</th><th className="px-2">{tr("Term", "الفصل")}</th><th className="px-2">{tr("Graded", "مقيّم")}</th><th className="px-2">{tr("Avg grade", "متوسط")}</th>
          {keys.map((k) => <th key={k} className="px-2">{k}</th>)}<th className="px-2">{tr("At/above target", "عند الهدف")}</th><th className="px-2">{tr("1 below", "أقل بـ1")}</th><th className="px-2">{tr("Below", "أقل")}</th><th className="px-2">{tr("↑ / = / ↓ vs last term", "↑ / = / ↓")}</th></tr></thead>
          <tbody>{d.years.map((y) => <tr key={y.year + y.term} className="border-t border-black/5"><td className="px-2 py-1 font-semibold">{y.year}</td><td className="px-2">{y.term}</td><td className="px-2">{y.graded}/{y.students}</td><td className="px-2">{y.avg == null ? "—" : y.avg.toFixed(1)}</td>
            {keys.map((k) => <td key={k} className="px-2">{y.thresholds[k] ?? 0} ({pct(y.thresholds[k] ?? 0, y.graded)})</td>)}
            <td className="px-2 text-emerald-700">{y.onTarget} ({pct(y.onTarget, y.graded)})</td><td className="px-2 text-amber-700">{y.close}</td><td className="px-2 text-rose-700">{y.below}</td><td className="px-2">{y.up} / {y.same} / {y.down}</td></tr>)}</tbody></table></div>)}
      {d && d.years.some((y) => y.skills && Object.keys(y.skills).length) && <div className="mt-3 overflow-x-auto"><h4 className="text-sm font-extrabold">{tr("By main skill (UAE standards fields) — mean Success Criteria score 0–3", "حسب المهارة الرئيسية — متوسط درجة معايير النجاح 0–3")}</h4>
        <table className="mt-1 w-full min-w-[720px] text-sm" data-testid="rep-tracker-skills"><thead><tr className="text-left text-xs opacity-70"><th className="px-2 py-1">{tr("Year", "السنة")}</th><th className="px-2">{tr("Term", "الفصل")}</th>{STD_DOMAINS.map((x) => <th key={x.n} className="px-2">{x.n}. {lang === "ar" ? x.ar : x.en}</th>)}</tr></thead>
          <tbody>{d.years.filter((y) => y.skills && Object.keys(y.skills).length).map((y) => <tr key={y.year + y.term} className="border-t border-black/5"><td className="px-2 py-1 font-semibold">{y.year}</td><td className="px-2">{y.term}</td>{STD_DOMAINS.map((x) => { const v = y.skills?.[String(x.n)]; return <td key={x.n} className="px-2">{v ? `${v.avg.toFixed(2)} (${v.n})` : "—"}</td>; })}</tr>)}</tbody></table></div>}
    </section>
  );
}
