import type { Metadata } from "next";
import { LmsAssessmentsPage } from "@/components/lms/LmsAssessments";

export const metadata: Metadata = { title: "Assessments", robots: { index: false, follow: false } };

export default function Page() {
  return <LmsAssessmentsPage />;
}
