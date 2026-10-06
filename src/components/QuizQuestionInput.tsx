"use client";

import { OPTION_ACCENTS } from "@/components/assessment/AssessmentShell";
import { useAssessmentText } from "@/lib/assessmentI18n";
import { optionLetter, splitBlanks, wordBank, type QuizQuestion } from "@/lib/quiz";

type Props = {
  /** Question to render (already localized for display). */
  q: QuizQuestion;
  value: unknown;
  onChange: (value: unknown) => void;
  /** Display order of the right-hand matching items (shuffled when the attempt starts) */
  rightOrder?: number[];
};

function Check({ on }: { on: boolean }) {
  return on ? (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" className="h-5 w-5 shrink-0 text-teal-700 dark:text-teal-300" aria-hidden>
      <path d="M5 12.5l4.5 4.5L19 7.5" />
    </svg>
  ) : null;
}

/** Large, touch-friendly answer controls for every question type. */
export function QuizQuestionInput({ q, value, onChange, rightOrder }: Props) {
  const { a, lang } = useAssessmentText();

  if (q.type === "multiple_choice" || q.type === "true_false" || q.type === "multi_select") {
    const multi = q.type === "multi_select";
    const cur = multi ? (Array.isArray(value) ? (value as number[]) : []) : [];
    return (
      <div className="space-y-3" role={multi ? "group" : "radiogroup"}>
        {multi && <p className="text-base font-semibold text-teal-700 dark:text-teal-300">{a("selectAll")}</p>}
        <div className={`grid gap-3 ${q.options.length > 2 && q.options.every((o) => o.length < 40) ? "sm:grid-cols-2" : ""}`}>
          {q.options.map((opt, idx) => {
            const accent = OPTION_ACCENTS[idx % OPTION_ACCENTS.length];
            const selected = multi ? cur.includes(idx) : value === idx;
            return (
              <button
                key={idx}
                type="button"
                role={multi ? "checkbox" : "radio"}
                aria-checked={selected}
                onClick={() => (multi ? onChange(selected ? cur.filter((n) => n !== idx) : [...cur, idx]) : onChange(idx))}
                className={`flex w-full items-center gap-4 rounded-2xl border-2 px-4 py-4 text-start text-lg font-medium transition sm:text-xl ${
                  selected ? `ring-4 ${accent.ring}` : `${accent.card} hover:-translate-y-0.5 hover:shadow-md`
                }`}
              >
                <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-base font-bold ${accent.badge}`}>
                  {multi ? (selected ? "✓" : optionLetter(idx)) : optionLetter(idx)}
                </span>
                <span dir="auto" className="flex-1 whitespace-pre-wrap text-start">{opt}</span>
                <Check on={selected} />
              </button>
            );
          })}
        </div>
      </div>
    );
  }

  if (q.type === "image_choice") {
    return (
      <div className="space-y-3">
        <p className="text-base text-slate-600 dark:text-emerald-100/70">{a("tapPicture")}</p>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
          {q.options.map((src, idx) => {
            const accent = OPTION_ACCENTS[idx % OPTION_ACCENTS.length];
            const selected = value === idx;
            return (
              <button
                key={idx}
                type="button"
                onClick={() => onChange(idx)}
                aria-pressed={selected}
                className={`overflow-hidden rounded-2xl border-2 bg-white text-start transition dark:bg-black/20 ${
                  selected ? `ring-4 ${accent.ring}` : `${accent.card} hover:-translate-y-0.5 hover:shadow-md`
                }`}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={src} alt={a("picture", { l: optionLetter(idx) })} className="aspect-square w-full bg-white object-contain p-3" />
                <span className="flex items-center gap-2 border-t border-black/5 px-3 py-2 text-base font-semibold">
                  <span className={`flex h-7 w-7 items-center justify-center rounded-lg text-sm ${accent.badge}`}>{optionLetter(idx)}</span>
                  {a("picture", { l: optionLetter(idx) })}
                  <Check on={selected} />
                </span>
              </button>
            );
          })}
        </div>
      </div>
    );
  }

  if (q.type === "fill_blank") {
    // Choose the word: every blank is a drop-down of the same word bank (no typing).
    const parts = splitBlanks(q.prompt);
    const cur = Array.isArray(value) ? (value as string[]) : [];
    const words = wordBank(q);
    return (
      <div className="space-y-4">
        <p className="text-base text-slate-600 dark:text-emerald-100/70">
          {lang === "ar" ? "اختر الكلمة الصحيحة لكل فراغ من بنك الكلمات." : "Choose the right word for each gap from the word bank."}
        </p>
        <div className="flex flex-wrap gap-2" aria-hidden>
          {words.map((w) => (
            <span key={w} dir="auto" className={`rounded-full border-2 px-3 py-1 text-base font-semibold ${cur.includes(w) ? "border-teal-500 bg-teal-100 text-teal-900 dark:bg-teal-900/50 dark:text-teal-100" : "border-emerald-900/15 bg-white dark:border-emerald-100/15 dark:bg-black/30"}`}>
              {w}
            </span>
          ))}
        </div>
        <p dir="auto" className="text-2xl font-semibold leading-[3.5rem] sm:text-3xl sm:leading-[4rem]">
          {parts.map((part, i) => (
            <span key={i}>
              <span className="whitespace-pre-wrap">{part}</span>
              {i < parts.length - 1 && (
                <select
                  aria-label={a("blank", { n: i + 1 })}
                  data-testid={`blank-${i}`}
                  className="mx-1 inline-block max-w-[16rem] rounded-xl border-2 border-dashed border-teal-500 bg-teal-50 px-2 py-1 text-xl font-semibold outline-none focus:border-solid focus:ring-4 focus:ring-teal-200 dark:bg-teal-950/40 dark:focus:ring-teal-900 sm:text-2xl"
                  value={cur[i] ?? ""}
                  onChange={(e) => {
                    const next = Array.from({ length: parts.length - 1 }, (_, j) => cur[j] ?? "");
                    next[i] = e.target.value;
                    onChange(next);
                  }}
                >
                  <option value="">{a("choose")}</option>
                  {words.map((w) => (
                    <option key={w} value={w}>
                      {w}
                    </option>
                  ))}
                </select>
              )}
            </span>
          ))}
        </p>
      </div>
    );
  }

  if (q.type === "matching") {
    const pairs = q.pairs || [];
    const order = rightOrder && rightOrder.length === pairs.length ? rightOrder : pairs.map((_, i) => i);
    const cur = Array.isArray(value) ? (value as number[]) : pairs.map(() => -1);
    return (
      <div className="space-y-3">
        <p className="text-base text-slate-600 dark:text-emerald-100/70">{a("matchHint")}</p>
        {pairs.map((p, i) => {
          const accent = OPTION_ACCENTS[i % OPTION_ACCENTS.length];
          return (
            <div key={i} className={`grid items-center gap-3 rounded-2xl border-2 px-4 py-3 sm:grid-cols-2 ${accent.card}`}>
              <span className="flex items-center gap-3 text-lg font-semibold sm:text-xl">
                <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-sm font-bold ${accent.badge}`}>{i + 1}</span>
                {p.left}
              </span>
              <select
                aria-label={p.left}
                className="w-full rounded-xl border-2 border-emerald-900/15 bg-white px-3 py-3 text-lg outline-none focus:border-teal-500 dark:border-emerald-100/15 dark:bg-black/30"
                value={cur[i] ?? -1}
                onChange={(e) => onChange(pairs.map((_, j) => (j === i ? Number(e.target.value) : cur[j] ?? -1)))}
              >
                <option value={-1}>{a("choose")}</option>
                {order.map((ri) => (
                  <option key={ri} value={ri}>
                    {pairs[ri].right}
                  </option>
                ))}
              </select>
            </div>
          );
        })}
      </div>
    );
  }

  if (q.type === "ordering") {
    const cur = Array.isArray(value) ? (value as number[]) : q.options.map((_, i) => i);
    const moveTo = (from: number, to: number) => {
      if (to < 0 || to >= cur.length || from === to) return;
      const next = [...cur];
      const [item] = next.splice(from, 1);
      next.splice(to, 0, item);
      onChange(next);
    };
    const arrowBtn =
      "flex h-10 w-10 items-center justify-center rounded-xl border-2 border-emerald-900/15 bg-white text-lg font-bold disabled:opacity-30 dark:border-emerald-100/15 dark:bg-black/30";
    return (
      <div className="space-y-3">
        <p className="text-base text-slate-600 dark:text-emerald-100/70">{a("orderHint")}</p>
        <ol className="space-y-3">
          {cur.map((idx, pos) => {
            const accent = OPTION_ACCENTS[pos % OPTION_ACCENTS.length];
            return (
              <li
                key={idx}
                draggable
                onDragStart={(e) => e.dataTransfer.setData("text/plain", String(pos))}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault();
                  const from = Number(e.dataTransfer.getData("text/plain"));
                  if (!Number.isNaN(from)) moveTo(from, pos);
                }}
                className={`flex cursor-grab items-center gap-3 rounded-2xl border-2 px-4 py-3 text-lg font-medium sm:text-xl ${accent.card}`}
              >
                <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-sm font-bold ${accent.badge}`}>{pos + 1}</span>
                <span className="flex-1">{q.options[idx]}</span>
                <button type="button" aria-label={a("moveUp")} disabled={pos === 0} onClick={() => moveTo(pos, pos - 1)} className={arrowBtn}>
                  ↑
                </button>
                <button type="button" aria-label={a("moveDown")} disabled={pos === cur.length - 1} onClick={() => moveTo(pos, pos + 1)} className={arrowBtn}>
                  ↓
                </button>
              </li>
            );
          })}
        </ol>
      </div>
    );
  }

  return null;
}
