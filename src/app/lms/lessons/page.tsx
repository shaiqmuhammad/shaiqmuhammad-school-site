import type { Metadata } from "next";
import { LessonPages } from "@/components/LessonPages";

export const metadata: Metadata = { title: "Lesson pages", robots: { index: false, follow: false } };

export default function Page() {
  return <LessonPages />;
}
