import {
  describeAnswer,
  describeCorrect,
  QUESTION_TYPE_LABELS,
  scoreQuestion,
  type Quiz,
  type ReviewLine,
} from "@/lib/quiz";

function Lines({ lines, empty }: { lines: ReviewLine[]; empty: string }) {
  if (!lines.length) return <p className="text-sm italic text-muted">{empty}</p>;
  return (
    <ul className="space-y-1 text-sm">
      {lines.map((line, i) => (
        <li key={i} className="flex items-center gap-2">
          {line.image ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={line.image} alt="" className="h-14 w-14 rounded-lg border border-card-border bg-white object-contain p-1" />
          ) : null}
          <span className="whitespace-pre-wrap">{line.text}</span>
        </li>
      ))}
    </ul>
  );
}

/** Review screen shown after submission: each question, the student's answer, the correct answer and the explanation. */
export function QuizReview({ quiz, answers }: { quiz: Quiz; answers: Record<string, unknown> }) {
  return (
    <section className="space-y-4" aria-label="Answer review">
      <h3 className="text-lg font-semibold">Review your answers</h3>
      {quiz.questions.map((q, i) => {
        const pts = q.points || 1;
        const earned = scoreQuestion(q, answers[q.id]);
        const right = earned >= pts;
        return (
          <article
            key={q.id}
            className={`rounded-2xl border p-5 ${right ? "border-emerald-300 bg-emerald-50/60" : "border-red-200 bg-red-50/50"}`}
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted">
                Question {i + 1} · {QUESTION_TYPE_LABELS[q.type]}
              </p>
              <span
                className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                  right ? "bg-emerald-100 text-emerald-800" : "bg-red-100 text-red-700"
                }`}
              >
                {right ? "Correct" : "Incorrect"} · {earned}/{pts}
              </span>
            </div>
            <p className="mt-1 whitespace-pre-wrap font-medium">{q.prompt}</p>
            <div className="mt-3 grid gap-4 sm:grid-cols-2">
              <div>
                <p className="mb-1 text-xs font-semibold uppercase text-muted">Your answer</p>
                <Lines lines={describeAnswer(q, answers[q.id])} empty="No answer" />
              </div>
              <div>
                <p className="mb-1 text-xs font-semibold uppercase text-muted">Correct answer</p>
                <Lines lines={describeCorrect(q)} empty="(not set)" />
              </div>
            </div>
            {q.explanation ? (
              <p className="mt-3 rounded-lg bg-white/80 px-3 py-2 text-sm">
                <strong>Explanation:</strong> {q.explanation}
              </p>
            ) : null}
          </article>
        );
      })}
    </section>
  );
}
