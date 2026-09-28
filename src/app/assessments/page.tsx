import type { Metadata } from "next";
import { AssessmentCards, AssessmentsHeading } from "@/components/assessment/AssessmentCards";
import { Section } from "@/components/Section";
import { listPublishedQuizzes } from "@/lib/quiz";
import { loadQuizzesSync } from "@/lib/quizServer";

export const metadata: Metadata = {
  title: "Assessments",
  description: "Timed assessments from Shaiq Muhammad — take one on your own or join a live class session, then download your certificate.",
};

export default function AssessmentsPage() {
  const quizzes = listPublishedQuizzes(loadQuizzesSync());
  return (
    <Section className="pt-10">
      <AssessmentsHeading />
      <div className="mt-8">
        <AssessmentCards quizzes={quizzes} showJoin yearFilter />
      </div>
    </Section>
  );
}
