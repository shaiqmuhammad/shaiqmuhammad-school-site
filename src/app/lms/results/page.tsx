import type { Metadata } from "next";
import { LmsResultsPage } from "@/components/lms/LmsClasses";

export const metadata: Metadata = { title: "Assessment results", robots: { index: false, follow: false } };

export default function Page() {
  return <LmsResultsPage />;
}
