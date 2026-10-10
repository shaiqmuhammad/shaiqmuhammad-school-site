import type { Metadata } from "next";
import { LmsQuizPage } from "@/components/lms/LmsQuiz";

export const metadata: Metadata = { title: "Assessment", robots: { index: false, follow: false } };

export default function Page() {
  return <LmsQuizPage />;
}
