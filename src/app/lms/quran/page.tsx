import type { Metadata } from "next";
import { QuranHomeworkPage } from "@/components/lms/mods/QuranHomework";

export const metadata: Metadata = { title: "Quran Homework", robots: { index: false, follow: false } };

export default function Page() {
  return <QuranHomeworkPage />;
}
