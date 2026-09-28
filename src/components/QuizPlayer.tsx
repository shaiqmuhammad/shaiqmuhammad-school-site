"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { QuizMedia } from "@/components/QuizMedia";
import { QuizQuestionInput } from "@/components/QuizQuestionInput";
import { QuizReview } from "@/components/QuizReview";
import { downloadCertificatePdf } from "@/lib/certificatePdf";
import { newId } from "@/lib/content";
import {
  appendLocalResult,
  computeRank,
  isAnswered,
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

/** Random order of 0..n-1 that is never the original order (when n > 1). */
function shuffledIndexes(n: number): number[] {
  const a = Array.from({ length: n }, (_, i) => i);
  for (let i = n - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  if (n > 1 && a.every((v, i) => v === i)) a.push(a.shift() as number);
  return a;
}

function initialAnswers(quiz: Quiz): { answers: Record<string, unknown>; rightOrders: Record<string, number[]> } {
  const answers: Record<string, unknown> = {};
  const rightOrders: Record<string, number[]> = {};
  for (const q of quiz.questions) {
    if (q.type === "ordering") answers[q.id] = shuffledIndexes(q.options.length);
    if (q.type === "matching") {
      const n = (q.pairs || []).length;
      answers[q.id] = Array.from({ length: n }, () => -1);
      rightOrders[q.id] = shuffledIndexes(n);
    }
  }
  return { answers, rightOrders };
}

function countBlanksLabel(prompt: string): string {
  return (prompt.match(/_{3,}/g) || []).length > 1 ? "s" : "";
}

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
  const [rightOrders, setRightOrders] = useState<Record<string, number[]>>({});
  const [finalAnswers, setFinalAnswers] = useState<Record<string, unknown>>({});
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
      setFinalAnswers(answersRef.current);
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

  function positionLabel(): string {
    if (!rank || !rank.total) return "";
    return `${rank.rank} of ${rank.total}`;
  }

  const maxScore = quizMaxScore(quiz);
  const answeredCount = quiz.questions.filter((q) => isAnswered(q, answers[q.id])).length;

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
            const init = initialAnswers(quiz);
            setAnswers(init.answers);
            setRightOrders(init.rightOrders);
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
      <div className="space-y-8">
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
      {quiz.showAnswers && <QuizReview quiz={quiz} answers={finalAnswers} />}
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
            </p>
            {q.type === "fill_blank" ? (
              <p className="mt-1 font-medium">Fill in the blank{countBlanksLabel(q.prompt)}</p>
            ) : (
              <p className="mt-1 whitespace-pre-wrap font-medium">{q.prompt}</p>
            )}
            <QuizMedia media={q.media} />
            <div className="mt-4">
              <QuizQuestionInput q={q} value={answers[q.id]} onChange={(v) => setAnswer(q.id, v)} rightOrder={rightOrders[q.id]} />
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
