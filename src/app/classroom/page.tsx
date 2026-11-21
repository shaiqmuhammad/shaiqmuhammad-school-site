import type { Metadata } from "next";
import { LiveLessonPage } from "@/components/lms/LiveLesson";

export const metadata: Metadata = { title: "Classroom", robots: { index: false, follow: false } };

export default function Page() {
  return <LiveLessonPage standalone />;
}
