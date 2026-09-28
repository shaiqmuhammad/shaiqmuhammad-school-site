import type { Metadata } from "next";
import Link from "next/link";
import { PageHero } from "@/components/PageHero";
import { QuizPlayer } from "@/components/QuizPlayer";
import { Section } from "@/components/Section";
import { getQuizBySlug, listPublishedQuizzes } from "@/lib/quiz";
import { loadCertificateSync, loadQuizResultsSync, loadQuizzesSync } from "@/lib/quizServer";

type PageProps = {
  params: Promise<{ slug: string }>;
};

export const dynamicParams = false;

export function generateStaticParams() {
  const slugs = listPublishedQuizzes(loadQuizzesSync()).map((q) => ({ slug: q.slug }));
  // Static export needs at least one param; placeholder renders a friendly message.
  return slugs.length ? slugs : [{ slug: "coming-soon" }];
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const quiz = getQuizBySlug(loadQuizzesSync(), slug);
  return quiz ? { title: quiz.title, description: quiz.description } : { title: "Quiz" };
}

export default async function QuizPage({ params }: PageProps) {
  const { slug } = await params;
  const quiz = getQuizBySlug(loadQuizzesSync(), slug);

  if (!quiz) {
    return (
      <Section>
        <p className="text-sm text-muted">This quiz is not available yet.</p>
        <Link href="/quizzes" className="mt-4 inline-block text-sm font-medium text-primary hover:underline">← All quizzes</Link>
      </Section>
    );
  }

  const template = loadCertificateSync();
  const results = loadQuizResultsSync().results.filter((r) => r.quizId === quiz.id);

  return (
    <>
      <PageHero eyebrow="Quiz" title={quiz.title} subtitle={quiz.description} />
      <Section className="pt-8">
        <Link href="/quizzes" className="text-sm font-medium text-primary hover:underline">← All quizzes</Link>
        <div className="mt-6">
          <QuizPlayer quiz={quiz} initialTemplate={template} initialResults={results} />
        </div>
      </Section>
    </>
  );
}
