import type { Metadata } from "next";
import { LmsPointsPage } from "@/components/lms/LmsClasses";

export const metadata: Metadata = { title: "Points report", robots: { index: false, follow: false } };

export default function Page() {
  return <LmsPointsPage />;
}
