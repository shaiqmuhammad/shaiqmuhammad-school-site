"use client";

import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { modCall, type CurUnit } from "@/lib/lmsMods";
import { topicLabel, type TopicInfo } from "@/lib/quiz";

/** All curriculum units, loaded once per page (admin token in the admin area, LMS token elsewhere). */
let cache: Promise<CurUnit[]> | null = null;
export const loadCurUnits = (): Promise<CurUnit[]> =>
  (cache ??= modCall<{ items: CurUnit[] }>("cur-list", {}, typeof location !== "undefined" && !location.pathname.startsWith("/lms"))
    .then((r) => r.items || [])
    .catch(() => { cache = null; return []; }));
export const reloadCurUnits = () => { cache = null; return loadCurUnits(); };

/** The assessment's linked topic, read by the Success Criterion picker so it only offers that topic's SCs. */
export const TopicContext = createContext<string | undefined>(undefined);
export const useTopic = () => useContext(TopicContext);

export const topicInfoOf = (u: CurUnit): TopicInfo => ({ yr: u.yr, term: u.term, wk: u.wkFrom || 0, title: u.title, ...(u.titleAr ? { titleAr: u.titleAr } : {}) });

const sel = "min-w-0 rounded-lg border border-card-border bg-background px-2 py-1.5 text-sm";

/** Year › Term › Week › Topic. Required for every assessment. */
export function TopicPicker({ value, onChange, lang = "en", taken }: { value?: string; onChange: (id: string, info: TopicInfo | undefined) => void; lang?: "en" | "ar"; taken?: (unitId: string) => string | undefined }) {
  const ar = lang === "ar";
  const [units, setUnits] = useState<CurUnit[] | null>(null);
  const [yr, setYr] = useState(""); const [term, setTerm] = useState(""); const [wk, setWk] = useState("");
  useEffect(() => { loadCurUnits().then(setUnits); }, []);
  const cur = useMemo(() => units?.find((u) => u.id === value), [units, value]);
  useEffect(() => { if (cur) { setYr(cur.yr); setTerm(cur.term); setWk(String(cur.wkFrom || 0)); } }, [cur]);
  const years = useMemo(() => [...new Set((units || []).map((u) => u.yr))].sort((a, b) => a.localeCompare(b, undefined, { numeric: true })), [units]);
  const terms = useMemo(() => [...new Set((units || []).filter((u) => u.yr === yr).map((u) => u.term))].sort(), [units, yr]);
  const weeks = useMemo(() => [...new Set((units || []).filter((u) => u.yr === yr && u.term === term).map((u) => u.wkFrom || 0))].sort((a, b) => a - b), [units, yr, term]);
  const topics = (units || []).filter((u) => u.yr === yr && u.term === term && String(u.wkFrom || 0) === wk);
  const yl = (y: string) => (ar ? y.replace(/^Year\s*(\d+)$/i, "السنة $1") : y), tl = (t: string) => (ar ? t.replace(/^Term\s*(\d+)$/i, "الفصل $1") : t);
  const name = (u: CurUnit) => (ar && u.titleAr ? u.titleAr : u.title);
  return (
    <div className="rounded-xl border-2 border-sun-border/60 bg-background/60 p-3" data-testid="topic-picker">
      <p className="text-sm font-semibold">{ar ? "موضوع المنهج (مطلوب)" : "Curriculum topic (required)"} <span className="text-red-600">*</span></p>
      {units === null ? <p className="mt-2 text-xs opacity-70">{ar ? "جارٍ تحميل المنهج…" : "Loading curriculum…"}</p> : (
        <div className="mt-2 grid gap-2 sm:grid-cols-4">
          <select className={sel} value={yr} onChange={(e) => { setYr(e.target.value); setTerm(""); setWk(""); onChange("", undefined); }} aria-label={ar ? "السنة" : "Year"} data-testid="topic-year"><option value="">{ar ? "السنة…" : "Year…"}</option>{years.map((y) => <option key={y} value={y}>{yl(y)}</option>)}</select>
          <select className={sel} value={term} disabled={!yr} onChange={(e) => { setTerm(e.target.value); setWk(""); onChange("", undefined); }} aria-label={ar ? "الفصل" : "Term"} data-testid="topic-term"><option value="">{ar ? "الفصل…" : "Term…"}</option>{terms.map((t) => <option key={t} value={t}>{tl(t)}</option>)}</select>
          <select className={sel} value={wk} disabled={!term} onChange={(e) => { setWk(e.target.value); onChange("", undefined); }} aria-label={ar ? "الأسبوع" : "Week"} data-testid="topic-week"><option value="">{ar ? "الأسبوع…" : "Week…"}</option>{weeks.map((w) => <option key={w} value={String(w)}>{(ar ? "الأسبوع " : "Week ") + w}</option>)}</select>
          <select className={sel} value={value || ""} disabled={!wk} onChange={(e) => { const u = topics.find((x) => x.id === e.target.value); onChange(u?.id || "", u ? topicInfoOf(u) : undefined); }} aria-label={ar ? "الموضوع" : "Topic"} data-testid="topic-unit">
            <option value="">{ar ? "الموضوع…" : "Topic…"}</option>
            {topics.map((u) => { const t = taken?.(u.id); return <option key={u.id} value={u.id} disabled={Boolean(t)}>{name(u)}{t ? (ar ? ` (مرتبط بالفعل: ${t})` : ` (already linked: ${t})`) : ""}</option>; })}
          </select>
        </div>
      )}
      {cur ? <p className="mt-2 text-xs" data-testid="topic-label">🔗 {topicLabel(topicInfoOf(cur), lang)}</p> : <p className="mt-2 text-xs text-red-700">{ar ? "اختر موضوعًا من المنهج قبل الحفظ." : "Choose a curriculum topic before saving."}</p>}
    </div>
  );
}
