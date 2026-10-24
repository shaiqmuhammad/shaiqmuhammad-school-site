import type { Metadata } from "next";
import { TimetablePage } from "@/components/lms/Timetable";

export const metadata: Metadata = { title: "Timetable", robots: { index: false, follow: false } };

export default function Page() {
  return <TimetablePage />;
}
