import type { Metadata } from "next";
import { LearningLibrary } from "@/components/lms/LearningLibrary";

export const metadata: Metadata = { title: "Learning Libraries", robots: { index: false, follow: false } };

export default function Page() {
  return <LearningLibrary />;
}
