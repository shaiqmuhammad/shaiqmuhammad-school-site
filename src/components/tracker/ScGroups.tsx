"use client";

import { useEffect, useState } from "react";
import { loadCurUnits } from "@/components/tracker/TopicPicker";
import { emptyQuestion, type QuizQuestion } from "@/lib/quiz";
import type { CurUnit } from "@/lib/lmsMods";

/** t324: the Assessment Tracker covers EYFS (FS1/FS2) and Primary (Year 1-6) only. */
export const TRK_YEARS = ["FS1", "FS2", "Year 1", "Year 2", "Year 3", "Year 4", "Year 5", "Year 6"];
export const SC_MAX = 3;

/** Problems that block saving: more than 3 questions on one Success Criterion. */
export function scProblems(qs: QuizQuestion[], lang: "en" | "ar" = "en"): string {
  const n = new Map<string, number>(); for (const q of qs) if (q.sc) n.set(q.sc, (n.get(q.sc) || 0) + 1);
  const over = [...n.entries()].filter(([, c]) => c > SC_MAX);
  if (!over.length) return "";
  return lang === "ar" ? `لكل معيار نجاح ${SC_MAX} أسئلة كحد أقصى (${over.map(([k, c]) => `#${Number(k.split("#")[1]) + 1}: ${c}`).join("، ")}).` : `Each Success Criterion can have at most ${SC_MAX} questions (${over.map(([k, c]) => `SC ${Number(k.split("#")[1]) + 1}: ${c}`).join(", ")}).`;
}
/** Every SC-tagged question is worth exactly 1 point (3 questions = 3 points = the SC's 0-3 score). */
export const oneMarkSc = (qs: QuizQuestion[]) => qs.map((q) => (q.sc ? { ...q, points: 1 } : q));

/** Success Criteria of the linked topic, with up to 3 one-point questions each. */
export function ScGroups({ topic, questions, onAdd, lang = "en" }: { topic?: string; questions: QuizQuestion[]; onAdd: (q: QuizQuestion) => void; lang?: "en" | "ar" }) {
  const ar = lang === "ar";
  const [units, setUnits] = useState<CurUnit[] | null>(null);
  useEffect(() => { loadCurUnits().then(setUnits); }, []);
  const u = units?.find((x) => x.id === topic);
  if (!topic || !u) return null;
  const tracked = TRK_YEARS.includes(u.yr);
  const sc = u.sc || [];
  return (
    <section className="rounded-2xl border-2 border-emerald-300 bg-emerald-50 p-4 text-slate-900" data-testid="sc-groups" data-tracked={tracked ? "1" : "0"}>
      <p className="font-extrabold">✅ {ar ? "معايير النجاح لهذا الموضوع (من المنهج)" : "Success Criteria for this topic (from the Curriculum)"}</p>
      {!tracked ? <p className="mt-1 text-xs" data-testid="sc-groups-off">{ar ? "متتبع التقييم لمرحلة التأسيس والابتدائي فقط (FS1–السنة ٦)." : "The Assessment Tracker covers EYFS and Primary only (FS1 – Year 6). This assessment is practice and never fills the tracker."}</p>
        : <p className="mt-1 text-xs">{ar ? "حتى ٣ أسئلة لكل معيار، كل سؤال بدرجة واحدة. مجموع الدرجات (٠–٣) يُكتب في المتتبع." : "Up to 3 questions per Success Criterion, 1 point each. The points a student earns on them (0–3) become that SC's score in the Assessment Tracker."}</p>}
      {!sc.length ? <p className="mt-2 text-sm">{ar ? "لا توجد معايير نجاح لهذا الموضوع في المنهج." : "This topic has no Success Criteria in the Curriculum yet."}</p> : (
        <ol className="mt-2 space-y-1.5">
          {sc.map((t, i) => {
            const tag = `${u.id}#${i}`; const n = questions.filter((q) => q.sc === tag).length;
            const label = ar && u.scAr?.[i]?.trim() ? u.scAr[i] : t;
            return (
              <li key={i} className="flex flex-wrap items-center gap-2 rounded-xl bg-white px-3 py-2 text-sm" data-testid="sc-group" data-n={n}>
                <b className="shrink-0">SC {i + 1}</b><span className="min-w-0 flex-1" dir="auto">{label}</span>
                <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${n > SC_MAX ? "bg-red-100 text-red-800" : n === SC_MAX ? "bg-emerald-200 text-emerald-900" : "bg-amber-100 text-amber-900"}`} data-testid="sc-group-count">{n}/{SC_MAX}</span>
                <button type="button" disabled={n >= SC_MAX} className="rounded-full bg-emerald-600 px-3 py-1 text-xs font-bold text-white disabled:opacity-40" onClick={() => onAdd({ ...emptyQuestion("multiple_choice"), sc: tag, points: 1 })} data-testid="sc-group-add">＋ {ar ? "سؤال (١ درجة)" : "Question (1 pt)"}</button>
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}
