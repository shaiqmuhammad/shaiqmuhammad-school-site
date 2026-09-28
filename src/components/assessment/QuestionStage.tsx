"use client";

import { QuizMedia } from "@/components/QuizMedia";
import { QuizQuestionInput } from "@/components/QuizQuestionInput";
import { localizeQuestion, useAssessmentText } from "@/lib/assessmentI18n";
import type { QuizQuestion } from "@/lib/quiz";

type Props = {
  question: QuizQuestion;
  index: number;
  total: number;
  value: unknown;
  onChange: (value: unknown) => void;
  rightOrder?: number[];
};

/** One question per page: number, marks, big prompt, media, answer controls. */
export function QuestionStage({ question, index, total, value, onChange, rightOrder }: Props) {
  const { a, lang } = useAssessmentText();
  const q = localizeQuestion(question, lang);
  const pts = q.points || 1;
  return (
    <section key={q.id} className="space-y-6" aria-label={a("questionOf", { i: index + 1, n: total })}>
      <div className="flex flex-wrap items-center gap-2 text-sm font-semibold uppercase tracking-wider">
        <span className="rounded-full bg-teal-700 px-3 py-1 text-white dark:bg-teal-500 dark:text-teal-950">
          {a("questionOf", { i: index + 1, n: total })}
        </span>
        <span className="rounded-full bg-amber-100 px-3 py-1 text-amber-900 dark:bg-amber-900/40 dark:text-amber-100">
          {pts === 1 ? a("mark") : a("marks", { n: pts })}
        </span>
      </div>
      {q.type === "fill_blank" ? (
        <h2 className="text-2xl font-bold tracking-tight text-teal-950 dark:text-white sm:text-4xl">{a("fillTitle")}</h2>
      ) : (
        <h2 dir="auto" className="whitespace-pre-wrap text-start text-2xl font-bold leading-snug tracking-tight text-teal-950 dark:text-white sm:text-4xl sm:leading-tight">
          {q.prompt}
        </h2>
      )}
      <QuizMedia media={q.media} />
      <QuizQuestionInput q={q} value={value} onChange={onChange} rightOrder={rightOrder} />
    </section>
  );
}
