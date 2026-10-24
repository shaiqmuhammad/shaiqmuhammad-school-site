import type { Metadata } from "next";
import { LessonRedirect } from "@/components/LessonPages";

export const metadata: Metadata = { title: "Sign in", robots: { index: false, follow: false } };

export default function LessonsPage() {
  return <LessonRedirect />;
}
