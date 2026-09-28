"use client";

import { localizeQuestion, useAssessmentText } from "@/lib/assessmentI18n";
import { describeAnswer, describeCorrect, scoreQuestion, type Quiz, type ReviewLine } from "@/lib/quiz";

function Lines({ lines, empty }: { lines: ReviewLine[]; empty: string }) {
  if (!lines.length) return <p className="text-base italic opacity-70">{empty}</p>;
  return (
    <ul className="space-y-1 text-base">
      {lines.map((line, i) => (
        <li key={i} className="flex items-center gap-2">
          {line.image ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={line.image} alt="" className="h-14 w-14 rounded-lg border border-black/10 bg-white object-contain p-1" />
          ) : null}
          <span className="whitespace-pre-wrap">{line.text}</span>
        </li>
      ))}
    </ul>
  );
}

/** Review after submission: each question, the student's answer, the correct answer and the explanation. */
export function QuizReview({ quiz, answers }: { quiz: Quiz; answers: Record<string, unknown> }) {
  const { a, lang } = useAssessmentText();
  return (
    <section className="space-y-4" aria-label={a("review")}>
      <h3 className="text-2xl font-bold text-teal-950 dark:text-white">{a("review")}</h3>
      {quiz.questions.map((original, i) => {
        const q = localizeQuestion(original, lang);
        const pts = q.points || 1;
        const earned = scoreQuestion(original, answers[q.id]);
        const right = earned >= pts;
        return (
          <article
            key={q.id}
            className={`rounded-2xl border-2 p-5 ${
              right
                ? "border-emerald-300 bg-emerald-50/80 dark:border-emerald-700 dark:bg-emerald-950/30"
                : "border-rose-200 bg-rose-50/70 dark:border-rose-800 dark:bg-rose-950/30"
            }`}
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm font-semibold uppercase tracking-wide opacity-70">{a("questionOf", { i: i + 1, n: quiz.questions.length })}</p>
              <span
                className={`rounded-full px-3 py-1 text-sm font-semibold ${
                  right ? "bg-emerald-600 text-white" : "bg-rose-600 text-white"
                }`}
              >
                {right ? a("correct") : a("incorrect")} · {earned}/{pts}
              </span>
            </div>
            <p className="mt-2 whitespace-pre-wrap text-lg font-semibold">{q.prompt}</p>
            <div className="mt-3 grid gap-4 sm:grid-cols-2">
              <div>
                <p className="mb-1 text-xs font-semibold uppercase opacity-70">{a("yourAnswer")}</p>
                <Lines lines={describeAnswer(q, answers[q.id])} empty={a("noAnswer")} />
              </div>
              <div>
                <p className="mb-1 text-xs font-semibold uppercase opacity-70">{a("correctAnswer")}</p>
                <Lines lines={describeCorrect(q)} empty={a("notSet")} />
              </div>
            </div>
            {q.explanation ? (
              <p className="mt-3 rounded-xl bg-white/80 px-3 py-2 text-base dark:bg-black/20">
                <strong>{a("explanation")}:</strong> {q.explanation}
              </p>
            ) : null}
          </article>
        );
      })}
    </section>
  );
}
