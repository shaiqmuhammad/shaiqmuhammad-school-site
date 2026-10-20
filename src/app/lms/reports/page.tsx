import type { Metadata } from "next";
import { LmsReportsPage } from "@/components/reports/LmsReportsPage";

export const metadata: Metadata = { title: "Department Report", robots: { index: false, follow: false } };

export default function Page() {
  return <LmsReportsPage />;
}
