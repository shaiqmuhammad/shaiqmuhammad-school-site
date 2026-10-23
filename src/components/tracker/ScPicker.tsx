"use client";

import { useEffect, useMemo, useState } from "react";
import { modCall, type CurUnit } from "@/lib/lmsMods";

/** Curriculum units with Success Criteria, loaded once per page (admin token in the admin area, LMS token elsewhere). */
let cache: Promise<CurUnit[]> | null = null;
const loadUnits = () => (cache ??= modCall<{ items: CurUnit[] }>("cur-list", {}, typeof location !== "undefined" && !location.pathname.startsWith("/lms")).then((r) => (r.items || []).filter((u) => u.sc?.length)).catch(() => { cache = null; return []; }));

/** Assessment Tracker: tag a quiz question to one Success Criterion ("<unit id>#<index>"). */
export function ScPicker({ value, onChange }: { value?: string; onChange: (v: string | undefined) => void }) {
  const [units, setUnits] = useState<CurUnit[] | null>(null);
  const [yr, setYr] = useState("");
  useEffect(() => { loadUnits().then(setUnits); }, []);
  const cur = useMemo(() => units?.find((u) => value && value.startsWith(u.id + "#")), [units, value]);
  const years = useMemo(() => [...new Set((units || []).map((u) => u.yr))].sort(), [units]);
  const y = yr || cur?.yr || "";
  const list = (units || []).filter((u) => !y || u.yr === y);
  return (
    <details className="rounded-lg border border-card-border bg-background/60 p-3" open={Boolean(value)} data-testid="q-sc">
      <summary className="cursor-pointer text-sm font-medium">✅ Assessment Tracker — Success Criterion (optional){cur ? `: ${cur.title} #${Number(value!.split("#")[1]) + 1}` : ""}</summary>
      {units === null ? <p className="mt-2 text-xs opacity-70">Loading curriculum…</p> : !units.length ? <p className="mt-2 text-xs opacity-70">No curriculum Success Criteria available.</p> : (
        <div className="mt-2 grid gap-2 sm:grid-cols-[10rem_1fr]">
          <select className="rounded-lg border border-card-border bg-background px-2 py-1.5 text-sm" value={y} onChange={(e) => setYr(e.target.value)} aria-label="Year group" data-testid="q-sc-year"><option value="">All years</option>{years.map((x) => <option key={x}>{x}</option>)}</select>
          <select className="min-w-0 rounded-lg border border-card-border bg-background px-2 py-1.5 text-sm" value={value || ""} onChange={(e) => onChange(e.target.value || undefined)} aria-label="Success criterion" data-testid="q-sc-select">
            <option value="">— Not tagged —</option>
            {list.map((u) => <optgroup key={u.id} label={`${u.yr} · ${u.term} · Wk ${u.wkFrom} · ${u.title}`}>{(u.sc || []).map((t, i) => <option key={i} value={`${u.id}#${i}`}>{`${i + 1}. ${t}`}</option>)}</optgroup>)}
          </select>
          <p className="text-[11px] opacity-70 sm:col-span-2">The % a student scores on all questions tagged to the same criterion becomes their 0–3 score in the Assessment Tracker (cut-offs set in Attainment &amp; Progress Systems).</p>
        </div>
      )}
    </details>
  );
}
