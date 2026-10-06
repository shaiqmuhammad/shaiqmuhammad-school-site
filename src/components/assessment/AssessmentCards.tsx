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
  const notYetLabel = lang === "ar" ? "غير متاح بعد" : "Not available yet";
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
            className="pill px-4 py-2 text-sm"
          >
            {y === "all" ? (lang === "ar" ? "الكل" : "All") : yearLabel(y)}
          </button>
        ))}
      </div>
    )}
    <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
      {showJoin && <JoinCard />}
      {shown.map((quiz) => (
        <Card key={quiz.id} className={`flex h-full flex-col overflow-hidden p-0! transition ${quiz.active ? "hover:-translate-y-0.5 hover:border-sun-border" : ""}`}>
          <div className="relative aspect-[16/10] bg-cream">
            {quiz.cardImage ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={quiz.cardImage} alt="" className={`h-full w-full object-cover ${quiz.active ? "" : "opacity-60 grayscale"}`} />
            ) : (
              <div className={`flex h-full items-center justify-center bg-gradient-to-br from-navy via-navy-deep to-teal-brand text-5xl text-white ${quiz.active ? "" : "opacity-60 grayscale"}`} aria-hidden>
                📝
              </div>
            )}
            {!quiz.active && (
              <span className="absolute start-3 top-3 rounded-full border border-white/60 bg-navy/85 px-3 py-1 text-xs font-extrabold text-white backdrop-blur" data-testid="not-available-badge">
                🔒 {notYetLabel}
              </span>
            )}
          </div>
          <div className="flex flex-1 flex-col p-5">
            {quiz.year ? <p className="mb-1 eyebrow">{yearLabel(quiz.year)}</p> : null}
            <h3 className="text-lg font-extrabold">{localizedTitle(quiz, lang)}</h3>
            {localizedDescription(quiz, lang) && (
              <p className="mt-2 line-clamp-3 text-sm leading-relaxed text-muted">{localizedDescription(quiz, lang)}</p>
            )}
            <p className="mt-3 text-xs text-muted">
              {a("questionsMarks", { q: quiz.questions.length, m: quizMaxScore(quiz) })} ·{" "}
              {quiz.timeLimitMinutes > 0 ? a("minutes", { n: quiz.timeLimitMinutes }) : a("untimed")}
            </p>
            <div className="mt-auto pt-4">
              {quiz.active ? (
                <Link href={`/assessments/${quiz.slug}`} className="btn-cta w-fit px-5 py-2.5 text-sm">
                  {a("startAssessment")} <span className="inline-block rtl:rotate-180" aria-hidden>→</span>
                </Link>
              ) : (
                <span aria-disabled="true" className="inline-flex w-fit cursor-not-allowed items-center gap-1.5 rounded-full border border-card-border bg-slate-100 px-5 py-2.5 text-sm font-bold text-slate-500 dark:bg-white/5 dark:text-slate-400">
                  {notYetLabel}
                </span>
              )}
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
    <Card className="glass-emph flex h-full flex-col justify-between gap-4 bg-cream/80! dark:bg-white/5!">
      <div>
        <p className="text-4xl" aria-hidden>
          👥
        </p>
        <h3 className="mt-3 text-lg font-extrabold">{a("joinTitle")}</h3>
        <p className="mt-2 text-sm leading-relaxed text-muted">{a("joinSubtitle")}</p>
      </div>
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (clean.length >= 4) router.push(`/join?code=${clean}`);
        }}
      >
        <input
          value={clean}
          onChange={(e) => setCode(e.target.value)}
          placeholder={a("joinCode")}
          aria-label={a("joinCode")}
          dir="ltr"
          autoCapitalize="characters"
          className="min-w-0 flex-1 rounded-full border border-card-border bg-card-solid px-4 py-2.5 text-center font-mono text-base font-bold uppercase tracking-widest text-heading"
        />
        <button type="submit" disabled={clean.length < 4} className="btn-cta px-5 py-2.5 text-sm disabled:opacity-50">
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
      <p className="eyebrow">{a("practice")}</p>
      <h1 className="mt-2 text-3xl font-extrabold tracking-tight sm:text-4xl">{a("assessments")}</h1>
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
        <p className="eyebrow">{a("practice")}</p>
        <h2 className="mt-2 text-2xl font-extrabold tracking-tight sm:text-3xl">{a("assessments")}</h2>
        <p className="mt-2 max-w-2xl text-muted">{a("homeSubtitle")}</p>
      </div>
      <Link href="/assessments" className="shrink-0 text-sm font-medium text-primary hover:underline">
        {a("allAssessments")} →
      </Link>
    </div>
  );
}
