"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { QuizMedia } from "@/components/QuizMedia";
import { downloadCertificatePdf } from "@/lib/certificatePdf";
import { newId } from "@/lib/content";
import {
  appendLocalResult,
  computeRank,
  loadCertificateTemplate,
  loadQuizResultsData,
  quizMaxScore,
  scoreQuiz,
  type CertificateTemplate,
  type Quiz,
  type QuizResult,
} from "@/lib/quiz";

type Props = {
  quiz: Quiz;
  initialTemplate: CertificateTemplate;
  initialResults: QuizResult[];
};

type Phase = "intro" | "running" | "done";

function formatTime(totalSeconds: number): string {
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export function QuizPlayer({ quiz, initialTemplate, initialResults }: Props) {
  const [phase, setPhase] = useState<Phase>("intro");
  const [name, setName] = useState("");
  const [answers, setAnswers] = useState<Record<string, unknown>>({});
  const [secondsLeft, setSecondsLeft] = useState(quiz.timeLimitMinutes * 60);
  const [result, setResult] = useState<QuizResult | null>(null);
  const [rank, setRank] = useState<{ rank: number; total: number } | null>(null);
  const [template, setTemplate] = useState<CertificateTemplate>(initialTemplate);
  const [published, setPublished] = useState<QuizResult[]>(initialResults);
  const [timedOut, setTimedOut] = useState(false);
  const answersRef = useRef(answers);
  const submittedRef = useRef(false);

  useEffect(() => {
    answersRef.current = answers;
  }, [answers]);

  useEffect(() => {
    loadCertificateTemplate().then(setTemplate).catch(() => undefined);
    loadQuizResultsData().then((d) => setPublished(d.results)).catch(() => undefined);
  }, []);

  const submit = useCallback(
    (auto = false) => {
      if (submittedRef.current) return;
      submittedRef.current = true;
      const { score, maxScore, percentage } = scoreQuiz(quiz, answersRef.current);
      const r: QuizResult = {
        id: newId("result"),
        quizId: quiz.id,
        quizSlug: quiz.slug,
        name: name.trim() || "Student",
        score,
        maxScore,
        percentage,
        finishedAt: new Date().toISOString(),
      };
      try {
        appendLocalResult(r);
      } catch {
        // storage unavailable — still show the result
      }
      setResult(r);
      setRank(computeRank(published, quiz.id, r));
      setTimedOut(auto);
      setPhase("done");
    },
    [quiz, name, published],
  );

  useEffect(() => {
    if (phase !== "running" || quiz.timeLimitMinutes <= 0) return;
    const t = setInterval(() => {
      setSecondsLeft((s) => {
        if (s <= 1) {
          clearInterval(t);
          setTimeout(() => submit(true), 0);
          return 0;
        }
        return s - 1;
      });
    }, 1000);
    return () => clearInterval(t);
  }, [phase, quiz.timeLimitMinutes, submit]);

  function setAnswer(qid: string, value: unknown) {
    setAnswers((prev) => ({ ...prev, [qid]: value }));
  }

  function toggleMulti(qid: string, idx: number) {
    setAnswers((prev) => {
      const cur = Array.isArray(prev[qid]) ? (prev[qid] as number[]) : [];
      const next = cur.includes(idx) ? cur.filter((n) => n !== idx) : [...cur, idx];
      return { ...prev, [qid]: next };
    });
  }

  function positionLabel(): string {
    if (!rank || !rank.total) return "";
    return `${rank.rank} of ${rank.total}`;
  }

  const maxScore = quizMaxScore(quiz);
  const answeredCount = quiz.questions.filter((q) => {
    const a = answers[q.id];
    if (Array.isArray(a)) return a.length > 0;
    return a !== undefined && a !== "";
  }).length;

  if (phase === "intro") {
    return (
      <div className="max-w-xl space-y-5 rounded-2xl border border-card-border bg-card p-6">
        <div className="space-y-1 text-sm text-muted">
          <p>{quiz.questions.length} questions · {maxScore} marks</p>
          <p>{quiz.timeLimitMinutes > 0 ? `Time limit: ${quiz.timeLimitMinutes} minute${quiz.timeLimitMinutes === 1 ? "" : "s"}` : "No time limit"}</p>
        </div>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (!name.trim()) return;
            submittedRef.current = false;
            setAnswers({});
            setSecondsLeft(quiz.timeLimitMinutes * 60);
            setPhase("running");
          }}
          className="space-y-3"
        >
          <label className="block text-sm font-medium">
            Your full name (shown on your certificate)
            <input
              className="mt-1.5 w-full rounded-lg border border-card-border bg-background px-3 py-2 text-sm outline-none focus:border-primary"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Aisha Khan"
              required
              maxLength={80}
            />
          </label>
          <button type="submit" className="rounded-full bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground">
            Start quiz
          </button>
        </form>
        <p className="text-xs text-muted">The timer starts when you press Start. When time runs out your answers are submitted automatically.</p>
      </div>
    );
  }

  if (phase === "done" && result) {
    return (
      <div className="max-w-xl space-y-5 rounded-2xl border border-card-border bg-card p-6">
        {timedOut && <p className="rounded-lg bg-gold-soft px-3 py-2 text-sm">Time is up — your answers were submitted automatically.</p>}
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-primary">Quiz complete</p>
          <h2 className="mt-1 text-2xl font-semibold">Well done, {result.name}!</h2>
        </div>
        <div className="grid grid-cols-2 gap-3 text-center">
          <div className="rounded-xl bg-accent-soft p-4">
            <p className="text-xs text-muted">Marks</p>
            <p className="text-2xl font-semibold text-primary">{result.score}/{result.maxScore}</p>
          </div>
          <div className="rounded-xl bg-accent-soft p-4">
            <p className="text-xs text-muted">Percentage</p>
            <p className="text-2xl font-semibold text-primary">{result.percentage}%</p>
          </div>
        </div>
        {template.showPosition && rank && rank.total > 0 && (
          <p className="text-sm">
            Provisional position: <strong>{positionLabel()}</strong>
            <span className="block text-xs text-muted">Compared with results published by your teacher. Final positions update when your teacher publishes class results.</span>
          </p>
        )}
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => downloadCertificatePdf({ template, result, quizTitle: quiz.title, positionLabel: positionLabel() })}
            className="rounded-full bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground"
          >
            Download PDF certificate
          </button>
          <Link href="/quizzes" className="rounded-full border border-card-border px-5 py-2.5 text-sm">All quizzes</Link>
        </div>
        <p className="text-xs text-muted">Your result is saved on this device. Please tell your teacher you finished so they can add it to the class results.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="sticky top-16 z-40 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-card-border bg-card/95 px-4 py-3 backdrop-blur">
        <p className="text-sm text-muted">{answeredCount}/{quiz.questions.length} answered</p>
        {quiz.timeLimitMinutes > 0 && (
          <p className={`font-mono text-lg font-semibold ${secondsLeft <= 30 ? "text-red-600" : "text-primary"}`} aria-live="polite">
            ⏱ {formatTime(secondsLeft)}
          </p>
        )}
      </div>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (answeredCount < quiz.questions.length && !confirm("Some questions are unanswered. Submit anyway?")) return;
          submit(false);
        }}
        className="space-y-5"
      >
        {quiz.questions.map((q, i) => (
          <fieldset key={q.id} className="rounded-2xl border border-card-border bg-card p-5">
            <legend className="sr-only">Question {i + 1}</legend>
            <p className="text-xs font-semibold uppercase tracking-wide text-muted">
              Question {i + 1} · {q.points} mark{q.points === 1 ? "" : "s"}
              {q.type === "multi_select" && " · select all that apply"}
            </p>
            <p className="mt-1 font-medium whitespace-pre-wrap">{q.prompt}</p>
            <QuizMedia media={q.media} />
            <div className="mt-4 space-y-2">
              {(q.type === "multiple_choice" || q.type === "true_false") &&
                q.options.map((opt, idx) => (
                  <label key={idx} className="flex cursor-pointer items-center gap-3 rounded-lg border border-card-border px-3 py-2 text-sm hover:bg-accent-soft/60">
                    <input type="radio" name={q.id} checked={answers[q.id] === idx} onChange={() => setAnswer(q.id, idx)} />
                    {opt}
                  </label>
                ))}
              {q.type === "multi_select" &&
                q.options.map((opt, idx) => (
                  <label key={idx} className="flex cursor-pointer items-center gap-3 rounded-lg border border-card-border px-3 py-2 text-sm hover:bg-accent-soft/60">
                    <input
                      type="checkbox"
                      checked={Array.isArray(answers[q.id]) && (answers[q.id] as number[]).includes(idx)}
                      onChange={() => toggleMulti(q.id, idx)}
                    />
                    {opt}
                  </label>
                ))}
              {q.type === "short_answer" && (
                <input
                  className="w-full rounded-lg border border-card-border bg-background px-3 py-2 text-sm outline-none focus:border-primary"
                  value={String(answers[q.id] ?? "")}
                  onChange={(e) => setAnswer(q.id, e.target.value)}
                  placeholder="Type your answer"
                />
              )}
            </div>
          </fieldset>
        ))}
        <button type="submit" className="rounded-full bg-primary px-6 py-2.5 text-sm font-medium text-primary-foreground">
          Submit answers
        </button>
      </form>
    </div>
  );
}
