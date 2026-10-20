"use client";

/** Small hand-made SVG/HTML charts for the Department Report (no chart library; print- and RTL-friendly). */
export const C = { above: "#15803d", at: "#e0a82e", below: "#dc2626", none: "#94a3b8", navy: "#1b3a57", better: "#0e7490", expected: "#15803d", green: "#16a34a", yellow: "#eab308", red: "#dc2626" };
const LINE = ["#1b3a57", "#0e7490", "#c2410c", "#7c3aed", "#15803d", "#db2777", "#ca8a04", "#475569"];

export type Seg = { k: string; label: string; v: number; color: string };
/** Horizontal 100% stacked bars, one row per label; click a segment (or the label) to drill down. */
export function StackedBars({ rows, onPick, testid }: { rows: { label: string; segs: Seg[]; note?: string }[]; onPick?: (label: string, seg?: string) => void; testid?: string }) {
  const keys = rows[0]?.segs || [];
  return (
    <div data-testid={testid}>
      <div className="mb-2 flex flex-wrap gap-x-4 gap-y-1 text-xs">{keys.map((s) => <span key={s.k} className="inline-flex items-center gap-1"><i className="inline-block h-3 w-3 rounded-sm" style={{ background: s.color }} />{s.label}</span>)}</div>
      <div className="space-y-2">
        {rows.map((r) => {
          const tot = r.segs.reduce((t, s) => t + s.v, 0);
          return (
            <div key={r.label} className="grid grid-cols-[5.5rem_1fr] items-center gap-2 text-sm sm:grid-cols-[7rem_1fr]">
              <button type="button" className="truncate text-start font-semibold hover:underline" onClick={() => onPick?.(r.label)} title={r.label}>{r.label}</button>
              <div className="flex h-7 w-full overflow-hidden rounded-lg bg-black/5 dark:bg-white/10" role="img" aria-label={`${r.label}: ${r.segs.map((s) => `${s.label} ${s.v}`).join(", ")}`}>
                {tot === 0 ? <span className="px-2 text-xs leading-7 opacity-70">no data yet</span> : r.segs.filter((s) => s.v > 0).map((s) => (
                  <button key={s.k} type="button" data-seg={s.k} onClick={() => onPick?.(r.label, s.k)} className="h-full text-[11px] font-bold text-white print:text-black" style={{ width: `${(100 * s.v) / tot}%`, background: s.color, printColorAdjust: "exact", WebkitPrintColorAdjust: "exact" }} title={`${s.label}: ${s.v} (${Math.round((100 * s.v) / tot)}%)`}>
                    {(100 * s.v) / tot >= 9 ? s.v : ""}
                  </button>
                ))}
              </div>
              {r.note && <span className="col-start-2 -mt-1 text-[11px] opacity-70">{r.note}</span>}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/** Simple vertical bar chart (e.g. distribution of improvement). */
export function Bars({ data, color = C.navy, testid }: { data: { label: string; v: number }[]; color?: string; testid?: string }) {
  const max = Math.max(1, ...data.map((d) => d.v));
  return (
    <div className="flex h-40 items-end gap-1.5" data-testid={testid}>
      {data.map((d) => (
        <div key={d.label} className="flex min-w-0 flex-1 flex-col items-center gap-1">
          <span className="text-xs font-bold">{d.v}</span>
          <div className="w-full rounded-t-md" style={{ height: `${(100 * d.v) / max}px`, minHeight: d.v ? 4 : 1, background: d.v ? color : "#cbd5e1", printColorAdjust: "exact", WebkitPrintColorAdjust: "exact" }} />
          <span className="w-full truncate text-center text-[10px] opacity-80" dir="ltr">{d.label}</span>
        </div>
      ))}
    </div>
  );
}

/** Multi-series line chart (x = ordered labels, y = 0–100). */
export function LineChart({ xs, series, testid }: { xs: string[]; series: { name: string; pts: (number | null)[] }[]; testid?: string }) {
  const W = 600, H = 220, L = 34, R = 10, T = 10, B = 28;
  const x = (i: number) => L + (xs.length <= 1 ? (W - L - R) / 2 : (i * (W - L - R)) / (xs.length - 1));
  const y = (v: number) => T + ((100 - v) * (H - T - B)) / 100;
  return (
    <div data-testid={testid} dir="ltr">
      <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" aria-label="Average score over time">
        {[0, 25, 50, 75, 100].map((g) => <g key={g}><line x1={L} x2={W - R} y1={y(g)} y2={y(g)} stroke="currentColor" strokeOpacity={0.12} /><text x={L - 6} y={y(g) + 4} fontSize={11} textAnchor="end" fill="currentColor" opacity={0.7}>{g}</text></g>)}
        {xs.map((l, i) => <text key={l} x={x(i)} y={H - 8} fontSize={11} textAnchor="middle" fill="currentColor" opacity={0.75}>{l}</text>)}
        {series.map((s, si) => {
          const col = LINE[si % LINE.length];
          const pts = s.pts.map((v, i) => (v == null ? null : [x(i), y(v)] as const)).filter(Boolean) as (readonly [number, number])[];
          return <g key={s.name}><polyline fill="none" stroke={col} strokeWidth={2.5} points={pts.map((p) => p.join(",")).join(" ")} />{pts.map((p, i) => <circle key={i} cx={p[0]} cy={p[1]} r={3.5} fill={col} />)}</g>;
        })}
      </svg>
      <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs">{series.map((s, i) => <span key={s.name} className="inline-flex items-center gap-1"><i className="inline-block h-1 w-4 rounded" style={{ background: LINE[i % LINE.length] }} />{s.name}</span>)}</div>
    </div>
  );
}

/** Donut with a centre label. */
export function Donut({ segs, center, onPick, testid }: { segs: Seg[]; center: string; onPick?: (k: string) => void; testid?: string }) {
  const tot = segs.reduce((t, s) => t + s.v, 0);
  const r = 40, c = 2 * Math.PI * r;
  let off = 0;
  return (
    <div className="flex flex-wrap items-center gap-4" data-testid={testid}>
      <svg viewBox="0 0 100 100" className="h-36 w-36 shrink-0 -rotate-90" role="img" aria-label={segs.map((s) => `${s.label} ${s.v}`).join(", ")}>
        <circle cx={50} cy={50} r={r} fill="none" stroke="currentColor" strokeOpacity={0.1} strokeWidth={16} />
        {tot > 0 && segs.map((s) => { const len = (c * s.v) / tot; const el = <circle key={s.k} cx={50} cy={50} r={r} fill="none" stroke={s.color} strokeWidth={16} strokeDasharray={`${len} ${c - len}`} strokeDashoffset={-off} className="cursor-pointer" onClick={() => onPick?.(s.k)} />; off += len; return el; })}
        <text x={50} y={54} textAnchor="middle" fontSize={14} fontWeight={800} fill="currentColor" transform="rotate(90 50 50)">{center}</text>
      </svg>
      <ul className="space-y-1 text-sm">{segs.map((s) => <li key={s.k} className="flex items-center gap-2"><i className="inline-block h-3 w-3 rounded-sm" style={{ background: s.color }} />{s.label}: <b>{s.v}</b>{tot ? ` (${Math.round((100 * s.v) / tot)}%)` : ""}</li>)}</ul>
    </div>
  );
}

export function ProgressBar({ label, parts, total, testid }: { label: string; parts: { v: number; color: string; name: string }[]; total: number; testid?: string }) {
  return (
    <div data-testid={testid}>
      <div className="flex justify-between text-sm"><b>{label}</b><span className="opacity-80">{total ? parts.map((p) => `${p.name} ${p.v}/${total}`).join(" · ") : "no units yet"}</span></div>
      <div className="relative mt-1 h-3 overflow-hidden rounded-full bg-black/10 dark:bg-white/10">
        {total > 0 && parts.map((p, i) => <div key={i} className="absolute inset-y-0 start-0 rounded-full" style={{ width: `${(100 * p.v) / total}%`, background: p.color, opacity: i ? 0.95 : 0.45, printColorAdjust: "exact", WebkitPrintColorAdjust: "exact" }} />)}
      </div>
    </div>
  );
}
