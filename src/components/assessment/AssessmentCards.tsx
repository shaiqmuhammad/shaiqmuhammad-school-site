"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Card } from "@/components/Card";
import { localizedDescription, localizedTitle, useAssessmentText } from "@/lib/assessmentI18n";
import { quizMaxScore, type Quiz } from "@/lib/quiz";

/** Assessment cards (localized) — used on /assessments and the home page. */
export function AssessmentCards({ quizzes, showJoin = false, yearFilter = false }: { quizzes: Quiz[]; showJoin?: boolean; yearFilter?: boolean }) {
  const { a, lang } = useAssessmentText();
  const years = [...new Set(quizzes.map((q) => q.year).filter((y): y is number => typeof y === "number"))].sort((x, y) => x - y);
  const [year, setYear] = useState<number | "all">("all");
  const shown = year === "all" ? quizzes : quizzes.filter((q) => q.year === year);
  const yearLabel = (y: number) => (lang === "ar" ? `السنة ${y}` : `Year ${y}`);
  return (
    <div className="space-y-6">
    {yearFilter && years.length > 0 && (
      <div className="flex flex-wrap gap-2" role="tablist" aria-label={lang === "ar" ? "تصفية حسب السنة" : "Filter by year"} data-testid="year-filter">
        {(["all", ...years] as (number | "all")[]).map((y) => (
          <button
            key={String(y)}
            type="button"
            role="tab"
            aria-selected={year === y}
            onClick={() => setYear(y)}
            className={`rounded-full px-4 py-2 text-sm font-semibold transition ${year === y ? "bg-primary text-primary-foreground" : "bg-accent-soft text-primary hover:bg-primary/10"}`}
          >
            {y === "all" ? (lang === "ar" ? "الكل" : "All") : yearLabel(y)}
          </button>
        ))}
      </div>
    )}
    <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
      {showJoin && <JoinCard />}
      {shown.map((quiz) => (
        <Card key={quiz.id} className="flex h-full flex-col overflow-hidden p-0! transition hover:border-primary/40">
          <div className="relative aspect-[16/10] bg-accent-soft">
            {quiz.cardImage ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={quiz.cardImage} alt="" className="h-full w-full object-cover" />
            ) : (
              <div className="flex h-full items-center justify-center bg-gradient-to-br from-teal-600 via-emerald-500 to-lime-400 text-5xl text-white" aria-hidden>
                📝
              </div>
            )}
          </div>
          <div className="flex flex-1 flex-col p-5">
            {quiz.year ? <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-primary">{yearLabel(quiz.year)}</p> : null}
            <h3 className="text-lg font-semibold">{localizedTitle(quiz, lang)}</h3>
            {localizedDescription(quiz, lang) && (
              <p className="mt-2 line-clamp-3 text-sm leading-relaxed text-muted">{localizedDescription(quiz, lang)}</p>
            )}
            <p className="mt-3 text-xs text-muted">
              {a("questionsMarks", { q: quiz.questions.length, m: quizMaxScore(quiz) })} ·{" "}
              {quiz.timeLimitMinutes > 0 ? a("minutes", { n: quiz.timeLimitMinutes }) : a("untimed")}
            </p>
            <div className="mt-auto pt-4">
              <Link
                href={`/assessments/${quiz.slug}`}
                className="inline-flex w-fit rounded-full bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground hover:opacity-90"
              >
                {a("startAssessment")} →
              </Link>
            </div>
          </div>
        </Card>
      ))}
    </div>
    </div>
  );
}

function JoinCard() {
  const { a } = useAssessmentText();
  const router = useRouter();
  const [code, setCode] = useState("");
  const clean = code.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 8);
  return (
    <Card className="flex h-full flex-col justify-between gap-4 border-teal-500/40 bg-gradient-to-br from-teal-50 to-emerald-50 dark:from-teal-950/60 dark:to-emerald-950/40">
      <div>
        <p className="text-4xl" aria-hidden>
          👥
        </p>
        <h3 className="mt-3 text-lg font-semibold">{a("joinTitle")}</h3>
        <p className="mt-2 text-sm leading-relaxed text-muted">{a("joinSubtitle")}</p>
      </div>
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (clean.length >= 4) router.push(`/assessments/join?code=${clean}`);
        }}
      >
        <input
          value={clean}
          onChange={(e) => setCode(e.target.value)}
          placeholder={a("joinCode")}
          aria-label={a("joinCode")}
          dir="ltr"
          autoCapitalize="characters"
          className="min-w-0 flex-1 rounded-full border border-border bg-background px-4 py-2.5 text-center font-mono text-base font-bold uppercase tracking-widest"
        />
        <button type="submit" disabled={clean.length < 4} className="rounded-full bg-teal-700 px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-50">
          {a("join")}
        </button>
      </form>
    </Card>
  );
}

/** Localized hero text for the list page (server page stays static). */
export function AssessmentsHeading() {
  const { a } = useAssessmentText();
  return (
    <div>
      <p className="text-sm font-semibold uppercase tracking-widest text-primary">{a("practice")}</p>
      <h1 className="mt-2 text-3xl font-bold tracking-tight sm:text-4xl">{a("assessments")}</h1>
      <p className="mt-3 max-w-2xl text-base leading-relaxed text-muted">{a("listSubtitle")}</p>
    </div>
  );
}

/** Home page section heading (localized). */
export function HomeAssessmentsHeading() {
  const { a } = useAssessmentText();
  return (
    <div className="mb-8 flex items-end justify-between gap-4">
      <div>
        <p className="text-xs font-semibold uppercase tracking-wider text-primary">{a("practice")}</p>
        <h2 className="mt-2 text-2xl font-semibold tracking-tight sm:text-3xl">{a("assessments")}</h2>
        <p className="mt-2 max-w-2xl text-muted">{a("homeSubtitle")}</p>
      </div>
      <Link href="/assessments" className="shrink-0 text-sm font-medium text-primary hover:underline">
        {a("allAssessments")} →
      </Link>
    </div>
  );
}
