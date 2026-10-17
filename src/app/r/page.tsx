import type { Metadata } from "next";
import { Suspense } from "react";
import { ReportPage } from "@/components/lms/ReportPage";

export const metadata: Metadata = { title: "Report", robots: { index: false, follow: false, nocache: true }, referrer: "no-referrer" };

export default function Page() {
  return (
    <Suspense fallback={null}>
      <ReportPage />
    </Suspense>
  );
}
