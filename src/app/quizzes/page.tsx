import type { Metadata } from "next";
import Link from "next/link";
import { Card } from "@/components/Card";
import { PageHero } from "@/components/PageHero";
import { Section } from "@/components/Section";
import { listPublishedQuizzes, quizMaxScore } from "@/lib/quiz";
import { loadQuizzesSync } from "@/lib/quizServer";

export const metadata: Metadata = {
  title: "Quizzes",
  description: "Timed quizzes from Shaiq Muhammad — finish and download your certificate.",
};

export default function QuizzesPage() {
  const quizzes = listPublishedQuizzes(loadQuizzesSync());
  return (
    <>
      <PageHero
        eyebrow="Practice"
        title="Quizzes"
        subtitle="Test what you have learned. Each quiz is timed — finish it to download your certificate."
      />
      <Section className="pt-8">
        {quizzes.length === 0 ? (
          <p className="text-sm text-muted">No quizzes published yet. Check back soon.</p>
        ) : (
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {quizzes.map((quiz) => (
              <Card key={quiz.id} className="flex h-full flex-col overflow-hidden p-0! transition hover:border-primary/40">
                <div className="relative aspect-[16/10] bg-accent-soft">
                  {quiz.cardImage ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={quiz.cardImage} alt="" className="h-full w-full object-cover" />
                  ) : (
                    <div className="flex h-full items-center justify-center bg-gradient-to-br from-primary to-primary/70 text-4xl text-primary-foreground" aria-hidden>📝</div>
                  )}
                </div>
                <div className="flex flex-1 flex-col p-5">
                  <h2 className="text-lg font-semibold">{quiz.title}</h2>
                  {quiz.description && <p className="mt-2 line-clamp-3 text-sm text-muted leading-relaxed">{quiz.description}</p>}
                  <p className="mt-3 text-xs text-muted">
                    {quiz.questions.length} questions · {quizMaxScore(quiz)} marks ·{" "}
                    {quiz.timeLimitMinutes > 0 ? `${quiz.timeLimitMinutes} min` : "untimed"}
                  </p>
                  <Link href={`/quizzes/${quiz.slug}`} className="mt-4 inline-flex w-fit rounded-full bg-primary px-4 py-2 text-sm font-medium text-primary-foreground">
                    Start quiz
                  </Link>
                </div>
              </Card>
            ))}
          </div>
        )}
      </Section>
    </>
  );
}
