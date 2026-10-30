"use client";
import { eff, fmt, rate, RATING_COLOR, type QaBody, type QaReportData } from "@/lib/qa";
import { useTr } from "@/components/lms/useLms";

/** t338: on-screen charts only (downloads stay exactly like the school sample). */
export function KhdaBadge({ r }: { r: string }) {
  if (!r) return <span className="text-slate-400">—</span>;
  return <span className="inline-block rounded-full px-2.5 py-0.5 text-xs font-extrabold text-white shadow-sm" style={{ background: RATING_COLOR[r] || "#64748b" }} data-testid="qa-badge">{r}</span>;
}
const Bar = ({ v, color, label }: { v: number | null; color: string; label: string }) => (
  <div className="flex items-center gap-2 text-xs"><span className="w-10 shrink-0 font-bold text-slate-600">{label}</span>
    <div className="relative h-4 flex-1 overflow-hidden rounded-full bg-slate-100">
      <div className="h-full rounded-full transition-all" style={{ width: `${Math.max(0, Math.min(100, v ?? 0))}%`, background: color }} />
      {[50, 75].map((t) => <span key={t} className="absolute top-0 h-full w-px bg-slate-500/50" style={{ left: `${t}%` }} aria-hidden />)}
    </div><span className="w-12 shrink-0 text-right font-mono font-bold">{v == null ? "—" : `${Math.round(v)}%`}</span></div>);
const Stack = ({ parts, total }: { parts: [number, string, string][]; total: number }) => (
  <div className="flex h-5 w-full overflow-hidden rounded-full bg-slate-100" role="img" aria-label={parts.map(([n, , l]) => `${l} ${n}`).join(", ")}>
    {total > 0 && parts.map(([n, c, l]) => n > 0 && <div key={l} className="grid place-items-center text-[10px] font-extrabold text-white" style={{ width: `${(n / total) * 100}%`, background: c }} title={`${l}: ${n}`}>{n}</div>)}
  </div>);

export function QaCharts({ d, rep }: { d: QaBody; rep: QaReportData }) {
  const { tr } = useTr();
  if (!d.rows.length) return null;
  const th = d.thresholds;
  const multi = new Set(d.rows.map((r) => r.subject)).size > 1;
  const lab = (r: QaBody["rows"][number]) => (multi ? `${r.subject} · ${r.label}` : d.filters.year ? r.label : /^\d+$/.test(r.label) ? `Year ${r.label}` : r.label);
  return (
    <div className="grid gap-3 lg:grid-cols-2" data-testid="qa-charts">
      <div className="rounded-2xl bg-gradient-to-br from-sky-50 to-indigo-50 p-3 ring-1 ring-sky-100" data-testid="qa-chart-compare">
        <p className="mb-2 text-sm font-extrabold text-indigo-900">📊 {d.filters.year ? tr("Class comparison", "مقارنة الشعب") : tr("Year group comparison", "مقارنة السنوات")} — % {th[0]} / % {th[1]}</p>
        <div className="space-y-3">{d.rows.map((r) => { const e = eff(r, th, rep.ovr[r.key]); const rt = rate(e.a, e.b, d.khda.att); return (
          <div key={r.key} className="space-y-1"><div className="flex items-center justify-between gap-2 text-sm font-bold"><span>{lab(r)}</span><KhdaBadge r={rt} /></div>
            <Bar v={e.a} color="#0ea5e9" label={th[0]} /><Bar v={e.b} color="#6366f1" label={th[1]} /></div>); })}</div>
        <p className="mt-2 text-[10px] text-slate-500">{tr("Lines at 50% and 75% = the KHDA threshold steps.", "الخطوط عند 50% و75% = حدود KHDA.")}</p>
      </div>
      <div className="rounded-2xl bg-gradient-to-br from-emerald-50 to-amber-50 p-3 ring-1 ring-emerald-100" data-testid="qa-chart-bands">
        <p className="mb-2 text-sm font-extrabold text-emerald-900">🎯 {tr("Attainment bands", "نطاقات التحصيل")}</p>
        <div className="space-y-2">{d.rows.map((r) => { const n4 = r.n[th[0]] ?? 0, n5 = r.n[th[1]] ?? 0; return <div key={r.key} className="text-xs"><span className="font-bold">{lab(r)}</span><Stack total={r.graded} parts={[[r.graded - n4, "#f43f5e", `Below ${th[0]}`], [n4 - n5, "#f59e0b", `${th[0]} (expected)`], [n5, "#10b981", `${th[1]} (above)`]]} /></div>; })}</div>
        <div className="mt-1 flex flex-wrap gap-3 text-[10px] font-bold"><span className="text-rose-500">■ {tr(`Below ${th[0]}`, `أقل من ${th[0]}`)}</span><span className="text-amber-500">■ {th[0]} {tr("expected", "المتوقع")}</span><span className="text-emerald-500">■ {th[1]} {tr("above", "فوق")}</span></div>
        <p className="mb-2 mt-3 text-sm font-extrabold text-emerald-900">📈 {tr("Progress bands (vs target)", "نطاقات التقدم (مقابل الهدف)")}</p>
        <div className="space-y-2">{d.rows.map((r) => <div key={r.key} className="text-xs"><div className="flex items-center justify-between"><span className="font-bold">{lab(r)}</span><KhdaBadge r={r.progRating} /></div><Stack total={r.withTarget} parts={[[r.withTarget - r.onTarget, "#f43f5e", "Below target"], [r.onTarget - r.above, "#38bdf8", "At target"], [r.above, "#8b5cf6", "Above target"]]} /></div>)}</div>
        <div className="mt-1 flex flex-wrap gap-3 text-[10px] font-bold"><span className="text-rose-500">■ {tr("Below target", "أقل من الهدف")}</span><span className="text-sky-500">■ {tr("At target", "عند الهدف")}</span><span className="text-violet-500">■ {tr("Above target", "فوق الهدف")}</span>{d.total && <span className="ms-auto text-slate-600">{tr("All", "الكل")}: {fmt(d.total.pExp)}% <KhdaBadge r={d.total.progRating} /></span>}</div>
      </div>
    </div>
  );
}
