import type { Metadata } from "next";
import { LmsTrackerPage } from "@/components/tracker/LmsTrackerPage";

export const metadata: Metadata = { title: "Assessment Tracker", robots: { index: false, follow: false } };

export default function Page() {
  return <LmsTrackerPage />;
}
