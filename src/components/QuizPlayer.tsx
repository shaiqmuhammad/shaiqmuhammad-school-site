"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { AssessmentShell, fieldCls, ghostBtn, panelCls, primaryBtn } from "@/components/assessment/AssessmentShell";
import { MissingAnswers } from "@/components/assessment/MissingAnswers";
import { QuestionStage } from "@/components/assessment/QuestionStage";
import { QuizReview } from "@/components/QuizReview";
import { localizedDescription, localizedTitle, useAssessmentText } from "@/lib/assessmentI18n";
import { downloadCertificatePdf } from "@/lib/certificatePdf";
import { newId } from "@/lib/content";
import {
  appendLocalResult,
  computeRank,
  isAnswered,
  loadCertificateTemplate,
  loadQuizResultsData,
  quizMaxScore,
  scoreQuestion,
  scoreQuiz,
  type CertificateTemplate,
  type Quiz,
  type QuizQuestion,
  type QuizResult,
} from "@/lib/quiz";

type Props = {
  quiz: Quiz;
  initialTemplate: CertificateTemplate;
  initialResults: QuizResult[];
};

type Phase = "intro" | "running" | "done";

/** Random order of 0..n-1 that is never the original order (when n > 1). */
export function shuffledIndexes(n: number): number[] {
  const a = Array.from({ length: n }, (_, i) => i);
  for (let i = n - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  if (n > 1 && a.every((v, i) => v === i)) a.push(a.shift() as number);
  return a;
}

/** Starting answers (ordering pre-shuffled) and shuffled right-hand columns for matching. */
export function initialAnswers(questions: QuizQuestion[]): { answers: Record<string, unknown>; rightOrders: Record<string, number[]> } {
  const answers: Record<string, unknown> = {};
  const rightOrders: Record<string, number[]> = {};
  for (const q of questions) {
    if (q.type === "ordering") answers[q.id] = shuffledIndexes(q.options.length);
    if (q.type === "matching") {
      const n = (q.pairs || []).length;
      answers[q.id] = Array.from({ length: n }, () => -1);
      rightOrders[q.id] = shuffledIndexes(n);
    }
  }
  return { answers, rightOrders };
}

/** Individual assessment: full-screen, one question per page, shared palette with group mode. */
export function QuizPlayer({ quiz, initialTemplate, initialResults }: Props) {
  const { a, lang } = useAssessmentText();
  const [phase, setPhase] = useState<Phase>("intro");
  const [name, setName] = useState("");
  const [answers, setAnswers] = useState<Record<string, unknown>>({});
  const [rightOrders, setRightOrders] = useState<Record<string, number[]>>({});
  const [current, setCurrent] = useState(0);
  const [endAt, setEndAt] = useState<number | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [result, setResult] = useState<QuizResult | null>(null);
  const [rank, setRank] = useState<{ rank: number; total: number } | null>(null);
  const [template, setTemplate] = useState<CertificateTemplate>(initialTemplate);
  const [published, setPublished] = useState<QuizResult[]>(initialResults);
  const [timedOut, setTimedOut] = useState(false);
  const [finalAnswers, setFinalAnswers] = useState<Record<string, unknown>>({});
  const [showMissing, setShowMissing] = useState(false);
  const answersRef = useRef(answers);
  const submittedRef = useRef(false);

  const title = localizedTitle(quiz, lang);
  const total = quiz.questions.length;
  const maxScore = quizMaxScore(quiz);

  useEffect(() => {
    answersRef.current = answers;
  }, [answers]);

  useEffect(() => {
    loadCertificateTemplate().then(setTemplate).catch(() => undefined);
    loadQuizResultsData()
      .then((d) => setPublished(d.results.filter((r) => r.quizId === quiz.id)))
      .catch(() => undefined);
  }, [quiz.id]);

  const submit = useCallback(
    (auto = false) => {
      if (submittedRef.current) return;
      submittedRef.current = true;
      const { score, maxScore: max, percentage } = scoreQuiz(quiz, answersRef.current);
      const r: QuizResult = {
        id: newId("result"),
        quizId: quiz.id,
        quizSlug: quiz.slug,
        name: name.trim() || "Student",
        score,
        maxScore: max,
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
      window.scrollTo({ top: 0 });
    },
    [quiz, name, published],
  );

  // Timer from an absolute end time (no drift when the tab sleeps).
  useEffect(() => {
    if (phase !== "running" || endAt === null) return;
    const t = setInterval(() => {
      const n = Date.now();
      setNow(n);
      if (n >= endAt) {
        clearInterval(t);
        submit(true);
      }
    }, 250);
    return () => clearInterval(t);
  }, [phase, endAt, submit]);

  function begin() {
    if (!name.trim()) return;
    submittedRef.current = false;
    const init = initialAnswers(quiz.questions);
    setAnswers(init.answers);
    setRightOrders(init.rightOrders);
    setCurrent(0);
    setEndAt(quiz.timeLimitMinutes > 0 ? Date.now() + quiz.timeLimitMinutes * 60_000 : null);
    setNow(Date.now());
    setPhase("running");
  }

  function positionLabel(): string {
    if (!rank || !rank.total) return "";
    return `${rank.rank} of ${rank.total}`;
  }

  const answeredFlags = quiz.questions.map((q) => isAnswered(q, answers[q.id]));
  const answeredCount = answeredFlags.filter(Boolean).length;
  const secondsLeft = phase === "running" && endAt !== null ? Math.max(0, (endAt - now) / 1000) : null;

  if (phase === "intro") {
    return (
      <AssessmentShell title={a("assessment")}>
        <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col justify-center px-4 py-10">
          <div className={panelCls}>
            {quiz.cardImage ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={quiz.cardImage} alt="" className="mb-6 aspect-[16/7] w-full rounded-2xl object-cover" />
            ) : null}
            <p className="text-sm font-bold uppercase tracking-widest text-teal-700 dark:text-teal-300">{a("assessment")}</p>
            <h1 className="mt-2 text-3xl font-bold tracking-tight text-teal-950 dark:text-white sm:text-5xl">{title}</h1>
            {localizedDescription(quiz, lang) && (
              <p className="mt-4 text-lg leading-relaxed text-slate-600 dark:text-emerald-100/80">{localizedDescription(quiz, lang)}</p>
            )}
            <div className="mt-6 flex flex-wrap gap-2 text-base font-semibold">
              <span className="rounded-full bg-teal-100 px-4 py-1.5 text-teal-900 dark:bg-teal-900/50 dark:text-teal-100">
                {a("questionsMarks", { q: total, m: maxScore })}
              </span>
              <span className="rounded-full bg-amber-100 px-4 py-1.5 text-amber-900 dark:bg-amber-900/40 dark:text-amber-100">
                {quiz.timeLimitMinutes > 0 ? a("timeLimit", { n: quiz.timeLimitMinutes }) : a("noTimeLimit")}
              </span>
            </div>
            <form
              className="mt-8"
              onSubmit={(e) => {
                e.preventDefault();
                begin();
              }}
            >
              <label className="block text-base font-semibold">
                {a("yourName")}
                <input className={fieldCls} value={name} onChange={(e) => setName(e.target.value)} placeholder={a("namePlaceholder")} required maxLength={80} />
              </label>
              <button type="submit" className={`${primaryBtn} mt-6 w-full sm:w-auto`} disabled={!name.trim() || total === 0}>
                {a("startAssessment")} →
              </button>
            </form>
            <p className="mt-4 text-sm text-slate-500 dark:text-emerald-100/60">{a("timerNote")}</p>
          </div>
        </div>
      </AssessmentShell>
    );
  }

  if (phase === "done" && result) {
    const correctCount = quiz.questions.filter((q) => scoreQuestion(q, finalAnswers[q.id]) >= (q.points || 1)).length;
    return (
      <AssessmentShell title={title}>
        <div className="mx-auto w-full max-w-3xl space-y-8 px-4 py-10">
          <div className={panelCls}>
            {timedOut && <p className="mb-4 rounded-xl bg-amber-100 px-4 py-2 text-base font-medium text-amber-900 dark:bg-amber-900/40 dark:text-amber-100">{a("timeUp")}</p>}
            <p className="text-sm font-bold uppercase tracking-widest text-teal-700 dark:text-teal-300">{a("complete")}</p>
            <h1 className="mt-2 text-3xl font-bold text-teal-950 dark:text-white sm:text-4xl">{a("wellDone", { name: result.name })}</h1>
            <div className="mt-6 grid grid-cols-2 gap-3 text-center sm:grid-cols-4">
              {[
                { label: a("score"), value: `${result.score}/${result.maxScore}`, cls: "bg-teal-100 text-teal-900 dark:bg-teal-900/50 dark:text-teal-100" },
                { label: a("percentage"), value: `${result.percentage}%`, cls: "bg-sky-100 text-sky-900 dark:bg-sky-900/40 dark:text-sky-100" },
                { label: a("correct"), value: String(correctCount), cls: "bg-emerald-100 text-emerald-900 dark:bg-emerald-900/40 dark:text-emerald-100" },
                { label: a("wrong"), value: String(total - correctCount), cls: "bg-rose-100 text-rose-900 dark:bg-rose-900/40 dark:text-rose-100" },
              ].map((s) => (
                <div key={s.label} className={`rounded-2xl p-4 ${s.cls}`}>
                  <p className="text-sm font-semibold opacity-80">{s.label}</p>
                  <p className="mt-1 text-3xl font-bold tabular-nums">{s.value}</p>
                </div>
              ))}
            </div>
            {template.showPosition && rank && rank.total > 0 && (
              <p className="mt-5 text-base">
                {a("position")}: <strong dir="ltr">{positionLabel()}</strong>
                <span className="mt-1 block text-sm opacity-70">{a("positionNote")}</span>
              </p>
            )}
            <div className="mt-6 flex flex-wrap gap-3">
              <button
                type="button"
                onClick={() => downloadCertificatePdf({ template, result, quizTitle: quiz.title, positionLabel: positionLabel() })}
                className={primaryBtn}
              >
                {a("downloadCertificate")}
              </button>
              <Link href="/assessments" className={ghostBtn}>
                {a("allAssessments")}
              </Link>
            </div>
            <p className="mt-4 text-sm opacity-70">{a("savedNote")}</p>
          </div>
          {quiz.showAnswers && <QuizReview quiz={quiz} answers={finalAnswers} />}
        </div>
      </AssessmentShell>
    );
  }

  const q = quiz.questions[current];
  const last = current === total - 1;
  return (
    <AssessmentShell
      title={title}
      secondsLeft={secondsLeft}
      onExit={() => confirm(a("exitConfirm"))}
      progress={{ current, total, answered: answeredFlags, onJump: setCurrent }}
    >
      <form
        className="mx-auto flex w-full max-w-3xl flex-1 flex-col px-4 py-8 sm:py-12"
        onSubmit={(e) => {
          e.preventDefault();
          if (!last) {
            setCurrent((c) => c + 1);
            return;
          }
          // Every question is required; only the timer may submit with gaps (they count as wrong).
          if (answeredCount < total) {
            setShowMissing(true);
            return;
          }
          submit(false);
        }}
      >
        <div className="flex-1">
          <QuestionStage
            question={q}
            index={current}
            total={total}
            value={answers[q.id]}
            onChange={(v) => setAnswers((prev) => ({ ...prev, [q.id]: v }))}
            rightOrder={rightOrders[q.id]}
          />
          {showMissing && (
            <MissingAnswers
              answered={answeredFlags}
              onJump={(i) => {
                setCurrent(i);
                window.scrollTo({ top: 0 });
              }}
              onClose={() => setShowMissing(false)}
            />
          )}
        </div>
        <div className="sticky bottom-0 mt-10 flex items-center justify-between gap-3 border-t border-emerald-900/10 bg-gradient-to-t from-white via-white/95 to-white/0 pb-4 pt-4 dark:border-emerald-100/10 dark:from-[#0a1613] dark:via-[#0a1613]/95">
          <button type="button" className={`${ghostBtn} ${current === 0 ? "invisible" : ""}`} disabled={current === 0} onClick={() => setCurrent((c) => c - 1)}>
            <span className="inline-block rtl:rotate-180" aria-hidden>←</span> {a("previous")}
          </button>
          <p className="hidden text-sm font-medium opacity-70 sm:block">{a("answered", { a: answeredCount, n: total })}</p>
          <button type="submit" className={primaryBtn}>
            {last ? a("submit") : a("next")} {!last && <span className="inline-block rtl:rotate-180" aria-hidden>→</span>}
          </button>
        </div>
      </form>
    </AssessmentShell>
  );
}
