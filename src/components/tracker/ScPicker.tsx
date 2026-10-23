"use client";

import { useEffect, useMemo, useState } from "react";
import type { CurUnit } from "@/lib/lmsMods";
import { loadCurUnits, useTopic } from "@/components/tracker/TopicPicker";
import { useI18n } from "@/lib/i18n";

const loadUnits = () => loadCurUnits().then((u) => u.filter((x) => x.sc?.length));

/** Assessment Tracker: tag a quiz question to one Success Criterion ("<unit id>#<index>"). */
export function ScPicker({ value, onChange }: { value?: string; onChange: (v: string | undefined) => void }) {
  const [all, setUnits] = useState<CurUnit[] | null>(null);
  const [yr, setYr] = useState("");
  const topic = useTopic();
  const { lang } = useI18n(); const ar = lang === "ar";
  useEffect(() => { loadUnits().then(setUnits); }, []);
  // With a linked topic, only that topic's Success Criteria are offered.
  const units = useMemo(() => (all && topic ? all.filter((u) => u.id === topic) : all), [all, topic]);
  const scText = (u: CurUnit, i: number) => (ar && u.scAr?.[i]?.trim() ? u.scAr[i] : u.sc?.[i] || "");
  const cur = useMemo(() => units?.find((u) => value && value.startsWith(u.id + "#")), [units, value]);
  const years = useMemo(() => [...new Set((units || []).map((u) => u.yr))].sort(), [units]);
  const y = yr || cur?.yr || "";
  const list = (units || []).filter((u) => !y || u.yr === y);
  return (
    <details className="rounded-lg border border-card-border bg-background/60 p-3" open={Boolean(value)} data-testid="q-sc">
      <summary className="cursor-pointer text-sm font-medium">✅ {ar ? "متتبع التقييم — معيار النجاح" : "Assessment Tracker — Success Criterion"}{cur ? `: ${ar && cur.titleAr ? cur.titleAr : cur.title} #${Number(value!.split("#")[1]) + 1}` : ""}{value && topic && !cur ? (ar ? " ⚠️ ليس من الموضوع المرتبط" : " ⚠️ not from the linked topic") : ""}</summary>
      {units === null ? <p className="mt-2 text-xs opacity-70">{ar ? "جارٍ تحميل المنهج…" : "Loading curriculum…"}</p> : !units.length ? <p className="mt-2 text-xs opacity-70">{topic ? (ar ? "لا توجد معايير نجاح لهذا الموضوع بعد." : "This topic has no Success Criteria yet.") : (ar ? "اختر موضوع المنهج أولًا." : "Choose the curriculum topic first.")}</p> : (
        <div className="mt-2 grid gap-2 sm:grid-cols-[10rem_1fr]">
          <select className="rounded-lg border border-card-border bg-background px-2 py-1.5 text-sm" value={y} onChange={(e) => setYr(e.target.value)} aria-label={ar ? "السنة" : "Year group"} data-testid="q-sc-year" hidden={Boolean(topic)}><option value="">{ar ? "كل السنوات" : "All years"}</option>{years.map((x) => <option key={x}>{x}</option>)}</select>
          <select className="min-w-0 rounded-lg border border-card-border bg-background px-2 py-1.5 text-sm" value={value || ""} onChange={(e) => onChange(e.target.value || undefined)} aria-label={ar ? "معيار النجاح" : "Success criterion"} data-testid="q-sc-select">
            <option value="">{ar ? "— بدون ربط —" : "— Not tagged —"}</option>
            {list.map((u) => <optgroup key={u.id} label={ar ? `${u.yr.replace(/^Year\s*/, "السنة ")} · ${u.term.replace(/^Term\s*/, "الفصل ")} · الأسبوع ${u.wkFrom} · ${u.titleAr || u.title}` : `${u.yr} · ${u.term} · Wk ${u.wkFrom} · ${u.title}`}>{(u.sc || []).map((t, i) => <option key={i} value={`${u.id}#${i}`}>{`${i + 1}. ${scText(u, i) || t}`}</option>)}</optgroup>)}
          </select>
          <p className="text-[11px] opacity-70 sm:col-span-2">{ar ? "تصبح النسبة التي يحققها الطالب في كل الأسئلة المرتبطة بالمعيار نفسه درجته من ٠ إلى ٣ في متتبع التقييم (حدود الدرجات في أنظمة التحصيل والتقدّم)." : "The % a student scores on all questions tagged to the same criterion becomes their 0–3 score in the Assessment Tracker (cut-offs set in Attainment & Progress Systems)."}</p>
        </div>
      )}
    </details>
  );
}
