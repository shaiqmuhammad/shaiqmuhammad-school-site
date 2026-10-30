"use client";

import { useEffect, useMemo, useState } from "react";
import { lmsApi } from "@/lib/lms";
import { modCall, type CurUnit } from "@/lib/lmsMods";
import type { Quiz } from "@/lib/quiz";

/** t329: what an assessment can be filtered by — class/year, section, subject, topic. */
export type Facet = { id: string; years: string[]; sections: string[]; subjects: string[]; topics: string[] };
type F = { yr: string; section: string; subject: string; topic: string };
const EMPTY: F = { yr: "", section: "", subject: "", topic: "" };
const normYr = (y: string | number | undefined) => { const s = String(y ?? "").trim(); if (!s) return ""; return /^\d+$/.test(s) ? `Year ${s}` : s.replace(/^Y(\d)/, "Year $1"); };

/** Facets from the quiz itself, curriculum units linked to it, and its assignments (sections). */
export function useFacets(ids: string[], quizzes: Quiz[], asAdmin: boolean): Map<string, Facet> {
  const [units, setUnits] = useState<CurUnit[]>([]);
  const [asg, setAsg] = useState<{ quiz: string; cls: string; section: string }[]>([]);
  useEffect(() => {
    modCall<{ items: CurUnit[] }>("cur-list", {}, asAdmin).then((r) => setUnits(r.items || [])).catch(() => undefined);
    lmsApi.assessList(asAdmin).then((r) => setAsg(r.items)).catch(() => undefined);
  }, [asAdmin]);
  const key = ids.join("|");
  return useMemo(() => {
    const m = new Map<string, Facet>();
    for (const id of key ? key.split("|") : []) {
      const q = quizzes.find((x) => x.slug === id || x.id === id);
      const us = units.filter((u) => u.id === q?.topic || (u.links || []).some((l) => l.t === "quiz" && l.id === id));
      const as = asg.filter((a) => a.quiz === id);
      const uniq = (xs: string[]) => [...new Set(xs.filter(Boolean))];
      m.set(id, {
        id,
        years: uniq([normYr(q?.year), normYr(q?.topicInfo?.yr), ...us.map((u) => normYr(u.yr)), ...as.map((a) => normYr(a.cls))]),
        sections: uniq(as.map((a) => a.section)),
        subjects: uniq([q?.subject || "", ...us.map((u) => u.subject)]),
        topics: uniq([q?.topicInfo?.title || "", ...us.map((u) => u.title)]),
      });
    }
    return m;
  }, [key, quizzes, units, asg]);
}

export function useAssessFilter(facets: Map<string, Facet>, tr: (en: string, ar: string) => string) {
  const [f, setF] = useState<F>(EMPTY);
  const all = [...facets.values()];
  const opts = (k: keyof Omit<Facet, "id">) => [...new Set(all.flatMap((x) => x[k]))].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  const pass = (id: string) => {
    const x = facets.get(id);
    if (!x) return !f.yr && !f.section && !f.subject && !f.topic;
    return (!f.yr || x.years.includes(f.yr)) && (!f.section || x.sections.includes(f.section)) && (!f.subject || x.subjects.includes(f.subject)) && (!f.topic || x.topics.includes(f.topic));
  };
  const sel = (k: keyof F, fk: keyof Omit<Facet, "id">, label: string) => (
    <label className="flex min-w-[9rem] flex-1 flex-col text-xs font-bold">
      {label}
      <select className="mt-1 rounded-xl border border-black/10 bg-white px-2 py-1.5 text-sm font-normal text-slate-900" value={f[k]} onChange={(e) => setF({ ...f, [k]: e.target.value })} data-testid={`af-${k}`}>
        <option value="">{tr("All", "الكل")}</option>
        {opts(fk).map((o) => <option key={o} value={o}>{o}</option>)}
      </select>
    </label>
  );
  const active = !!(f.yr || f.section || f.subject || f.topic);
  const ui = (
    <div className="mb-4 flex flex-wrap items-end gap-2 rounded-2xl bg-black/[0.04] p-3 dark:bg-white/5" data-testid="assess-filter">
      {sel("yr", "years", tr("Class / year", "الصف / السنة"))}
      {sel("section", "sections", tr("Section", "الشعبة"))}
      {sel("subject", "subjects", tr("Subject", "المادة"))}
      {sel("topic", "topics", tr("Topic", "الموضوع"))}
      {active && <button type="button" className="rounded-full px-3 py-1.5 text-xs font-bold underline" onClick={() => setF(EMPTY)} data-testid="af-clear">{tr("Clear", "مسح")}</button>}
    </div>
  );
  return { ui, pass, active };
}
