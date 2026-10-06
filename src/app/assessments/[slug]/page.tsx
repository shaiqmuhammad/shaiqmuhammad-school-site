import type { Metadata } from "next";
import { NotAvailable } from "@/components/assessment/NotAvailable";
import { QuizPlayer } from "@/components/QuizPlayer";
import { getQuizBySlug } from "@/lib/quiz";
import { loadCertificateSync, loadQuizResultsSync, loadQuizzesSync } from "@/lib/quizServer";

type PageProps = {
  params: Promise<{ slug: string }>;
};

export const dynamicParams = false;

const RESERVED = new Set(["join", "host"]);

export function generateStaticParams() {
  // Every assessment gets a page: hidden or inactive ones show a friendly "not available" message.
  const slugs = loadQuizzesSync()
    .quizzes.filter((q) => !RESERVED.has(q.slug))
    .map((q) => ({ slug: q.slug }));
  // Static export needs at least one param; placeholder renders a friendly message.
  return slugs.length ? slugs : [{ slug: "coming-soon" }];
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const quiz = getQuizBySlug(loadQuizzesSync(), slug, { includeDrafts: true });
  return quiz && quiz.visible ? { title: quiz.title, description: quiz.description } : { title: "Assessment" };
}

export default async function AssessmentPage({ params }: PageProps) {
  const { slug } = await params;
  const quiz = getQuizBySlug(loadQuizzesSync(), slug, { includeDrafts: true });
  // Hidden from the website or not active yet: students can't start it on their own.
  if (!quiz || !quiz.visible || !quiz.active) return <NotAvailable notYet={Boolean(quiz?.visible && !quiz.active)} />;

  const template = loadCertificateSync();
  const results = loadQuizResultsSync().results.filter((r) => r.quizId === quiz.id);
  return <QuizPlayer quiz={quiz} initialTemplate={template} initialResults={results} />;
}
